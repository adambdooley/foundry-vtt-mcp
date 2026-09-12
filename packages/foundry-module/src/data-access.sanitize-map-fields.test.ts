import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';

// Regression coverage for the read-path bug found while investigating a
// false-positive "system.activities empty" report from update-items: the
// generic sanitizer used by getCharacterInfo (which backs get-character and,
// transitively, get-character-entity) walked Item#system via Object.keys(),
// which returns [] for a Map-like value. dnd5e's Item#system.activities is a
// Foundry Collection, which extends Map, so every Activity — old or newly
// created — was silently serialized as {} on every read through this path,
// independent of whether update-items ever wrote anything correctly.

function createDnd5eActor(activities: Map<string, unknown>) {
  const item = {
    id: 'item-1',
    name: 'Feature With Activities',
    type: 'feat',
    img: 'icons/feat.svg',
    system: {
      activities,
      description: { value: 'A feature.' },
    },
    toObject() {
      return {
        _id: this.id,
        name: this.name,
        type: this.type,
        img: this.img,
        system: this.system,
        effects: [],
      };
    },
  };

  const actor = {
    id: 'actor-1',
    name: 'Test Character',
    type: 'character',
    img: 'icons/actor.svg',
    system: {},
    items: [item],
    effects: [] as any[],
  };

  return { actor, item };
}

function setup(actor: ReturnType<typeof createDnd5eActor>['actor']) {
  vi.stubGlobal('game', {
    actors: {
      get: (id: string) => (id === actor.id ? actor : undefined),
      find: (predicate: (candidate: any) => boolean) => (predicate(actor) ? actor : undefined),
    },
    system: { id: 'dnd5e' },
    user: { name: 'GM', id: 'user-1' },
    world: { id: 'test-world' },
  });

  return Object.create(FoundryDataAccess.prototype) as FoundryDataAccess;
}

describe('FoundryDataAccess.getCharacterInfo — Map-shaped system fields', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('serializes a Collection/Map-backed Activities field instead of collapsing it to {}', async () => {
    const activities = new Map([
      ['aaaaaaaaaaaaaaaa', { _id: 'aaaaaaaaaaaaaaaa', type: 'utility', name: 'Existing Activity' }],
    ]);
    const { actor } = createDnd5eActor(activities);
    const dataAccess = setup(actor);

    const result = await dataAccess.getCharacterInfo('Test Character');

    expect(result.items).toHaveLength(1);
    expect((result.items[0].system as any).activities).toEqual({
      aaaaaaaaaaaaaaaa: { _id: 'aaaaaaaaaaaaaaaa', type: 'utility', name: 'Existing Activity' },
    });
  });

  it('serializes multiple Activities and preserves plain nested object fields', async () => {
    const activities = new Map([
      ['aaaaaaaaaaaaaaaa', { _id: 'aaaaaaaaaaaaaaaa', type: 'utility', name: 'First' }],
      ['bbbbbbbbbbbbbbbb', { _id: 'bbbbbbbbbbbbbbbb', type: 'attack', name: 'Second' }],
    ]);
    const { actor } = createDnd5eActor(activities);
    const dataAccess = setup(actor);

    const result = await dataAccess.getCharacterInfo('Test Character');

    const serializedActivities = (result.items[0].system as any).activities;
    expect(Object.keys(serializedActivities)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
    expect(serializedActivities.bbbbbbbbbbbbbbbb.type).toBe('attack');
    // A genuinely plain nested object elsewhere in system must still serialize normally.
    expect((result.items[0].system as any).description).toEqual({ value: 'A feature.' });
  });

  it('serializes an empty Activities Collection as an empty object, not by accident', async () => {
    const { actor } = createDnd5eActor(new Map());
    const dataAccess = setup(actor);

    const result = await dataAccess.getCharacterInfo('Test Character');

    expect((result.items[0].system as any).activities).toEqual({});
  });

  it('still recursively sanitizes sensitive fields nested inside a Map value', async () => {
    // Guards against fixing the Map/{} bug by only shallow-converting Map entries
    // (e.g. Object.fromEntries) without re-running removeSensitiveFields on each
    // value — that would stop entries from collapsing to {} but let anything
    // sensitive nested inside them pass through unsanitized.
    const activities = new Map([
      [
        'aaaaaaaaaaaaaaaa',
        {
          _id: 'aaaaaaaaaaaaaaaa',
          type: 'utility',
          name: 'Existing Activity',
          secret: 'should-be-stripped',
        },
      ],
    ]);
    const { actor } = createDnd5eActor(activities);
    const dataAccess = setup(actor);

    const result = await dataAccess.getCharacterInfo('Test Character');

    const serializedActivity = (result.items[0].system as any).activities.aaaaaaaaaaaaaaaa;
    // 1. The Map entry itself is no longer collapsed to {} (the original bug).
    expect(serializedActivity).toBeDefined();
    expect(serializedActivity.name).toBe('Existing Activity');
    // 2. The sensitive nested field is still stripped (recursive sanitization).
    expect(serializedActivity).not.toHaveProperty('secret');
  });
});
