import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';

type ActivityData = {
  _id: string;
  name: string;
  type?: string;
  activation?: { type: string; value: number };
  preparedByPreCreate?: boolean;
  sort?: number;
};
type ItemSource = {
  _id: string;
  name: string;
  type: string;
  img?: string;
  system: { activities: Record<string, ActivityData>; [key: string]: any };
};
type ActorSource = {
  _id: string;
  name: string;
  type: string;
  items: ItemSource[];
};

const clone = <T>(value: T): T => structuredClone(value);

function directionalDiff(before: unknown, after: unknown): Record<string, any> {
  if (
    before === null ||
    after === null ||
    typeof before !== 'object' ||
    typeof after !== 'object' ||
    Array.isArray(before) ||
    Array.isArray(after)
  ) {
    return Object.is(before, after) ? {} : { value: clone(after) };
  }

  const result: Record<string, any> = {};
  for (const [key, afterValue] of Object.entries(after)) {
    if (!Object.prototype.hasOwnProperty.call(before, key)) {
      result[key] = clone(afterValue);
      continue;
    }

    const nested = directionalDiff((before as Record<string, any>)[key], afterValue);
    if (Object.keys(nested).length > 0) result[key] = nested;
  }
  return result;
}

function mergePatch(target: Record<string, any>, patch: Record<string, any>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (key.startsWith('-=')) {
      delete target[key.slice(2)];
      continue;
    }

    if (key.includes('.')) {
      const [head, ...rest] = key.split('.');
      target[head] ??= {};
      mergePatch(target[head], { [rest.join('.')]: value });
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] ??= {};
      mergePatch(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

function applyDnd5eItemPatch(target: Record<string, any>, patch: Record<string, any>): void {
  const effectivePatch = clone(patch);
  if (
    effectivePatch.system &&
    typeof effectivePatch.system === 'object' &&
    !Array.isArray(effectivePatch.system) &&
    Object.prototype.hasOwnProperty.call(effectivePatch.system, 'activities')
  ) {
    // dnd5e 6.0.x ignores a nested Activity map during Item persistence.
    delete effectivePatch.system.activities;
    if (Object.keys(effectivePatch.system).length === 0) delete effectivePatch.system;
  }
  mergePatch(target, effectivePatch);
}

function validateActivities(itemId: string, source: ItemSource): void {
  for (const [key, activity] of Object.entries(source.system.activities)) {
    if (!/^[A-Za-z0-9]{16}$/.test(activity._id) || activity._id !== key) {
      throw new Error(
        `[Actor.actor-1.Item.${itemId}.Activity.${key}] validation errors: _id: must be a valid 16-character alphanumeric ID matching its object key`
      );
    }
  }
}

function createItem(
  id: string,
  name: string,
  activities: Record<string, ActivityData>,
  normalize?: (source: ItemSource) => void
) {
  let source: ItemSource = {
    _id: id,
    name,
    type: 'feat',
    system: { activities: clone(activities) },
  };
  let inspectionError: Error | undefined;

  const activityCollection = {
    get: (activityId: string) => {
      const activitySource = source.system.activities[activityId];
      if (!activitySource) return undefined;
      return {
        id: activityId,
        toObject: () => clone(activitySource),
      };
    },
    has: (activityId: string) => Boolean(source.system.activities[activityId]),
    get size() {
      return Object.keys(source.system.activities).length;
    },
    map: (callback: (activity: ActivityData) => unknown) =>
      Object.values(source.system.activities).map(callback),
  };

  const item = {
    id,
    get name() {
      return source.name;
    },
    get system() {
      return { ...source.system, activities: activityCollection };
    },
    toObject: vi.fn(() => {
      if (inspectionError) throw inspectionError;
      return clone(source);
    }),
    updateSource: vi.fn(() => {
      throw new Error('Live Item updateSource must not be used for preflight');
    }),
    update: vi.fn(async (changes: Record<string, any>) => {
      item.persist(changes);
      return item;
    }),
    createActivity: vi.fn(
      async (type: string, data: Record<string, any>, _options: { renderSheet?: boolean } = {}) => {
        const ActivityDocumentClass = (globalThis as any).CONFIG.DND5E.activityTypes[type]
          .documentClass;
        const createData = clone(data);
        const activity = new ActivityDocumentClass({ type, ...clone(data) }, { parent: item });
        if (activity._preCreate(createData) === false) return;
        const activitySource = activity.toObject();
        activitySource.sort = activityCollection.size * 100000;
        source.system.activities[activity.id] = clone(activitySource);
      }
    ),
    updateActivity: vi.fn(async (activityId: string, updates: Record<string, any>) => {
      const activitySource = source.system.activities[activityId];
      if (!activitySource) throw new Error(`Activity ${activityId} not found`);
      const candidate = clone(activitySource);
      mergePatch(candidate, updates);
      if (candidate._id !== activityId) throw new Error('Activity _id mismatch');
      source.system.activities[activityId] = candidate;
      return item;
    }),
    deleteActivity: vi.fn(async (activityId: string) => {
      delete source.system.activities[activityId];
      return item;
    }),
    persist(changes: Record<string, any>) {
      const candidate = clone(source);
      applyDnd5eItemPatch(candidate, changes);
      normalize?.(candidate);
      validateActivities(id, candidate);
      source = candidate;
    },
    normalizeSource(candidate: ItemSource) {
      normalize?.(candidate);
    },
    failInspection(error: Error) {
      inspectionError = error;
    },
  };

  return item;
}

function setup(items: ReturnType<typeof createItem>[]) {
  const itemMap = new Map(items.map(item => [item.id, item]));
  const actor = {
    id: 'actor-1',
    name: 'Test Actor',
    items: { get: (id: string) => itemMap.get(id) },
    toObject: vi.fn(
      (): ActorSource => ({
        _id: 'actor-1',
        name: 'Test Actor',
        type: 'character',
        items: items.map(item => item.toObject()),
      })
    ),
    updateEmbeddedDocuments: vi.fn(),
  };

  const ephemeralActors: ConfiguredActorDocument[] = [];
  const preflightActivityIds: string[] = [];

  class ConfiguredActivityDocument {
    source: ActivityData;
    parent: any;

    constructor(data: Partial<ActivityData>, context: Record<string, any>) {
      this.source = {
        _id: data._id ?? '',
        name: data.name ?? '',
        type: data.type,
        activation: { type: 'action', value: 1 },
        ...clone(data),
      };
      this.parent = context.parent;
      if (!/^[A-Za-z0-9]{16}$/.test(this.source._id) && context.strict !== false) {
        throw new Error(
          `Activity ${this.source._id} validation errors: _id: must be a valid 16-character alphanumeric ID`
        );
      }
    }

    get id() {
      return this.source._id;
    }

    _preCreate(createData: Record<string, any>) {
      if (this.parent?.source) preflightActivityIds.push(this.id);
      createData.preparedByPreCreate = true;
      this.source.preparedByPreCreate = true;
      return true;
    }

    updateSource(changes: Record<string, any>, options: Record<string, any>) {
      const candidate = clone(this.source);
      mergePatch(candidate, changes);
      if (!/^[A-Za-z0-9]{16}$/.test(candidate._id)) {
        throw new Error(
          `Activity ${candidate._id} validation errors: _id: must be a valid 16-character alphanumeric ID`
        );
      }
      const changed = directionalDiff(this.source, candidate);
      if (!options.dryRun) this.source = candidate;
      return changed;
    }

    toObject() {
      return clone(this.source);
    }
  }

  class ConfiguredActorDocument {
    source: ActorSource;
    context: Record<string, any>;
    initialValidationErrors: Error[] = [];
    validationFailure?: Error;
    items: { get: (id: string) => any };
    getEmbeddedDocument: (name: string, id: string, options?: { invalid?: boolean }) => any;

    constructor(source: ActorSource, context: Record<string, any>) {
      this.source = clone(source);
      this.context = context;
      const invalidItemIds = new Set<string>();
      for (const itemSource of this.source.items) {
        try {
          validateActivities(itemSource._id, itemSource);
        } catch (error) {
          this.initialValidationErrors.push(error as Error);
          if (context.strict !== false) throw error;
          if (context.dropInvalidEmbedded === true) invalidItemIds.add(itemSource._id);
        }
      }
      const ephemeralItems = new Map(
        this.source.items.map(itemSource => {
          const ephemeralItem: any = {
            id: itemSource._id,
            parent: this,
            source: itemSource,
            updateSource: vi.fn((changes: Record<string, any>, options: Record<string, any>) => {
              // This deliberately models dnd5e validation state retained by a
              // parent graph. Reusing this Actor would reproduce the live bug.
              if (this.validationFailure) throw this.validationFailure;

              const candidate = clone(itemSource);
              applyDnd5eItemPatch(candidate, changes);
              itemMap.get(itemSource._id)?.normalizeSource(candidate);
              const changed = JSON.stringify(candidate) !== JSON.stringify(itemSource);
              changes.__preflightProcessed = true;
              try {
                validateActivities(itemSource._id, candidate);
              } catch (error) {
                this.validationFailure = error as Error;
                throw error;
              }
              if (!options.dryRun) Object.assign(itemSource, candidate);
              return changed ? changes : {};
            }),
            toObject: vi.fn(() => clone(itemSource)),
          };
          const activities = new Map(
            Object.entries(itemSource.system.activities).map(([activityId, activitySource]) => [
              activityId,
              new ConfiguredActivityDocument(activitySource, {
                parent: ephemeralItem,
                strict: false,
              }),
            ])
          );
          ephemeralItem.system = {
            ...itemSource.system,
            activities: { get: (activityId: string) => activities.get(activityId) },
          };
          return [itemSource._id, ephemeralItem] as const;
        })
      );
      this.items = {
        get: (id: string) => (invalidItemIds.has(id) ? undefined : ephemeralItems.get(id)),
      };
      this.getEmbeddedDocument = (name, id, options) => {
        if (name !== 'Item') return undefined;
        if (invalidItemIds.has(id)) {
          return options?.invalid ? ephemeralItems.get(id) : undefined;
        }
        return this.items.get(id);
      };
      ephemeralActors.push(this);
    }
  }

  // Simulates Foundry's low-level DatabaseBackend "get" round trip, independent of the
  // client-cached `actor`/`item` references. By default it reflects the same ground-truth
  // `source` the rest of this mock treats as persisted, so ordinary tests see a genuine
  // independent confirmation. Individual tests can override `.get` to model a real-world
  // divergence between the client-cached model and what actually persisted server-side.
  const database = {
    get: vi.fn(async () => [{ toObject: () => actor.toObject() }]),
  };
  (ConfiguredActorDocument as any).database = database;

  vi.stubGlobal('game', {
    actors: {
      get: (id: string) => (id === actor.id ? actor : undefined),
      find: (predicate: (candidate: any) => boolean) => (predicate(actor) ? actor : undefined),
    },
    user: { id: 'user-1' },
  });
  vi.stubGlobal('foundry', {
    utils: {
      deepClone: clone,
      diffObject: directionalDiff,
    },
  });
  vi.stubGlobal('CONFIG', {
    Actor: { documentClass: ConfiguredActorDocument },
    DND5E: {
      activityTypes: {
        utility: { documentClass: ConfiguredActivityDocument },
      },
    },
  });

  const dataAccess = Object.create(FoundryDataAccess.prototype) as FoundryDataAccess;
  return { actor, dataAccess, ephemeralActors, preflightActivityIds, database };
}

const originalActivity = {
  AAAAAAAAAAAAAAAA: { _id: 'AAAAAAAAAAAAAAAA', name: 'Original' },
};

describe('FoundryDataAccess.updateActorItems', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a multi-Activity update with an invalid ID without persisting or changing the Item', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const before = item.toObject();
    const { actor, dataAccess, ephemeralActors } = setup([item]);

    const error = await dataAccess
      .updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              BBBBBBBBBBBBBBBB: {
                _id: 'BBBBBBBBBBBBBBBB',
                name: 'Valid One',
                type: 'utility',
              },
              CCCCCCCCCCCCCCCC: {
                _id: 'CCCCCCCCCCCCCCCC',
                name: 'Valid Two',
                type: 'utility',
              },
              invalid: { _id: 'invalid', name: 'Invalid', type: 'utility' },
            },
          },
        },
      ])
      .catch(error => error);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('must be a valid 16-character alphanumeric ID');
    expect(error.message).not.toContain('Partial item update may have occurred');
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(item.createActivity).not.toHaveBeenCalled();
    expect(item.toObject()).toEqual(before);
    expect(item.updateSource).not.toHaveBeenCalled();
    expect(ephemeralActors).toHaveLength(2);
  });

  it('preflights the complete batch before persisting any Item', async () => {
    const first = createItem('item-1', 'First', originalActivity);
    const second = createItem('item-2', 'Second', originalActivity);
    const firstBefore = first.toObject();
    const secondBefore = second.toObject();
    const { actor, dataAccess } = setup([first, second]);

    await expect(
      dataAccess.updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              BBBBBBBBBBBBBBBB: {
                _id: 'BBBBBBBBBBBBBBBB',
                name: 'Valid Activity',
                type: 'utility',
              },
            },
          },
        },
        {
          id: 'item-2',
          system: {
            activities: {
              invalid: { _id: 'invalid', name: 'Invalid', type: 'utility' },
            },
          },
        },
      ])
    ).rejects.toThrow('validation errors');

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(first.update).not.toHaveBeenCalled();
    expect(second.update).not.toHaveBeenCalled();
    expect(first.createActivity).not.toHaveBeenCalled();
    expect(second.createActivity).not.toHaveBeenCalled();
    expect(first.toObject()).toEqual(firstBefore);
    expect(second.toObject()).toEqual(secondBefore);
  });

  it('rejects duplicate Item IDs before independently valid patches can diverge in sequence', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const before = item.toObject();
    const { actor, dataAccess, ephemeralActors } = setup([item]);

    await expect(
      dataAccess.updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: { activities: { '-=AAAAAAAAAAAAAAAA': null } },
        },
        {
          id: 'item-1',
          system: { 'activities.AAAAAAAAAAAAAAAA.name': 'Would recreate incompletely' },
        },
      ])
    ).rejects.toThrow('Duplicate Item IDs are not supported in update-items: item-1');

    expect(ephemeralActors).toHaveLength(0);
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(item.toObject()).toEqual(before);
  });

  it('rejects an Activity whose object key and internal ID do not match', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const before = item.toObject();
    const { actor, dataAccess } = setup([item]);

    await expect(
      dataAccess.updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              BBBBBBBBBBBBBBBB: {
                _id: 'CCCCCCCCCCCCCCCC',
                name: 'Mismatched',
                type: 'utility',
              },
            },
          },
        },
      ])
    ).rejects.toThrow('matching its object key');

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(item.toObject()).toEqual(before);
  });

  it('discards parent-scoped validation state between invalid and valid invocations', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const before = item.toObject();
    const { actor, dataAccess, ephemeralActors } = setup([item]);

    const firstError = await dataAccess
      .updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              badActivityA: { _id: 'badActivityA', name: 'Invalid A', type: 'utility' },
            },
          },
        },
      ])
      .catch(error => error);
    const secondError = await dataAccess
      .updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              badActivityB: { _id: 'badActivityB', name: 'Invalid B', type: 'utility' },
            },
          },
        },
      ])
      .catch(error => error);

    expect(firstError.message).toContain('badActivityA');
    expect(secondError.message).toContain('badActivityB');
    expect(secondError.message).not.toContain('badActivityA');
    expect(ephemeralActors).toHaveLength(4);
    expect(ephemeralActors[0]).not.toBe(ephemeralActors[1]);
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(item.createActivity).not.toHaveBeenCalled();
    expect(item.updateSource).not.toHaveBeenCalled();
    expect(item.toObject()).toEqual(before);

    await dataAccess.updateActorItems('actor-1', [
      {
        id: 'item-1',
        system: {
          activities: {
            BBBBBBBBBBBBBBBB: {
              _id: 'BBBBBBBBBBBBBBBB',
              name: 'Valid After Failures',
              type: 'utility',
            },
          },
        },
      },
    ]);

    expect(item.update).not.toHaveBeenCalled();
    expect(item.createActivity).toHaveBeenCalledOnce();
    expect(item.toObject().system.activities.BBBBBBBBBBBBBBBB).toMatchObject({
      _id: 'BBBBBBBBBBBBBBBB',
      name: 'Valid After Failures',
      type: 'utility',
    });
    expect(ephemeralActors).toHaveLength(6);
  });

  it('does not carry an invalid Item A preflight into a valid Item B request', async () => {
    const first = createItem('item-1', 'First', {});
    const second = createItem('item-2', 'Second', {});
    const { dataAccess, ephemeralActors } = setup([first, second]);

    await expect(
      dataAccess.updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              badActivityA: { _id: 'badActivityA', name: 'Invalid A', type: 'utility' },
            },
          },
        },
      ])
    ).rejects.toThrow('badActivityA');

    await dataAccess.updateActorItems('actor-1', [
      {
        id: 'item-2',
        system: {
          activities: {
            BBBBBBBBBBBBBBBB: {
              _id: 'BBBBBBBBBBBBBBBB',
              name: 'Valid B',
              type: 'utility',
            },
          },
        },
      },
    ]);

    expect(first.update).not.toHaveBeenCalled();
    expect(second.update).not.toHaveBeenCalled();
    expect(second.createActivity).toHaveBeenCalledOnce();
    expect(second.toObject().system.activities.BBBBBBBBBBBBBBBB.name).toBe('Valid B');
    expect(ephemeralActors[0]).not.toBe(ephemeralActors[1]);
    expect(ephemeralActors[1].validationFailure).toBeUndefined();
  });

  it('creates one nested Activity through the native dnd5e lifecycle', async () => {
    const item = createItem('item-1', 'Feature', {});
    const { dataAccess } = setup([item]);

    item.persist({
      system: {
        activities: {
          AAAAAAAAAAAAAAAA: {
            _id: 'AAAAAAAAAAAAAAAA',
            name: 'Ignored Nested Form',
            type: 'utility',
          },
        },
      },
    });
    expect(item.toObject().system.activities).toEqual({});

    await dataAccess.updateActorItems('actor-1', [
      {
        id: 'item-1',
        system: {
          activities: {
            AAAAAAAAAAAAAAAA: {
              _id: 'AAAAAAAAAAAAAAAA',
              name: 'New Activity',
              type: 'utility',
            },
          },
        },
      },
    ]);

    expect(item.update).not.toHaveBeenCalled();
    expect(item.createActivity).toHaveBeenCalledWith(
      'utility',
      {
        _id: 'AAAAAAAAAAAAAAAA',
        name: 'New Activity',
        type: 'utility',
      },
      { renderSheet: false }
    );
    expect(item.toObject().system.activities.AAAAAAAAAAAAAAAA.name).toBe('New Activity');
  });

  it('uses Item.update only for ordinary fields alongside multiple native creates', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const { actor, dataAccess } = setup([item]);

    const result = await dataAccess.updateActorItems('actor-1', [
      {
        id: 'item-1',
        name: 'Updated Feature',
        system: {
          activities: {
            BBBBBBBBBBBBBBBB: {
              _id: 'BBBBBBBBBBBBBBBB',
              name: 'Valid One',
              type: 'utility',
            },
            CCCCCCCCCCCCCCCC: {
              _id: 'CCCCCCCCCCCCCCCC',
              name: 'Valid Two',
              type: 'utility',
            },
          },
        },
      },
    ]);

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).toHaveBeenCalledOnce();
    const persistencePayload = item.update.mock.calls[0][0];
    expect(persistencePayload).toEqual({ name: 'Updated Feature' });
    expect(item.createActivity).toHaveBeenNthCalledWith(
      1,
      'utility',
      {
        _id: 'BBBBBBBBBBBBBBBB',
        name: 'Valid One',
        type: 'utility',
      },
      { renderSheet: false }
    );
    expect(item.createActivity).toHaveBeenNthCalledWith(
      2,
      'utility',
      {
        _id: 'CCCCCCCCCCCCCCCC',
        name: 'Valid Two',
        type: 'utility',
      },
      { renderSheet: false }
    );
    expect(persistencePayload).not.toHaveProperty('id');
    expect(persistencePayload).not.toHaveProperty('_id');
    expect(result).toEqual({
      updated: [{ id: 'item-1', name: 'Updated Feature' }],
      total: 1,
    });
    expect(item.toObject().system.activities.BBBBBBBBBBBBBBBB).toMatchObject({
      _id: 'BBBBBBBBBBBBBBBB',
      name: 'Valid One',
      type: 'utility',
    });
    expect(item.toObject().system.activities.CCCCCCCCCCCCCCCC).toMatchObject({
      _id: 'CCCCCCCCCCCCCCCC',
      name: 'Valid Two',
      type: 'utility',
    });
  });

  it('persists Activities for two valid Items only after both preflights succeed', async () => {
    const first = createItem('item-1', 'First', {});
    const second = createItem('item-2', 'Second', {});
    const { actor, dataAccess, ephemeralActors, preflightActivityIds } = setup([first, second]);
    const createFirstActivity = first.createActivity.getMockImplementation()!;
    first.createActivity.mockImplementationOnce(async (...args) => {
      expect(ephemeralActors).toHaveLength(4);
      expect(preflightActivityIds).toEqual(['AAAAAAAAAAAAAAAA', 'BBBBBBBBBBBBBBBB']);
      return createFirstActivity(...args);
    });

    const result = await dataAccess.updateActorItems('actor-1', [
      {
        id: 'item-1',
        system: {
          activities: {
            AAAAAAAAAAAAAAAA: {
              _id: 'AAAAAAAAAAAAAAAA',
              name: 'First Activity',
              type: 'utility',
            },
          },
        },
      },
      {
        id: 'item-2',
        system: {
          activities: {
            BBBBBBBBBBBBBBBB: {
              _id: 'BBBBBBBBBBBBBBBB',
              name: 'Second Activity',
              type: 'utility',
            },
          },
        },
      },
    ]);

    expect(ephemeralActors).toHaveLength(4);
    expect(first.update).not.toHaveBeenCalled();
    expect(second.update).not.toHaveBeenCalled();
    expect(first.createActivity).toHaveBeenCalledWith(
      'utility',
      {
        _id: 'AAAAAAAAAAAAAAAA',
        name: 'First Activity',
        type: 'utility',
      },
      { renderSheet: false }
    );
    expect(second.createActivity).toHaveBeenCalledWith(
      'utility',
      {
        _id: 'BBBBBBBBBBBBBBBB',
        name: 'Second Activity',
        type: 'utility',
      },
      { renderSheet: false }
    );
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(first.toObject().system.activities.AAAAAAAAAAAAAAAA.name).toBe('First Activity');
    expect(second.toObject().system.activities.BBBBBBBBBBBBBBBB.name).toBe('Second Activity');
    expect(result).toEqual({
      updated: [
        { id: 'item-1', name: 'First' },
        { id: 'item-2', name: 'Second' },
      ],
      total: 2,
    });
  });

  it('rejects a false-positive persistence result when the requested patch was not applied', async () => {
    const item = createItem('item-1', 'Feature', {});
    const { dataAccess } = setup([item]);
    item.createActivity.mockResolvedValueOnce(undefined);

    await expect(
      dataAccess.updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              BBBBBBBBBBBBBBBB: {
                _id: 'BBBBBBBBBBBBBBBB',
                name: 'Valid One',
                type: 'utility',
              },
            },
          },
        },
      ])
    ).rejects.toThrow('Foundry did not create the requested Activity: BBBBBBBBBBBBBBBB');

    expect(item.update).not.toHaveBeenCalled();
    expect(item.createActivity).toHaveBeenCalledOnce();
    expect(item.toObject().system.activities).toEqual({});
  });

  it('rejects a false-positive Activity creation when the independent Actor read does not confirm it', async () => {
    // Models the live empty-Activity-collection bug: createActivity() mutates the
    // client-cached Item model (as dnd5e's real implementation does), but the
    // independent server round-trip still reports the Activity as absent. Verification
    // must trust the independent read over the cached reference it was written through.
    const item = createItem('item-1', 'Feature', {});
    const { dataAccess, database } = setup([item]);
    database.get.mockImplementation(async () => [
      {
        toObject: () => ({
          _id: 'actor-1',
          items: [{ _id: 'item-1', system: { activities: {} } }],
        }),
      },
    ]);

    await expect(
      dataAccess.updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              BBBBBBBBBBBBBBBB: {
                _id: 'BBBBBBBBBBBBBBBB',
                name: 'Valid One',
                type: 'utility',
              },
            },
          },
        },
      ])
    ).rejects.toThrow('Foundry did not create the requested Activity: BBBBBBBBBBBBBBBB');

    expect(item.createActivity).toHaveBeenCalledOnce();
    // The cached client-side model was optimistically updated regardless — proving the
    // independent read, not the cached reference, is what caught the false positive.
    expect(item.toObject().system.activities.BBBBBBBBBBBBBBBB).toBeDefined();
  });

  it('reports a warning instead of false-positive success when independent verification is unavailable', async () => {
    const item = createItem('item-1', 'Feature', {});
    const { dataAccess, database } = setup([item]);
    database.get.mockRejectedValue(new Error('get operation not supported on this version'));

    const result = await dataAccess.updateActorItems('actor-1', [
      {
        id: 'item-1',
        system: {
          activities: {
            BBBBBBBBBBBBBBBB: {
              _id: 'BBBBBBBBBBBBBBBB',
              name: 'Valid One',
              type: 'utility',
            },
          },
        },
      },
    ]);

    expect(result.updated).toEqual([{ id: 'item-1', name: 'Feature' }]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain('could not be independently verified');
    expect(result.warnings?.[0]).toContain('item-1:BBBBBBBBBBBBBBBB');
    expect(item.toObject().system.activities.BBBBBBBBBBBBBBBB).toBeDefined();
  });

  it('preserves configured Activity defaults and pre-create data during native creation', async () => {
    const item = createItem('item-1', 'Feature', {});
    const { dataAccess } = setup([item]);

    await expect(
      dataAccess.updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: {
            activities: {
              BBBBBBBBBBBBBBBB: {
                _id: 'BBBBBBBBBBBBBBBB',
                name: 'Prepared Activity',
                type: 'utility',
              },
            },
          },
        },
      ])
    ).resolves.toEqual({
      updated: [{ id: 'item-1', name: 'Feature' }],
      total: 1,
    });

    expect(item.toObject().system.activities.BBBBBBBBBBBBBBBB).toMatchObject({
      _id: 'BBBBBBBBBBBBBBBB',
      name: 'Prepared Activity',
      type: 'utility',
      activation: { type: 'action', value: 1 },
      preparedByPreCreate: true,
    });
  });

  it('preserves unrelated system fields while normalizing Activities', async () => {
    const item = createItem('item-1', 'Feature', {});
    const payload = {
      id: 'item-1',
      system: {
        uses: { value: 3, max: 5 },
        activities: {
          AAAAAAAAAAAAAAAA: {
            _id: 'AAAAAAAAAAAAAAAA',
            name: 'New Activity',
            type: 'utility',
          },
        },
      },
    };
    const payloadBefore = clone(payload);
    const { dataAccess } = setup([item]);

    await dataAccess.updateActorItems('actor-1', [payload]);

    expect(item.update).toHaveBeenCalledWith({
      system: { uses: { value: 3, max: 5 } },
    });
    expect(item.createActivity).toHaveBeenCalledWith(
      'utility',
      {
        _id: 'AAAAAAAAAAAAAAAA',
        name: 'New Activity',
        type: 'utility',
      },
      { renderSheet: false }
    );
    expect(item.toObject().system.uses).toEqual({ value: 3, max: 5 });
    expect(item.toObject().system.activities.AAAAAAAAAAAAAAAA.name).toBe('New Activity');
    expect(payload).toEqual(payloadBefore);
  });

  it('updates an existing Activity through updateActivity without recreating it', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const { dataAccess } = setup([item]);

    await dataAccess.updateActorItems('actor-1', [
      {
        id: 'item-1',
        system: {
          activities: {
            AAAAAAAAAAAAAAAA: {
              _id: 'AAAAAAAAAAAAAAAA',
              name: 'Updated Activity',
            },
          },
        },
      },
    ]);

    expect(item.update).not.toHaveBeenCalled();
    expect(item.createActivity).not.toHaveBeenCalled();
    expect(item.updateActivity).toHaveBeenCalledWith('AAAAAAAAAAAAAAAA', {
      _id: 'AAAAAAAAAAAAAAAA',
      name: 'Updated Activity',
    });
    expect(item.toObject().system.activities.AAAAAAAAAAAAAAAA.name).toBe('Updated Activity');
  });

  it('allows an already-satisfied Activity update as a legitimate no-op', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const { dataAccess } = setup([item]);

    await expect(
      dataAccess.updateActorItems('actor-1', [
        {
          id: 'item-1',
          system: { activities: clone(originalActivity) },
        },
      ])
    ).resolves.toEqual({
      updated: [{ id: 'item-1', name: 'Feature' }],
      total: 1,
    });

    expect(item.update).not.toHaveBeenCalled();
    expect(item.createActivity).not.toHaveBeenCalled();
    expect(item.updateActivity).toHaveBeenCalledWith(
      'AAAAAAAAAAAAAAAA',
      originalActivity.AAAAAAAAAAAAAAAA
    );
    expect(item.toObject().system.activities).toEqual(originalActivity);
  });

  it.each([
    { activities: { '-=AAAAAAAAAAAAAAAA': null } },
    { 'activities.-=AAAAAAAAAAAAAAAA': null },
  ])('preserves Foundry Activity deletion operators: %j', async system => {
    const item = createItem('item-1', 'Feature', {
      ...originalActivity,
      BBBBBBBBBBBBBBBB: { _id: 'BBBBBBBBBBBBBBBB', name: 'Keep' },
    });
    const { actor, dataAccess } = setup([item]);

    await dataAccess.updateActorItems('actor-1', [{ id: 'item-1', system }]);

    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(item.deleteActivity).toHaveBeenCalledWith('AAAAAAAAAAAAAAAA');
    expect(item.toObject().system.activities).toEqual({
      BBBBBBBBBBBBBBBB: { _id: 'BBBBBBBBBBBBBBBB', name: 'Keep' },
    });
  });

  it('can delete an invalid pre-existing Activity from an isolated non-strict graph', async () => {
    const item = createItem('item-1', 'Corrupt Feature', {
      corruptActivity: { _id: 'wrongActivityId', name: 'Corrupt' },
    });
    const { dataAccess, ephemeralActors } = setup([item]);

    await dataAccess.updateActorItems('actor-1', [
      {
        id: 'item-1',
        system: { activities: { '-=corruptActivity': null } },
      },
    ]);

    expect(item.update).not.toHaveBeenCalled();
    expect(item.deleteActivity).toHaveBeenCalledWith('corruptActivity');
    expect(item.toObject().system.activities).toEqual({});
    expect(ephemeralActors).toHaveLength(2);
    expect(ephemeralActors.every(graph => graph.context.strict === false)).toBe(true);
    expect(ephemeralActors.every(graph => graph.context.fallback === false)).toBe(true);
    expect(ephemeralActors.every(graph => graph.context.dropInvalidEmbedded === true)).toBe(true);
    expect(ephemeralActors.every(graph => graph.initialValidationErrors.length === 1)).toBe(true);
    expect(ephemeralActors.every(graph => graph.items.get('item-1') === undefined)).toBe(true);
    expect(
      ephemeralActors.every(
        graph => graph.getEmbeddedDocument('Item', 'item-1', { invalid: true })?.id === 'item-1'
      )
    ).toBe(true);
  });

  it('does not include a corrupt unrelated Item in another Item preflight graph', async () => {
    const corrupt = createItem('item-1', 'Corrupt Feature', {
      corruptActivity: { _id: 'wrongActivityId', name: 'Corrupt' },
    });
    const healthy = createItem('item-2', 'Healthy Feature', originalActivity);
    const corruptBefore = corrupt.toObject();
    const { dataAccess, ephemeralActors } = setup([corrupt, healthy]);

    await dataAccess.updateActorItems('actor-1', [
      { id: 'item-2', name: 'Healthy Feature Updated' },
    ]);

    expect(corrupt.update).not.toHaveBeenCalled();
    expect(corrupt.toObject()).toEqual(corruptBefore);
    expect(healthy.name).toBe('Healthy Feature Updated');
    expect(ephemeralActors).toHaveLength(2);
    expect(ephemeralActors.every(graph => graph.source.items.length === 1)).toBe(true);
    expect(ephemeralActors.every(graph => graph.source.items[0]._id === 'item-2')).toBe(true);
    expect(ephemeralActors.every(graph => graph.initialValidationErrors.length === 0)).toBe(true);
  });

  it('does not mutate live Item source or the original caller payload during preflight', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const before = item.toObject();
    const itemUpdates = [
      {
        id: 'item-1',
        system: {
          activities: {
            invalid: { _id: 'invalid', name: 'Invalid', type: 'utility' },
          },
        },
      },
    ];
    const payloadBefore = clone(itemUpdates);
    const { actor, dataAccess, ephemeralActors } = setup([item]);
    const actorBefore = actor.toObject();

    await expect(dataAccess.updateActorItems('actor-1', itemUpdates)).rejects.toThrow();

    expect(item.updateSource).not.toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
    expect(item.createActivity).not.toHaveBeenCalled();
    const ephemeralItem = ephemeralActors[0].items.get('item-1');
    expect(ephemeralItem.updateSource).not.toHaveBeenCalled();
    expect(ephemeralActors[0]).not.toBe(actor);
    expect(ephemeralActors[0].context).toEqual({
      strict: false,
      fallback: false,
      dropInvalidEmbedded: true,
    });
    expect(ephemeralActors[0].source).toMatchObject({
      _id: 'actor-1',
      name: 'Test Actor',
      type: 'character',
    });
    expect(ephemeralItem.parent).toBe(ephemeralActors[0]);
    expect(ephemeralItem.source).toMatchObject({ _id: 'item-1', type: 'feat' });
    expect(actor.toObject()).toEqual(actorBefore);
    expect(item.toObject()).toEqual(before);
    expect(itemUpdates).toEqual(payloadBefore);
  });

  it('warns that Item state must be verified when persistence fails after changing data', async () => {
    const first = createItem('item-1', 'First', originalActivity);
    const second = createItem('item-2', 'Second', originalActivity);
    const { actor, dataAccess } = setup([first, second]);
    second.update.mockRejectedValueOnce(new Error('Persistence hook failed'));

    await expect(
      dataAccess.updateActorItems('actor-1', [
        { id: 'item-1', name: 'Changed Before Failure' },
        { id: 'item-2', name: 'Never Changed' },
      ])
    ).rejects.toThrow('Partial item update may have occurred for: item-1');
    expect(actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(first.update).toHaveBeenCalledOnce();
    expect(second.update).toHaveBeenCalledOnce();
  });

  it('detects a deleted key with a V13-style directional diff after persistence fails', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const before = item.toObject();
    const { dataAccess } = setup([item]);
    item.update.mockImplementationOnce(async () => {
      item.persist({
        'system.activities.-=AAAAAAAAAAAAAAAA': null,
      });
      throw new Error('Persistence hook failed after deleting Activity');
    });

    const error = await dataAccess
      .updateActorItems('actor-1', [{ id: 'item-1', name: 'Requested Rename' }])
      .catch(error => error);

    // V13's one-way diff misses keys which only exist in the first argument.
    expect(directionalDiff(before, item.toObject())).toEqual({});
    expect(directionalDiff(item.toObject(), before)).not.toEqual({});
    expect(error.message).toContain('Persistence hook failed after deleting Activity');
    expect(error.message).toContain('Partial item update may have occurred for: item-1');
  });

  it('reports when Item state cannot be inspected after persistence starts', async () => {
    const item = createItem('item-1', 'Feature', originalActivity);
    const { dataAccess } = setup([item]);
    item.update.mockImplementationOnce(async () => {
      item.failInspection(new Error('Snapshot unavailable'));
      throw new Error('Persistence hook failed');
    });

    const error = await dataAccess
      .updateActorItems('actor-1', [{ id: 'item-1', name: 'Attempted Rename' }])
      .catch(error => error);

    expect(error.message).toContain('Persistence hook failed');
    expect(error.message).toContain('The persisted state could not be verified for: item-1');
    expect(error.message).toContain('Inspect the affected Item state in Foundry');
    expect(error.message).not.toContain('Partial item update may have occurred');
  });
});
