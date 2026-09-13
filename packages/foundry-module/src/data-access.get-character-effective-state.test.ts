import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';

const ACTOR_ID = 'actor00000000001';
const TOKEN_ID = 'token00000000001';
const SCENE_ID = 'scene00000000001';

function createEffect(id: string, name: string) {
  return {
    id,
    name,
    icon: 'icons/effect.svg',
    disabled: false,
    duration: { units: 'rounds', remaining: 5 },
    _source: { duration: { type: 'rounds', duration: 10 } },
  };
}

function createActor(options: {
  dexterity: number;
  effects?: ReturnType<typeof createEffect>[];
  name?: string;
}) {
  const sourceSystem = {
    abilities: { dex: { value: 14, mod: 2 } },
    attributes: {},
  };
  const toObject = vi.fn(() => ({
    _id: ACTOR_ID,
    name: options.name ?? 'Test Actor',
    type: 'character',
    system: sourceSystem,
    items: [],
    effects: [],
  }));

  return {
    id: ACTOR_ID,
    name: options.name ?? 'Test Actor',
    type: 'character',
    img: 'icons/actor.svg',
    system: {
      abilities: {
        dex: {
          value: options.dexterity,
          mod: Math.floor((options.dexterity - 10) / 2),
        },
      },
      attributes: {},
    },
    _source: { system: sourceSystem },
    toObject,
    items: [] as any[],
    effects: options.effects ?? [],
  };
}

type ActorMock = ReturnType<typeof createActor>;

function createToken(id: string, actor: ActorMock) {
  return {
    id,
    documentName: 'Token',
    actorId: actor.id,
    actorLink: false,
    actor,
    parent: undefined as any,
  };
}

function createScene(id: string, tokens: ReturnType<typeof createToken>[]) {
  const scene = {
    id,
    tokens: Object.assign(tokens, {
      get: (tokenId: string) => tokens.find(token => token.id === tokenId),
    }),
  };
  tokens.forEach(token => {
    token.parent = scene;
  });
  return scene;
}

function setup(baseActor: ActorMock, scenes: ReturnType<typeof createScene>[] = []) {
  const actors = Object.assign([baseActor], {
    get: (id: string) => (id === baseActor.id ? baseActor : undefined),
    find: (predicate: (actor: ActorMock) => boolean) =>
      predicate(baseActor) ? baseActor : undefined,
  });

  vi.stubGlobal('game', {
    system: { id: 'dnd5e' },
    actors,
    scenes,
  });

  return Object.create(FoundryDataAccess.prototype) as FoundryDataAccess;
}

