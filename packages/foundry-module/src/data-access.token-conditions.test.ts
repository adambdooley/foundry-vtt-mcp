/**
 * toggle-token-condition and get-available-conditions across systems.
 *
 * - PF2e replaces CONFIG.statusEffects with a plain object keyed by slug, so the array
 *   methods both tools used threw in PF2e worlds.
 * - PF2e conditions are Items; a hand-built ActiveEffect did nothing.
 * - dnd5e removal deleted any effect whose statuses merely contained the id, so removing
 *   Incapacitated deleted a compound Paralyzed effect.
 *
 * Both tools now read the list either way, and add/remove goes through
 * Actor#toggleStatusEffect, which systems override. DSA5 keeps its original path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';

function makeActor() {
  return {
    name: 'Goblin',
    effects: { contents: [] as any[] },
    toggleStatusEffect: vi.fn().mockResolvedValue(undefined),
    createEmbeddedDocuments: vi.fn().mockResolvedValue([]),
    deleteEmbeddedDocuments: vi.fn().mockResolvedValue([]),
  };
}

function stubWorld(systemId: string, statusEffects: unknown, actor: any) {
  const token = { id: 'tok1', name: 'Goblin Token', actor };
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'world-1' },
    user: { id: 'gm', name: 'GM', isGM: true },
    system: { id: systemId },
    settings: { get: () => true },
    scenes: { current: { tokens: { get: (id: string) => (id === 'tok1' ? token : undefined) } } },
  });
  vi.stubGlobal('CONFIG', { statusEffects });
}

const access = () => Object.create(FoundryDataAccess.prototype) as FoundryDataAccess;

// PF2e's shape: a plain object keyed by slug.
const pf2eStatuses = {
  frightened: { id: 'frightened', name: 'Frightened', img: 'f.webp' },
  prone: { id: 'prone', name: 'Prone', img: 'p.webp' },
  'persistent-damage': { id: 'persistent-damage', name: 'Persistent Damage', img: 'pd.webp' },
};

// Core/dnd5e shape: an array.
const coreStatuses = [
  { id: 'incapacitated', name: 'Incapacitated', img: 'i.svg' },
  { id: 'paralyzed', name: 'Paralyzed', img: 'pz.svg' },
];

describe('condition tools', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('PF2e', () => {
    it('lists conditions from its object-shaped CONFIG.statusEffects', async () => {
      stubWorld('pf2e', pf2eStatuses, makeActor());

      const result = await access().getAvailableConditions();

      expect(result.conditions.map((c: any) => c.id)).toEqual([
        'frightened',
        'prone',
        'persistent-damage',
      ]);
    });

    it('adds a condition through the actor instead of a hand-built effect', async () => {
      const actor = makeActor();
      stubWorld('pf2e', pf2eStatuses, actor);

      await access().toggleTokenCondition({
        tokenId: 'tok1',
        conditionId: 'frightened',
        active: true,
      });

      expect(actor.toggleStatusEffect).toHaveBeenCalledWith('frightened', { active: true });
      expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('removes a condition through the actor', async () => {
      const actor = makeActor();
      stubWorld('pf2e', pf2eStatuses, actor);

      await access().toggleTokenCondition({ tokenId: 'tok1', conditionId: 'prone', active: false });

      expect(actor.toggleStatusEffect).toHaveBeenCalledWith('prone', { active: false });
      expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('resolves a condition by name', async () => {
      const actor = makeActor();
      stubWorld('pf2e', pf2eStatuses, actor);

      await access().toggleTokenCondition({
        tokenId: 'tok1',
        conditionId: 'Frightened',
        active: true,
      });

      expect(actor.toggleStatusEffect).toHaveBeenCalledWith('frightened', { active: true });
    });

    it('refuses persistent damage, which PF2e only applies through a dialog', async () => {
      const actor = makeActor();
      stubWorld('pf2e', pf2eStatuses, actor);

      await expect(
        access().toggleTokenCondition({
          tokenId: 'tok1',
          conditionId: 'persistent-damage',
          active: true,
        })
      ).rejects.toThrow(/Persistent damage/);
      expect(actor.toggleStatusEffect).not.toHaveBeenCalled();
    });
  });

  describe('dnd5e', () => {
    it('removes a status through the actor rather than deleting matching effects itself', async () => {
      const actor = makeActor();
      // A compound effect carrying incapacitated among other statuses.
      actor.effects.contents = [
        { id: 'para', name: 'Paralyzed', statuses: new Set(['paralyzed', 'incapacitated']) },
      ];
      stubWorld('dnd5e', coreStatuses, actor);

      await access().toggleTokenCondition({
        tokenId: 'tok1',
        conditionId: 'incapacitated',
        active: false,
      });

      expect(actor.toggleStatusEffect).toHaveBeenCalledWith('incapacitated', { active: false });
      expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('adds a status through the actor', async () => {
      const actor = makeActor();
      stubWorld('dnd5e', coreStatuses, actor);

      await access().toggleTokenCondition({
        tokenId: 'tok1',
        conditionId: 'paralyzed',
        active: true,
      });

      expect(actor.toggleStatusEffect).toHaveBeenCalledWith('paralyzed', { active: true });
      expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
    });
  });

  describe('DSA5 keeps its original path', () => {
    const dsaStatuses = [
      {
        id: 'prone',
        name: 'Liegend',
        icon: 'l.svg',
        flags: { dsa5: { value: 1 } },
        changes: [{ key: 'system.x', value: '1' }],
      },
    ];

    it('adds by creating an effect carrying the condition data', async () => {
      const actor = makeActor();
      stubWorld('dsa5', dsaStatuses, actor);

      await access().toggleTokenCondition({ tokenId: 'tok1', conditionId: 'prone', active: true });

      expect(actor.toggleStatusEffect).not.toHaveBeenCalled();
      const created = actor.createEmbeddedDocuments.mock.calls[0];
      expect(created[0]).toBe('ActiveEffect');
      expect(created[1][0]).toMatchObject({
        name: 'Liegend',
        statuses: ['prone'],
        flags: { dsa5: { value: 1 } },
        changes: [{ key: 'system.x', value: '1' }],
      });
    });

    it('removes by matching effects', async () => {
      const actor = makeActor();
      actor.effects.contents = [{ id: 'e1', name: 'Liegend', statuses: new Set(['prone']) }];
      stubWorld('dsa5', dsaStatuses, actor);

      await access().toggleTokenCondition({ tokenId: 'tok1', conditionId: 'prone', active: false });

      expect(actor.toggleStatusEffect).not.toHaveBeenCalled();
      expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('ActiveEffect', ['e1']);
    });
  });

  it('still reports an unknown condition', async () => {
    stubWorld('dnd5e', coreStatuses, makeActor());

    await expect(
      access().toggleTokenCondition({ tokenId: 'tok1', conditionId: 'nonsense', active: true })
    ).rejects.toThrow(/Condition not found: nonsense/);
  });
});
