import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';

interface MockToken {
  id: string;
  name: string;
  actor: { id: string; name: string };
  document: { id: string; actorId: string; name: string };
  setTarget: ReturnType<typeof vi.fn>;
}

function createToken(id: string, name: string, actorId: string, actorName = name): MockToken {
  return {
    id,
    name,
    actor: { id: actorId, name: actorName },
    document: { id, actorId, name },
    setTarget: vi.fn().mockResolvedValue(undefined),
  };
}

function setupFoundry(
  options: { tokens?: MockToken[]; controlled?: MockToken[]; scene?: boolean } = {}
) {
  const itemUse = vi.fn().mockResolvedValue(undefined);
  const item = {
    id: 'item-1',
    name: 'Shadow Dive',
    type: 'feat',
    use: itemUse,
  };
  const actor = {
    id: 'actor-1',
    name: 'Kai Veyl',
    items: [item],
  };
  const actors = Object.assign([actor], {
    get: (identifier: string) => (identifier === actor.id ? actor : undefined),
    getName: (identifier: string) => (identifier === actor.name ? actor : undefined),
  });
  const tokens = options.tokens ?? [];
  const scene =
    options.scene === false
      ? undefined
      : {
          id: 'scene-1',
          tokens: tokens.map(token => ({ object: token })),
        };
  const scenes = Object.assign(scene ? [scene] : [], { active: scene });
  const updateTokenTargets = vi.fn();

  vi.stubGlobal('Hooks', { on: vi.fn() });
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'world-1' },
    user: { id: 'user-1', name: 'GM', updateTokenTargets },
    system: { id: 'dnd5e' },
    actors,
    scenes,
  });
  vi.stubGlobal('canvas', {
    scene,
    tokens: {
      placeables: tokens,
      controlled: options.controlled ?? [],
    },
  });

  return {
    actor,
    itemUse,
    updateTokenTargets,
    dataAccess: new FoundryDataAccess(),
  };
}

