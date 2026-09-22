import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';

function createAdvancementSource() {
  return {
    itemGrant0000001: {
      _id: 'itemGrant0000001',
      type: 'ItemGrant',
      level: 1,
      configuration: {
        items: [
          {
            uuid: 'Compendium.dnd5e.classfeatures.Item.ActionSurge',
            optional: false,
          },
        ],
        optional: false,
      },
      value: { added: { feature1: 'Item.ActionSurge' } },
    },
    hitPoints0000001: {
      _id: 'hitPoints0000001',
      type: 'HitPoints',
      level: 1,
      configuration: {},
      value: { '1': 'max', '2': 6 },
    },
    trait0000000001: {
      _id: 'trait0000000001',
      type: 'Trait',
      level: 1,
      configuration: {
        mode: 'default',
        grants: ['saves:str'],
        choices: [{ count: 2, pool: ['skills:acr', 'skills:ath'] }],
      },
      value: {
        chosen: ['skills:ath'],
        secret: 'must not be exposed',
      },
    },
  };
}

function createItemDocument() {
  const advancement = createAdvancementSource();
  const sourceSystem = {
    advancement,
    identifier: 'fighter',
    levels: 1,
  };

  // Model the prepared dnd5e value as a collection with a parent cycle. Detailed
  // reads must use the plain toObject source instead of traversing this live graph.
  const liveAdvancement: Record<string, unknown> = { collectionName: 'advancement' };
  const liveSystem: Record<string, unknown> = { identifier: 'fighter', levels: 1 };
  liveAdvancement.parent = liveSystem;
  const getLiveAdvancement = vi.fn(() => liveAdvancement);
  Object.defineProperty(liveSystem, 'advancement', {
    enumerable: true,
    get: getLiveAdvancement,
  });

  return {
    id: 'item-1',
    name: 'Fighter',
    type: 'class',
    img: 'icons/fighter.svg',
    system: liveSystem,
    getLiveAdvancement,
    effects: [],
    toObject: () => ({
      _id: 'item-1',
      name: 'Fighter',
      type: 'class',
      img: 'icons/fighter.svg',
      system: sourceSystem,
      effects: [],
    }),
  };
}

function makeDataAccess(): FoundryDataAccess {
  return Object.create(FoundryDataAccess.prototype) as FoundryDataAccess;
}

describe('FoundryDataAccess Advancement sanitization', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns complete serialized Advancement data through getCharacterEntity', async () => {
    const item = createItemDocument();
    const actor = {
      id: 'actor-1',
      name: 'Test Character',
      items: { contents: [item] },
      effects: { contents: [] },
      system: {},
    };

    vi.stubGlobal('game', {
      ready: true,
      world: { id: 'world-1' },
      user: { id: 'user-1', name: 'GM' },
      system: { id: 'dnd5e' },
      actors: { contents: [actor] },
    });

    const result = await makeDataAccess().getCharacterEntity({
      characterIdentifier: actor.id,
      entityIdentifier: item.id,
    });
    const advancement = result.entity.system.advancement;

    expect(Object.keys(advancement)).toEqual([
      'itemGrant0000001',
      'hitPoints0000001',
      'trait0000000001',
    ]);
    expect(advancement.itemGrant0000001.configuration.items).toEqual([
      {
        uuid: 'Compendium.dnd5e.classfeatures.Item.ActionSurge',
        optional: false,
      },
    ]);
    expect(advancement.hitPoints0000001.value).toEqual({ '1': 'max', '2': 6 });
    expect(advancement.trait0000000001.configuration.choices).toEqual([
      { count: 2, pool: ['skills:acr', 'skills:ath'] },
    ]);
    expect(advancement.trait0000000001.value).toEqual({ chosen: ['skills:ath'] });
    expect(result.entity.system.identifier).toBe('fighter');
    expect(item.getLiveAdvancement).not.toHaveBeenCalled();
  });

  it('returns serialized Advancement in both compendium system views without following live cycles', async () => {
    const document = createItemDocument();
    const pack = {
      metadata: { label: 'Classes' },
      getDocument: vi.fn().mockResolvedValue(document),
    };

    vi.stubGlobal('game', {
      system: { id: 'dnd5e' },
      packs: { get: (id: string) => (id === 'dnd5e.classes' ? pack : undefined) },
    });

    const result = await makeDataAccess().getCompendiumDocumentFull('dnd5e.classes', document.id);
    const systemAdvancement = (result.system as any).advancement;
    const fullDataAdvancement = (result.fullData as any).system.advancement;

    expect(systemAdvancement).toEqual(fullDataAdvancement);
    expect(Object.keys(systemAdvancement)).toHaveLength(3);
    expect(systemAdvancement.itemGrant0000001.type).toBe('ItemGrant');
    expect(systemAdvancement.hitPoints0000001.type).toBe('HitPoints');
    expect(systemAdvancement.trait0000000001.type).toBe('Trait');
    expect(systemAdvancement.trait0000000001.value).not.toHaveProperty('secret');
    expect((result.system as any).identifier).toBe('fighter');
    expect(document.getLiveAdvancement).not.toHaveBeenCalled();
  });
});
