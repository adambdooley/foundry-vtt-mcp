/**
 * DSA5 Filter Schemas
 *
 * Filter definitions for Das Schwarze Auge 5 (DSA5) system.
 * Based on D&D5e filter pattern from v0.6.0 Registry Pattern.
 */

import { z } from 'zod';

/**
 * DSA5 Species (Spezies/Rassen)
 * Common species from DSA5 Grundregelwerk
 */
export const DSA5Species = [
  'mensch', // Human
  'elf', // Elf
  'halbelf', // Half-Elf
  'zwerg', // Dwarf
  'goblin', // Goblin
  'ork', // Orc
  'halborc', // Half-Orc
  'achaz', // Achaz (lizard folk)
  'troll', // Troll
  'oger', // Ogre
  'drache', // Dragon
  'dämon', // Demon
  'elementar', // Elemental
  'untot', // Undead
  'tier', // Animal/Beast
  'chimäre', // Chimera/Hybrid creature
] as const;

export type DSA5SpeciesType = (typeof DSA5Species)[number];

/**
 * Common creature sizes (shared with D&D5e)
 */
export const CreatureSizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type CreatureSize = (typeof CreatureSizes)[number];

/**
 * Experience levels (Erfahrungsgrade) 1-7
 * Maps to AP ranges defined in DSA5_EXPERIENCE_LEVELS.md
 */
export const ExperienceLevels = [1, 2, 3, 4, 5, 6, 7] as const;
export type ExperienceLevel = (typeof ExperienceLevels)[number];

/**
 * DSA5 filter schema
 */
export const DSA5FiltersSchema = z.object({
  // Level filter (1-7) - replaces D&D5e's Challenge Rating
  level: z
    .union([
      z.number().min(1).max(7),
      z.object({
        min: z.number().min(1).max(7).optional(),
        max: z.number().min(1).max(7).optional(),
      }),
    ])
    .optional(),

  // Species filter (Spezies/Rasse)
  species: z.enum(DSA5Species).optional(),

  // Culture filter (optional, string because there are many cultures)
  culture: z.string().optional(),

  // Size filter
  size: z.enum(CreatureSizes).optional(),

  // Has spells (Zauber)
  hasSpells: z.boolean().optional(),

  // Experience points range (AP) - detail filter
  experiencePoints: z
    .union([
      z.number(),
      z.object({
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    ])
    .optional(),
});

export type DSA5Filters = z.infer<typeof DSA5FiltersSchema>;

/**
 * Check if a creature matches DSA5 filters
 */
export function matchesDSA5Filters(creature: any, filters: DSA5Filters): boolean {
  // Level filter (Erfahrungsgrad 1-7)
  if (filters.level !== undefined) {
    const level = creature.systemData?.level;
    if (level === undefined) return false;

    if (typeof filters.level === 'number') {
      if (level !== filters.level) return false;
    } else {
      const min = filters.level.min ?? 1;
      const max = filters.level.max ?? 7;
      if (level < min || level > max) return false;
    }
  }

  // Species filter (Spezies)
  if (filters.species) {
    const species = creature.systemData?.species;
    if (!species || species.toLowerCase() !== filters.species.toLowerCase()) {
      return false;
    }
  }

  // Culture filter (Kultur)
  if (filters.culture) {
    const culture = creature.systemData?.culture;
    if (!culture || !culture.toLowerCase().includes(filters.culture.toLowerCase())) {
      return false;
    }
  }

  // Size filter (Größe)
  if (filters.size) {
    const size = creature.systemData?.size;
    if (!size || size.toLowerCase() !== filters.size.toLowerCase()) {
      return false;
    }
  }

  // Has spells filter (Zauber)
  if (filters.hasSpells !== undefined) {
    const hasSpells = creature.systemData?.hasSpells || false;
    if (hasSpells !== filters.hasSpells) {
      return false;
    }
  }

  // Experience points filter (AP)
  if (filters.experiencePoints !== undefined) {
    const ap = creature.systemData?.experiencePoints;
    if (ap === undefined) return false;

    if (typeof filters.experiencePoints === 'number') {
      if (ap !== filters.experiencePoints) return false;
    } else {
      const min = filters.experiencePoints.min ?? 0;
      const max = filters.experiencePoints.max ?? Infinity;
      if (ap < min || ap > max) return false;
    }
  }

  return true;
}

/**
 * Generate human-readable description of DSA5 filters
 */
export function describeDSA5Filters(filters: DSA5Filters): string {
  const parts: string[] = [];

  if (filters.level !== undefined) {
    if (typeof filters.level === 'number') {
      parts.push(`Stufe ${filters.level}`);
    } else {
      const min = filters.level.min ?? 1;
      const max = filters.level.max ?? 7;
      parts.push(`Stufe ${min}-${max}`);
    }
  }

  if (filters.species) parts.push(filters.species);
  if (filters.culture) parts.push(filters.culture);
  if (filters.size) parts.push(filters.size);
  if (filters.hasSpells) parts.push('Zauberer');

  if (filters.experiencePoints !== undefined) {
    if (typeof filters.experiencePoints === 'number') {
      parts.push(`${filters.experiencePoints} AP`);
    } else {
      const min = filters.experiencePoints.min ?? 0;
      const max = filters.experiencePoints.max ?? Infinity;
      if (max === Infinity) {
        parts.push(`${min}+ AP`);
      } else {
        parts.push(`${min}-${max} AP`);
      }
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'keine Filter';
}

/**
 * Validate DSA5 species type
 */
export function isValidDSA5Species(species: string): boolean {
  return DSA5Species.includes(species.toLowerCase() as DSA5SpeciesType);
}

/**
 * Validate experience level
 */
export function isValidExperienceLevel(level: number): boolean {
  return level >= 1 && level <= 7;
}