describe('FoundryDataAccess.useItem targeting', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('leaves current targets unchanged when targets are omitted', async () => {
    const target = createToken('target-1', 'Goblin', 'actor-2');
    const { dataAccess, itemUse, updateTokenTargets } = setupFoundry({ tokens: [target] });

    const result = await dataAccess.useItem({
      actorIdentifier: 'Kai Veyl',
      itemIdentifier: 'Shadow Dive',
    });

    expect(target.setTarget).not.toHaveBeenCalled();
    expect(updateTokenTargets).not.toHaveBeenCalled();
    expect(itemUse).toHaveBeenCalledOnce();
    expect(result.targeting).toEqual({
      status: 'not-requested',
      requested: [],
      applied: [],
      unresolved: [],
      failed: [],
    });
  });

  it('resolves self to a controlled token for the acting actor', async () => {
    const firstToken = createToken('actor-token-a', 'Kai A', 'actor-1', 'Kai Veyl');
    const controlledToken = createToken('actor-token-b', 'Kai B', 'actor-1', 'Kai Veyl');
    const laterControlledToken = createToken('actor-token-z', 'Kai Z', 'actor-1', 'Kai Veyl');
    const { dataAccess, itemUse } = setupFoundry({
      tokens: [firstToken, laterControlledToken, controlledToken],
      controlled: [laterControlledToken, controlledToken],
    });

    const result = await dataAccess.useItem({
      actorIdentifier: 'Kai Veyl',
      itemIdentifier: 'Shadow Dive',
      targets: ['self'],
    });

    expect(firstToken.setTarget).not.toHaveBeenCalled();
    expect(laterControlledToken.setTarget).not.toHaveBeenCalled();
    expect(controlledToken.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(itemUse).toHaveBeenCalledOnce();
    expect(result.targeting.status).toBe('applied');
    expect(result.targeting.applied).toEqual([
      { identifier: 'self', tokenId: 'actor-token-b', tokenName: 'Kai B' },
    ]);
  });

  it('targets an explicit token by ID through Token#setTarget', async () => {
    const target = createToken('target-1', 'Goblin', 'actor-2');
    const { dataAccess, updateTokenTargets } = setupFoundry({ tokens: [target] });

    const result = await dataAccess.useItem({
      actorIdentifier: 'Kai Veyl',
      itemIdentifier: 'Shadow Dive',
      targets: ['target-1'],
    });

    expect(target.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(updateTokenTargets).not.toHaveBeenCalled();
    expect(result.targets).toEqual(['Goblin']);
    expect(result.targeting.status).toBe('applied');
  });

  it('releases previous targets once before applying multiple targets', async () => {
    const goblin = createToken('target-1', 'Goblin', 'actor-2');
    const orc = createToken('target-2', 'Orc', 'actor-3');
    const { dataAccess } = setupFoundry({ tokens: [goblin, orc] });

    const result = await dataAccess.useItem({
      actorIdentifier: 'Kai Veyl',
      itemIdentifier: 'Shadow Dive',
      targets: ['Orc', 'Goblin'],
    });

    expect(orc.setTarget).toHaveBeenCalledOnce();
    expect(goblin.setTarget).toHaveBeenCalledOnce();
    expect(orc.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(goblin.setTarget).toHaveBeenCalledWith(true, { releaseOthers: false });
    expect(result.targeting.status).toBe('applied');
    expect(result.targeting.applied.map(target => target.tokenName)).toEqual(['Orc', 'Goblin']);
  });

  it('reports an unresolved target and still initiates item use', async () => {
    const { dataAccess, itemUse } = setupFoundry();

    const result = await dataAccess.useItem({
      actorIdentifier: 'Kai Veyl',
      itemIdentifier: 'Shadow Dive',
      targets: ['Missing Target'],
    });

    expect(itemUse).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.status).toBe('initiated');
    expect(result.targeting.status).toBe('failed');
    expect(result.targeting.unresolved).toEqual(['Missing Target']);
    expect(result.warnings).toEqual([
      'Target "Missing Target" was not found on the current canvas.',
    ]);
  });

  it('reports partial targeting when only some requested targets resolve', async () => {
    const goblin = createToken('target-1', 'Goblin', 'actor-2');
    const { dataAccess, itemUse } = setupFoundry({ tokens: [goblin] });

    const result = await dataAccess.useItem({
      actorIdentifier: 'Kai Veyl',
      itemIdentifier: 'Shadow Dive',
      targets: ['Goblin', 'Missing Target'],
    });

    expect(goblin.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(itemUse).toHaveBeenCalledOnce();
    expect(result.targeting.status).toBe('partial');
    expect(result.targeting.unresolved).toEqual(['Missing Target']);
  });

  it('reports a Token#setTarget failure without crashing item use', async () => {
    const target = createToken('target-1', 'Goblin', 'actor-2');
    target.setTarget.mockRejectedValue(new Error('Target API unavailable'));
    const { dataAccess, itemUse } = setupFoundry({ tokens: [target] });

    const result = await dataAccess.useItem({
      actorIdentifier: 'Kai Veyl',
      itemIdentifier: 'Shadow Dive',
      targets: ['Goblin'],
    });

    expect(target.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(itemUse).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.status).toBe('initiated');
    expect(result.targeting.status).toBe('failed');
    expect(result.targeting.failed).toEqual([
      {
        identifier: 'Goblin',
        tokenId: 'target-1',
        tokenName: 'Goblin',
        error: 'Target API unavailable',
      },
    ]);
    expect(result.warnings).toEqual(['Failed to target "Goblin": Target API unavailable']);
  });

  it('keeps releaseOthers true until a target is successfully applied', async () => {
    const goblin = createToken('target-1', 'Goblin', 'actor-2');
    const orc = createToken('target-2', 'Orc', 'actor-3');
    goblin.setTarget.mockRejectedValue(new Error('Target API unavailable'));
    const { dataAccess, itemUse } = setupFoundry({ tokens: [goblin, orc] });

    const result = await dataAccess.useItem({
      actorIdentifier: 'Kai Veyl',
      itemIdentifier: 'Shadow Dive',
      targets: ['Goblin', 'Orc'],
    });

    expect(goblin.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(orc.setTarget).toHaveBeenCalledWith(true, { releaseOthers: true });
    expect(itemUse).toHaveBeenCalledOnce();
    expect(result.targeting.status).toBe('partial');
    expect(result.targeting.applied).toEqual([
      { identifier: 'Orc', tokenId: 'target-2', tokenName: 'Orc' },
    ]);
    expect(result.targeting.failed).toEqual([
      {
        identifier: 'Goblin',
        tokenId: 'target-1',
        tokenName: 'Goblin',
        error: 'Target API unavailable',
      },
    ]);
  });
});
