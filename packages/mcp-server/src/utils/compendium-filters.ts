/**
 * Compendium Search Filter Schemas
 *
 * Defines filter schemas for different game systems (D&D 5e, Pathfinder 2e)
 * to enable system-specific creature/actor searches.
 */

import { z } from 'zod';
import type { GameSystem } from './system-detection.js';

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
  'undead',
] as const;

export type DnD5eCreatureType = (typeof DnD5eCreatureTypes)[number];

/**
 * Pathfinder 2e creature types (traits)
 * This is a common subset - PF2e has many more creature traits
 */
export const PF2eCreatureTypes = [
  'aberration',
  'animal',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'fungus',
  'humanoid',
  'monitor',
  'ooze',
  'plant',
  'undead',
] as const;

export type PF2eCreatureType = (typeof PF2eCreatureTypes)[number];

/**
 * Pathfinder 2e rarity levels
 */
export const PF2eRarities = ['common', 'uncommon', 'rare', 'unique'] as const;
export type PF2eRarity = (typeof PF2eRarities)[number];

/**
 * Common creature sizes (used by both systems)
 */
export const CreatureSizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type CreatureSize = (typeof CreatureSizes)[number];

/**
 * D&D 5e filter schema
 */
export const DnD5eFiltersSchema = z.object({
  challengeRating: z
    .union([
      z.number(),
      z.object({
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    ])
    .optional(),
  creatureType: z.enum(DnD5eCreatureTypes).optional(),
  size: z.enum(CreatureSizes).optional(),
  alignment: z.string().optional(),
  hasLegendaryActions: z.boolean().optional(),
  spellcaster: z.boolean().optional(),
});

export type DnD5eFilters = z.infer<typeof DnD5eFiltersSchema>;

/**
 * Pathfinder 2e filter schema
 */
export const PF2eFiltersSchema = z.object({
  level: z
    .union([
      z.number().min(-1).max(30), // PF2e levels range from -1 to 25+ (accounting for higher levels)
      z.object({
        min: z.number().min(-1).optional(),
        max: z.number().max(30).optional(),
      }),
    ])
    .optional(),
  creatureType: z.enum(PF2eCreatureTypes).optional(),
  traits: z.array(z.string()).optional(), // Array of trait names
  rarity: z.enum(PF2eRarities).optional(),
  size: z.enum(CreatureSizes).optional(),
  alignment: z.string().optional(),
  hasSpells: z.boolean().optional(), // PF2e uses spellcasting entries instead of "spellcaster"
});

export type PF2eFilters = z.infer<typeof PF2eFiltersSchema>;

/**
 * Generic filter schema that accepts both D&D 5e and PF2e filters
 * Used when we don't know the system yet
 */
export const GenericFiltersSchema = z.object({
  // D&D 5e fields
  challengeRating: z
    .union([
      z.number(),
      z.object({
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    ])
    .optional(),

  // PF2e fields
  level: z
    .union([
      z.number().min(-1).max(30),
      z.object({
        min: z.number().min(-1).optional(),
        max: z.number().max(30).optional(),
      }),
    ])
    .optional(),

  // Common fields (work slightly differently per system)
  creatureType: z.string().optional(), // Accept any string, validate per system
  traits: z.array(z.string()).optional(), // PF2e specific but doesn't hurt D&D 5e
  rarity: z.enum(PF2eRarities).optional(), // PF2e specific
  size: z.enum(CreatureSizes).optional(),
  alignment: z.string().optional(),

  // Spellcasting flags (different names per system)
  hasLegendaryActions: z.boolean().optional(), // D&D 5e specific
  spellcaster: z.boolean().optional(), // D&D 5e terminology
  hasSpells: z.boolean().optional(), // PF2e terminology
});

export type GenericFilters = z.infer<typeof GenericFiltersSchema>;

/**
 * Get appropriate filter schema for a game system
 */
export function getFilterSchema(system: GameSystem) {
  if (system === 'dnd5e') {
    return DnD5eFiltersSchema;
  } else if (system === 'pf2e') {
    return PF2eFiltersSchema;
  }
  // For unknown systems, use generic schema (best effort)
  return GenericFiltersSchema;
}

/**
 * Validate creature type for a given system
 */
export function isValidCreatureType(creatureType: string, system: GameSystem): boolean {
  if (system === 'dnd5e') {
    return DnD5eCreatureTypes.includes(creatureType as DnD5eCreatureType);
  } else if (system === 'pf2e') {
    return PF2eCreatureTypes.includes(creatureType as PF2eCreatureType);
  }
  return false;
}

/**
 * Convert filters from one system to another (best effort)
 * Used when user provides D&D 5e filters but world is PF2e (or vice versa)
 */
export function convertFilters(
  filters: GenericFilters,
  fromSystem: GameSystem,
  toSystem: GameSystem
): GenericFilters {
  const converted = { ...filters };

  // Convert CR <-> Level
  if (fromSystem === 'dnd5e' && toSystem === 'pf2e') {
    // D&D 5e CR roughly equals PF2e level
    if (filters.challengeRating !== undefined) {
      converted.level = filters.challengeRating;
      delete converted.challengeRating;
    }

    // Convert spellcaster flag
    if (filters.spellcaster !== undefined) {
      converted.hasSpells = filters.spellcaster;
      delete converted.spellcaster;
    }

    // Remove D&D 5e specific flags
    delete converted.hasLegendaryActions;
  } else if (fromSystem === 'pf2e' && toSystem === 'dnd5e') {
    // PF2e level roughly equals D&D 5e CR
    if (filters.level !== undefined) {
      converted.challengeRating = filters.level;
      delete converted.level;
    }

    // Convert spell flag
    if (filters.hasSpells !== undefined) {
      converted.spellcaster = filters.hasSpells;
      delete converted.hasSpells;
    }

    // Remove PF2e specific fields
    delete converted.traits;
    delete converted.rarity;
  }

  return converted;
}

/**
 * Build human-readable filter description for tool responses
 */
export function describeFilters(filters: GenericFilters, system: GameSystem): string {
  const parts: string[] = [];

  if (system === 'dnd5e') {
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
  } else if (system === 'pf2e') {
    if (filters.level !== undefined) {
      if (typeof filters.level === 'number') {
        parts.push(`Level ${filters.level}`);
      } else {
        const min = filters.level.min ?? -1;
        const max = filters.level.max ?? 25;
        parts.push(`Level ${min}-${max}`);
      }
    }

    if (filters.creatureType) parts.push(filters.creatureType);
    if (filters.rarity) parts.push(filters.rarity);
    if (filters.size) parts.push(filters.size);
    if (filters.alignment) parts.push(filters.alignment);
    if (filters.traits && filters.traits.length > 0) {
      parts.push(`traits: ${filters.traits.join(', ')}`);
    }
    if (filters.hasSpells) parts.push('spellcaster');
  }

  return parts.length > 0 ? parts.join(', ') : 'no filters';
}
