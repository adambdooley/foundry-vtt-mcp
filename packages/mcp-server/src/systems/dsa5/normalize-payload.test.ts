/**
 * Tests for DSA5Adapter.normalizePayload
 *
 * Validates that caller-friendly DSA5 shorthands (uppercase Eigenschaft keys,
 * naked numbers, lifePoints, identity.*, etc.) are correctly mapped onto the
 * real Foundry DSA5 system paths.
 */

import { describe, it, expect } from 'vitest';
import { DSA5Adapter } from './adapter.js';

const adapter = new DSA5Adapter();

describe('DSA5Adapter.normalizePayload', () => {
  // ── Eigenschaften ──────────────────────────────────────────────────────

  describe('Eigenschaften', () => {
    it('maps uppercase keys to lowercase and wraps naked numbers in {value, initial}', () => {
      const system = {
        characteristics: {
          MU: 13,
          KL: 12,
          IN: 11,
        },
      };
      const result = adapter.normalizePayload(system);
      expect(result.characteristics.mu).toEqual({ value: 13, initial: 13 });
      expect(result.characteristics.kl).toEqual({ value: 12, initial: 12 });
      expect(result.characteristics.in).toEqual({ value: 11, initial: 11 });
    });

    it('preserves lowercase keys and passes through {value, initial}', () => {
      const system = {
        characteristics: {
          mu: { value: 14, initial: 10 },
        },
      };
      const result = adapter.normalizePayload(system);
      expect(result.characteristics.mu).toEqual({ value: 14, initial: 10 });
    });

    it('computes value from initial + advances when value is missing', () => {
      const system = {
        characteristics: {
          mu: { initial: 8, advances: 5 },
        },
      };
      const result = adapter.normalizePayload(system);
      expect(result.characteristics.mu.value).toBe(13);
      expect(result.characteristics.mu.initial).toBe(8);
      expect(result.characteristics.mu.advances).toBe(5);
    });

    it('uses default initial=8 when advances present but no initial', () => {
      const system = {
        characteristics: {
          kk: { advances: 4 },
        },
      };
      const result = adapter.normalizePayload(system);
      expect(result.characteristics.kk.value).toBe(12); // 8 + 4
    });

    it('always sets value even for bare {initial} object', () => {
      const system = {
        characteristics: {
          ko: { initial: 10 },
        },
      };
      const result = adapter.normalizePayload(system);
      expect(result.characteristics.ko.value).toBe(10);
    });

    it('accepts system.eigenschaften as alternative source', () => {
      const system = {
        eigenschaften: {
          MU: 15,
        },
      };
      const result = adapter.normalizePayload(system);
      expect(result.characteristics.mu).toEqual({ value: 15, initial: 15 });
    });
  });

  // ── LeP (wounds) ───────────────────────────────────────────────────────

  describe('LeP / wounds', () => {
    it('maps system.lifePoints {current,max} to system.status.wounds', () => {
      const system = {
        lifePoints: { current: 20, max: 30 },
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.wounds.current).toBe(20);
      expect(result.status.wounds.max).toBe(30);
    });

    it('accepts value as synonym for current in lifePoints', () => {
      const system = {
        lifePoints: { value: 15, max: 25 },
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.wounds.current).toBe(15);
      expect(result.status.wounds.max).toBe(25);
    });

    it('does not overwrite existing system.status.wounds', () => {
      const system = {
        status: { wounds: { current: 5, max: 10 } },
        lifePoints: { current: 99, max: 99 },
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.wounds.current).toBe(5);
      expect(result.status.wounds.max).toBe(10);
    });

    it('derives max from initial + KO*2 when max missing', () => {
      const system = {
        characteristics: { KO: 12 },
        lifePoints: { current: 20, initial: 8 },
      };
      const result = adapter.normalizePayload(system);
      // initial=8, KO=12 → max = 8 + 12*2 = 32
      expect(result.status.wounds.max).toBe(32);
    });

    it('uses fallback initial=8, KO=8 when deriving max', () => {
      const system = {
        lifePoints: { current: 10 },
      };
      const result = adapter.normalizePayload(system);
      // initial=8, KO=8 → max = 8 + 16 = 24
      expect(result.status.wounds.max).toBe(24);
    });

    it('accepts system.status.lifePoints as source', () => {
      const system = {
        status: { lifePoints: { current: 12, max: 18 } },
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.wounds.current).toBe(12);
      expect(result.status.wounds.max).toBe(18);
    });
  });

  // ── AsP / KaP / fatePoints ─────────────────────────────────────────────

  describe('AsP / KaP / fatePoints', () => {
    it('normalises astralEnergy to system.status.astralenergy', () => {
      const system = {
        astralEnergy: { value: 10, max: 20 },
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.astralenergy.value).toBe(10);
      expect(result.status.astralenergy.max).toBe(20);
    });

    it('normalises karmaEnergy to system.status.karmaenergy', () => {
      const system = {
        karmaEnergy: { current: 5, max: 15 },
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.karmaenergy.value).toBe(5);
      expect(result.status.karmaenergy.max).toBe(15);
    });

    it('normalises fatePoints', () => {
      const system = {
        fatePoints: { value: 3, max: 3 },
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.fatePoints.value).toBe(3);
      expect(result.status.fatePoints.max).toBe(3);
    });

    it('accepts naked number for astralEnergy', () => {
      const system = {
        astralEnergy: 25,
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.astralenergy.value).toBe(25);
      expect(result.status.astralenergy.max).toBe(25);
    });
  });

  // ── Details ────────────────────────────────────────────────────────────

  describe('Details', () => {
    it('maps string species/culture/career to {value} objects', () => {
      const system = {
        species: 'Mensch',
        culture: 'Bornland',
        career: 'Krieger',
      };
      const result = adapter.normalizePayload(system);
      expect(result.details.species).toEqual({ value: 'Mensch' });
      expect(result.details.culture).toEqual({ value: 'Bornland' });
      expect(result.details.career).toEqual({ value: 'Krieger' });
    });

    it('maps profession to career (not profession)', () => {
      const system = {
        profession: 'Magier',
      };
      const result = adapter.normalizePayload(system);
      expect(result.details.career).toEqual({ value: 'Magier' });
      expect(result.details.profession).toBeUndefined();
    });

    it('maps identity.profession to details.career', () => {
      const system = {
        identity: { profession: 'Geweihter' },
      };
      const result = adapter.normalizePayload(system);
      expect(result.details.career).toEqual({ value: 'Geweihter' });
    });

    it('maps identity.species/culture to details.*', () => {
      const system = {
        identity: { species: 'Elf', culture: 'Firnelfen' },
      };
      const result = adapter.normalizePayload(system);
      expect(result.details.species).toEqual({ value: 'Elf' });
      expect(result.details.culture).toEqual({ value: 'Firnelfen' });
    });

    it('passes through {value} objects in details', () => {
      const system = {
        details: { species: { value: 'Zwerg' } },
      };
      const result = adapter.normalizePayload(system);
      expect(result.details.species).toEqual({ value: 'Zwerg' });
    });

    it('maps socialstate', () => {
      const system = {
        socialstate: 'Bauer',
      };
      const result = adapter.normalizePayload(system);
      expect(result.details.socialstate).toEqual({ value: 'Bauer' });
    });

    it('maps experience fields', () => {
      const system = {
        experience: { total: 1500, spent: 800, available: 700 },
      };
      const result = adapter.normalizePayload(system);
      expect(result.details.experience.total).toBe(1500);
      expect(result.details.experience.spent).toBe(800);
      expect(result.details.experience.available).toBe(700);
    });
  });

  // ── Status / Kampf ─────────────────────────────────────────────────────

  describe('Status / Kampf', () => {
    it('wraps naked-number initiative/speed/dodge/armour in {value}', () => {
      const system = {
        initiative: 15,
        speed: 8,
        dodge: 6,
        armour: 5,
      };
      const result = adapter.normalizePayload(system);
      expect(result.status.initiative).toEqual({ value: 15 });
      expect(result.status.speed).toEqual({ value: 8 });
      expect(result.status.dodge).toEqual({ value: 6 });
      expect(result.status.armour).toEqual({ value: 5 });
    });

    it('accepts armor (American) as synonym for armour', () => {
      const system = { armor: 3 };
      const result = adapter.normalizePayload(system);
      expect(result.status.armour).toEqual({ value: 3 });
    });

    it('wraps string size in {value}', () => {
      const system = { size: 'mittel' };
      const result = adapter.normalizePayload(system);
      expect(result.status.size).toEqual({ value: 'mittel' });
    });
  });

  // ── Tradition ──────────────────────────────────────────────────────────

  describe('Tradition', () => {
    it('passes tradition through', () => {
      const system = {
        tradition: { magical: 'Gildenmagier', clerical: 'Rondra' },
      };
      const result = adapter.normalizePayload(system);
      expect(result.tradition).toEqual({ magical: 'Gildenmagier', clerical: 'Rondra' });
    });
  });

  // ── Unknown keys ───────────────────────────────────────────────────────

  describe('Unknown keys', () => {
    it('preserves unknown keys unchanged', () => {
      const system = {
        someUnknownKey: 'hello',
        anotherKey: { nested: 42 },
      };
      const result = adapter.normalizePayload(system);
      expect(result.someUnknownKey).toBe('hello');
      expect(result.anotherKey).toEqual({ nested: 42 });
    });
  });

  // ── Full integration ───────────────────────────────────────────────────

  describe('Full payload', () => {
    it('normalises a mixed payload correctly', () => {
      const system = {
        characteristics: {
          MU: 13,
          KL: { value: 12, initial: 10 },
          KO: { initial: 8, advances: 4 },
        },
        lifePoints: { current: 25, max: 30 },
        astralEnergy: { value: 10, max: 20 },
        species: 'Mensch',
        profession: 'Krieger',
        initiative: 14,
        unknownField: 'preserved',
      };
      const result = adapter.normalizePayload(system);

      // Eigenschaften
      expect(result.characteristics.mu).toEqual({ value: 13, initial: 13 });
      expect(result.characteristics.kl).toEqual({ value: 12, initial: 10 });
      expect(result.characteristics.ko.value).toBe(12); // 8 + 4

      // LeP
      expect(result.status.wounds.current).toBe(25);
      expect(result.status.wounds.max).toBe(30);

      // AsP
      expect(result.status.astralenergy.value).toBe(10);
      expect(result.status.astralenergy.max).toBe(20);

      // Details
      expect(result.details.species).toEqual({ value: 'Mensch' });
      expect(result.details.career).toEqual({ value: 'Krieger' });

      // Kampf
      expect(result.status.initiative).toEqual({ value: 14 });

      // Unknown
      expect(result.unknownField).toBe('preserved');
    });
  });
});
