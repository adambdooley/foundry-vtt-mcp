import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';

const ACTIVITY_ID = 'aaaaaaaaaaaaaaaa';

function createActivitySystem() {
  return {
    activities: {
      [ACTIVITY_ID]: {
        _id: ACTIVITY_ID,
        type: 'save',
        activation: { type: 'action', value: 1 },
        save: {
          ability: ['wis'],
          dc: {
            calculation: '',
            formula: '10 + @abilities.int.mod + @prof',
          },
        },
      },
    },
    description: { value: 'Adjacent system data.' },
  };
}

function makeDataAccess(): FoundryDataAccess {
  return Object.create(FoundryDataAccess.prototype) as FoundryDataAccess;
}

describe('FoundryDataAccess save-field sanitization', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves Activity save configuration through getCharacterEntity', async () => {
    const system = createActivitySystem();
    const item = {
      id: 'item-1',
      name: 'Saving Throw Feature',
      type: 'feat',
      img: 'icons/feat.svg',
      system,
      effects: { contents: [] },
      toObject: () => ({
        _id: 'item-1',
        name: 'Saving Throw Feature',
        type: 'feat',
        img: 'icons/feat.svg',
        system,
        effects: [],
      }),
    };
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

    expect(result.entity.system.activities[ACTIVITY_ID].save).toEqual({
      ability: ['wis'],
      dc: {
        calculation: '',
        formula: '10 + @abilities.int.mod + @prof',
      },
    });
    expect(result.entity.system.activities[ACTIVITY_ID].activation).toEqual({
      type: 'action',
      value: 1,
    });
  });

  it('preserves Activity save configuration through getCompendiumDocumentFull', async () => {
    const system = createActivitySystem();
    const document = {
      id: 'item-1',
      name: 'Compendium Saving Throw Feature',
      type: 'feat',
      img: 'icons/feat.svg',
      system,
      toObject: () => ({
        _id: 'item-1',
        name: 'Compendium Saving Throw Feature',
        type: 'feat',
        img: 'icons/feat.svg',
        system,
      }),
    };
    const pack = {
      metadata: { label: 'Test Items' },
      getDocument: vi.fn().mockResolvedValue(document),
    };

    vi.stubGlobal('game', {
      system: { id: 'dnd5e' },
      packs: { get: (id: string) => (id === 'test.items' ? pack : undefined) },
    });

    const result = await makeDataAccess().getCompendiumDocumentFull('test.items', document.id);

    expect((result.system as any).activities[ACTIVITY_ID].save.ability).toEqual(['wis']);
    expect((result.system as any).activities[ACTIVITY_ID].save.dc).toEqual({
      calculation: '',
      formula: '10 + @abilities.int.mod + @prof',
    });
    expect((result.fullData as any).system.activities[ACTIVITY_ID].save).toEqual(
      (result.system as any).activities[ACTIVITY_ID].save
    );
    expect((result.system as any).description).toEqual({ value: 'Adjacent system data.' });
  });

  it('still excludes the deprecated dnd5e ability save accessor without reading it', async () => {
    const deprecatedSaveGetter = vi.fn(() => ({ value: 5 }));
    const dexterity = { mod: 3 } as Record<string, unknown>;
    Object.defineProperty(dexterity, 'save', {
      enumerable: true,
      get: deprecatedSaveGetter,
    });
    const actor = {
      id: 'actor00000000001',
      name: 'Test Character',
      type: 'character',
      system: {
        abilities: { dex: dexterity },
        attributes: { prof: 2 },
      },
      items: [],
      effects: [],
    };

    vi.stubGlobal('game', {
      system: { id: 'dnd5e' },
      actors: {
        get: (id: string) => (id === actor.id ? actor : undefined),
        find: (predicate: (candidate: typeof actor) => boolean) =>
          predicate(actor) ? actor : undefined,
      },
    });

    const result = await makeDataAccess().getCharacterInfo(actor.id);

    expect((result.system as any).abilities.dex).toEqual({ mod: 3 });
    expect((result.system as any).abilities.dex).not.toHaveProperty('save');
    expect((result.system as any).attributes).toEqual({ prof: 2 });
    expect(deprecatedSaveGetter).not.toHaveBeenCalled();
  });
});
