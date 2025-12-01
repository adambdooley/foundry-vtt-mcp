/**
 * D&D 5e Filter Schemas
 *
 * Extracted from compendium-filters.ts for modular system support.
 */

import { z } from 'zod';

/**
 * D&D 5e creature types
 */
export const DnD5eCreatureTypes = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead'
] as const;

export type DnD5eCreatureType = typeof DnD5eCreatureTypes[number];

/**
 * Common creature sizes
 */
export const CreatureSizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type CreatureSize = typeof CreatureSizes[number];

/**
 * D&D 5e filter schema
 */
export const DnD5eFiltersSchema = z.object({
  challengeRating: z.union([
    z.number(),
    z.object({
      min: z.number().optional(),
      max: z.number().optional()
    })
  ]).optional(),
  creatureType: z.enum(DnD5eCreatureTypes).optional(),
  size: z.enum(CreatureSizes).optional(),
  alignment: z.string().optional(),
  hasLegendaryActions: z.boolean().optional(),
  spellcaster: z.boolean().optional()
});

export type DnD5eFilters = z.infer<typeof DnD5eFiltersSchema>;

/**
 * Check if a creature matches D&D 5e filters
 */
export function matchesDnD5eFilters(creature: any, filters: DnD5eFilters): boolean {
  // Challenge Rating filter
  if (filters.challengeRating !== undefined) {
    const cr = creature.systemData?.challengeRating;
    if (cr === undefined) return false;

    if (typeof filters.challengeRating === 'number') {
      if (cr !== filters.challengeRating) return false;
    } else {
      const min = filters.challengeRating.min ?? 0;
      const max = filters.challengeRating.max ?? 30;
      if (cr < min || cr > max) return false;
    }
  }

  // Creature Type filter
  if (filters.creatureType) {
    const creatureType = creature.systemData?.creatureType;
    if (!creatureType || creatureType.toLowerCase() !== filters.creatureType.toLowerCase()) {
      return false;
    }
  }

  // Size filter
  if (filters.size) {
    const size = creature.systemData?.size;
    if (!size || size.toLowerCase() !== filters.size.toLowerCase()) {
      return false;
    }
  }

  // Alignment filter
  if (filters.alignment) {
    const alignment = creature.systemData?.alignment;
    if (!alignment || !alignment.toLowerCase().includes(filters.alignment.toLowerCase())) {
      return false;
    }
  }

  // Legendary Actions filter
  if (filters.hasLegendaryActions !== undefined) {
    const hasLegendary = creature.systemData?.hasLegendaryActions || false;
    if (hasLegendary !== filters.hasLegendaryActions) {
      return false;
    }
  }

  // Spellcaster filter
  if (filters.spellcaster !== undefined) {
    const hasSpells = creature.systemData?.hasSpellcasting || false;
    if (hasSpells !== filters.spellcaster) {
      return false;
    }
  }

  return true;
}

/**
 * Generate human-readable description of D&D 5e filters
 */
export function describeDnD5eFilters(filters: DnD5eFilters): string {
  const parts: string[] = [];

  if (filters.challengeRating !== undefined) {
    if (typeof filters.challengeRating === 'number') {
      parts.push(`CR ${filters.challengeRating}`);
    } else {
      const min = filters.challengeRating.min ?? 0;
      const max = filters.challengeRating.max ?? 30;
      parts.push(`CR ${min}-${max}`);
    }
  }

  if (filters.creatureType) parts.push(filters.creatureType);
  if (filters.size) parts.push(filters.size);
  if (filters.alignment) parts.push(filters.alignment);
  if (filters.hasLegendaryActions) parts.push('legendary');
  if (filters.spellcaster) parts.push('spellcaster');

  return parts.length > 0 ? parts.join(', ') : 'no filters';
}

/**
 * Validate creature type
 */
export function isValidDnD5eCreatureType(creatureType: string): boolean {
  return DnD5eCreatureTypes.includes(creatureType as DnD5eCreatureType);
}
