import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from '../../../foundry-module/src/data-access.js';
import { CharacterTools } from './character.js';

const actorEffect = {
  id: 'actor-effect-id',
  name: 'Actor Effect',
  toObject: () => ({
    _id: 'actor-effect-id',
    name: 'Actor Effect',
    description: 'Actor-owned effect',
    disabled: false,
    changes: [{ key: 'system.attributes.ac.bonus', value: '1' }],
  }),
};

const itemEffect = {
  id: 'x9OMIlFjG5VoBsis',
  name: 'MCP Test Effect',
  toObject: () => ({
    _id: 'x9OMIlFjG5VoBsis',
    name: 'MCP Test Effect',
    description: 'Item-owned effect',
    disabled: false,
    changes: [{ key: 'system.bonuses.mwak.attack', value: '1' }],
  }),
};

const item = {
  id: 'KYgn8Ax3JVmCb3WL',
  name: 'MCP Test Feature',
  type: 'feat',
  img: 'icons/test-feature.webp',
  effects: { contents: [itemEffect] },
  toObject: () => ({
    _id: 'KYgn8Ax3JVmCb3WL',
    name: 'MCP Test Feature',
    type: 'feat',
    img: 'icons/test-feature.webp',
    system: {
      description: { value: 'Test feature description' },
      activities: { activityId: { type: 'utility' } },
    },
    effects: [itemEffect.toObject()],
  }),
};

const actor = {
  id: 'YZk06eI9NHTN9PuN',
  name: 'MCP Test Actor',
  system: { actions: [] },
  items: { contents: [item] },
  effects: { contents: [actorEffect] },
};

function makeDataAccess(): FoundryDataAccess {
  return new FoundryDataAccess();
}

function makeCharacterTools(queryResult: unknown) {
  const query = vi.fn(async () => queryResult);
  const logger: any = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => logger };
  const tools = new CharacterTools({ foundryClient: { query } as any, logger });
  return { tools, query };
}

beforeEach(() => {
  vi.stubGlobal('Hooks', { on: vi.fn() });
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'test-world' },
    user: { id: 'gm', isGM: true },
    actors: { contents: [actor] },
  });
});

describe('FoundryDataAccess.getCharacterEntity', () => {
  it('resolves an actor-owned effect by exact case-insensitive name', async () => {
    const result = await makeDataAccess().getCharacterEntity({
      characterIdentifier: 'mcp test actor',
      entityIdentifier: 'actor effect',
    });

    expect(result.entityType).toBe('effect');
    expect(result.entity).toMatchObject({
      id: 'actor-effect-id',
      name: 'Actor Effect',
      description: 'Actor-owned effect',
      scope: 'actor',
    });
  });

  it('resolves an Item-owned effect by ID with parent metadata', async () => {
    const result = await makeDataAccess().getCharacterEntity({
      characterIdentifier: 'YZk06eI9NHTN9PuN',
      entityIdentifier: 'x9OMIlFjG5VoBsis',
    });

    expect(result.entityType).toBe('effect');
    expect(result.entity).toMatchObject({
      id: 'x9OMIlFjG5VoBsis',
      name: 'MCP Test Effect',
      description: 'Item-owned effect',
      scope: 'item',
      parentItemId: 'KYgn8Ax3JVmCb3WL',
      parentItemName: 'MCP Test Feature',
    });
  });

  it('still resolves a normal Item and serializes its system and effects', async () => {
    const result = await makeDataAccess().getCharacterEntity({
      characterIdentifier: 'MCP Test Actor',
      entityIdentifier: 'mcp test feature',
    });

    expect(result.entityType).toBe('item');
    expect(result.entity.id).toBe('KYgn8Ax3JVmCb3WL');
    expect(result.entity.system.activities).toEqual({ activityId: { type: 'utility' } });
    expect(result.entity.effects).toEqual([itemEffect.toObject()]);
  });
});

describe('CharacterTools.handleGetCharacterEntity', () => {
  it('uses the direct Foundry query and preserves Item-owned effect metadata', async () => {
    const queryResult = {
      success: true,
      entityType: 'effect',
      entity: {
        id: 'x9OMIlFjG5VoBsis',
        name: 'MCP Test Effect',
        description: 'Item-owned effect',
        scope: 'item',
        parentItemId: 'KYgn8Ax3JVmCb3WL',
        parentItemName: 'MCP Test Feature',
      },
    };
    const { tools, query } = makeCharacterTools(queryResult);

    const result = await tools.handleGetCharacterEntity({
      characterIdentifier: 'MCP Test Actor',
      entityIdentifier: 'x9OMIlFjG5VoBsis',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.getCharacterEntity', {
      characterIdentifier: 'MCP Test Actor',
      entityIdentifier: 'x9OMIlFjG5VoBsis',
    });
    expect(result).toMatchObject({
      entityType: 'effect',
      id: 'x9OMIlFjG5VoBsis',
      scope: 'item',
      parentItemId: 'KYgn8Ax3JVmCb3WL',
      parentItemName: 'MCP Test Feature',
    });
  });
});