describe('FoundryDataAccess.getCharacterInfo effective Actor state', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the world Actor by ID with its effective prepared system and metadata', async () => {
    const actor = createActor({ dexterity: 16 });
    const dataAccess = setup(actor);

    expect(actor._source.system.abilities.dex.value).toBe(14);
    expect(actor.toObject().system.abilities.dex.value).toBe(14);
    actor.toObject.mockClear();

    const result = await dataAccess.getCharacterInfo(ACTOR_ID);

    expect((result.system as any).abilities.dex.value).toBe(16);
    expect((result.system as any).abilities.dex.mod).toBe(3);
    expect(actor.toObject).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: ACTOR_ID,
      actorId: ACTOR_ID,
      isToken: false,
    });
    expect(result).not.toHaveProperty('tokenId');
    expect(result).not.toHaveProperty('sceneId');
  });

  it('preserves exact case-insensitive world Actor name lookup', async () => {
    const actor = createActor({ dexterity: 15, name: 'Test Actor' });

    const result = await setup(actor).getCharacterInfo('tEsT aCtOr');

    expect(result.name).toBe('Test Actor');
    expect((result.system as any).abilities.dex.value).toBe(15);
    expect(result.isToken).toBe(false);
  });

  it('resolves a shared Actor ID to the base world Actor, not its synthetic token Actor', async () => {
    const baseActor = createActor({ dexterity: 14, effects: [] });
    const syntheticEffect = createEffect('effect0000000001', 'Summon Dexterity');
    const syntheticActor = createActor({ dexterity: 16, effects: [syntheticEffect] });
    const scene = createScene(SCENE_ID, [createToken(TOKEN_ID, syntheticActor)]);

    const result = await setup(baseActor, [scene]).getCharacterInfo(ACTOR_ID);

    expect(syntheticActor.id).toBe(baseActor.id);
    expect((result.system as any).abilities.dex.value).toBe(14);
    expect(result.effects).toEqual([]);
    expect(result.isToken).toBe(false);
  });

  it('resolves a unique Token ID to its synthetic Actor and returns representation metadata', async () => {
    const baseActor = createActor({ dexterity: 14 });
    const syntheticEffect = createEffect('effect0000000001', 'Summon Dexterity');
    const syntheticActor = createActor({ dexterity: 16, effects: [syntheticEffect] });
    const scene = createScene(SCENE_ID, [createToken(TOKEN_ID, syntheticActor)]);

    const result = await setup(baseActor, [scene]).getCharacterInfo(TOKEN_ID);

    expect(result).toMatchObject({
      id: ACTOR_ID,
      actorId: ACTOR_ID,
      tokenId: TOKEN_ID,
      sceneId: SCENE_ID,
      isToken: true,
    });
    expect((result.system as any).abilities.dex.value).toBe(16);
    expect(result.effects).toEqual([
      expect.objectContaining({ id: syntheticEffect.id, name: syntheticEffect.name }),
    ]);
  });

  it('rejects an ambiguous bare Token ID across Scenes', async () => {
    const baseActor = createActor({ dexterity: 14 });
    const firstScene = createScene(SCENE_ID, [
      createToken(TOKEN_ID, createActor({ dexterity: 16 })),
    ]);
    const secondScene = createScene('scene00000000002', [
      createToken(TOKEN_ID, createActor({ dexterity: 18 })),
    ]);

    await expect(
      setup(baseActor, [firstScene, secondScene]).getCharacterInfo(TOKEN_ID)
    ).rejects.toThrow(
      `Token ID "${TOKEN_ID}" is ambiguous across Scenes (${SCENE_ID}, scene00000000002); use a full Token UUID`
    );
  });

  it('resolves a full Token UUID exactly even when its bare Token ID is ambiguous', async () => {
    const baseActor = createActor({ dexterity: 14 });
    const firstScene = createScene(SCENE_ID, [
      createToken(TOKEN_ID, createActor({ dexterity: 16 })),
    ]);
    const secondToken = createToken(TOKEN_ID, createActor({ dexterity: 18 }));
    const secondScene = createScene('scene00000000002', [secondToken]);
    const tokenUuid = `Scene.${secondScene.id}.Token.${TOKEN_ID}`;
    const fromUuid = vi.fn(async (uuid: string) => (uuid === tokenUuid ? secondToken : undefined));
    vi.stubGlobal('fromUuid', fromUuid);

    const result = await setup(baseActor, [firstScene, secondScene]).getCharacterInfo(tokenUuid);

    expect(fromUuid).toHaveBeenCalledWith(tokenUuid);
    expect((result.system as any).abilities.dex.value).toBe(18);
    expect(result).toMatchObject({
      id: ACTOR_ID,
      actorId: ACTOR_ID,
      tokenId: TOKEN_ID,
      sceneId: secondScene.id,
      isToken: true,
    });
  });

  it('falls back to exact scene/token lookup when fromUuid is unavailable', async () => {
    const baseActor = createActor({ dexterity: 14 });
    const syntheticActor = createActor({ dexterity: 16 });
    const token = createToken(TOKEN_ID, syntheticActor);
    const scene = createScene(SCENE_ID, [token]);
    const tokenLookup = vi.spyOn(scene.tokens, 'get');
    const tokenUuid = `Scene.${SCENE_ID}.Token.${TOKEN_ID}`;
    vi.stubGlobal('fromUuid', undefined);

    const result = await setup(baseActor, [scene]).getCharacterInfo(tokenUuid);

    expect(tokenLookup).toHaveBeenCalledWith(TOKEN_ID);
    expect((result.system as any).abilities.dex.value).toBe(16);
    expect(result).toMatchObject({
      id: ACTOR_ID,
      actorId: ACTOR_ID,
      tokenId: TOKEN_ID,
      sceneId: SCENE_ID,
      isToken: true,
    });
  });

  it('rejects a full Token UUID which resolves to a different Document type', async () => {
    const baseActor = createActor({ dexterity: 14 });
    const tokenUuid = `Scene.${SCENE_ID}.Token.${TOKEN_ID}`;
    vi.stubGlobal(
      'fromUuid',
      vi.fn(async () => ({ documentName: 'Actor' }))
    );

    await expect(setup(baseActor).getCharacterInfo(tokenUuid)).rejects.toThrow(
      `UUID does not resolve to a TokenDocument: ${tokenUuid}`
    );
  });
});
