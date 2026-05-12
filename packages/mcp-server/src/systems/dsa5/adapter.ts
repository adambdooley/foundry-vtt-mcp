/**
 * DSA5 System Adapter
 *
 * Implements SystemAdapter interface for DSA5 (Das Schwarze Auge 5) support.
 * Handles creature indexing, filtering, formatting, and data extraction.
 */

import type {
  SystemAdapter,
  SystemMetadata,
  SystemCreatureIndex,
  DSA5CreatureIndex,
} from '../types.js';
import {
  DSA5FiltersSchema,
  matchesDSA5Filters,
  describeDSA5Filters,
  type DSA5Filters,
} from './filters.js';
import { FIELD_PATHS, getExperienceLevel, EIGENSCHAFT_NAMES } from './constants.js';

/**
 * DSA5 system adapter
 */
export class DSA5Adapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'dsa5',
      name: 'dsa5',
      displayName: 'Das Schwarze Auge 5',
      version: '1.0.0',
      description:
        'Support for DSA5 (Das Schwarze Auge 5. Edition) with Eigenschaften, Talente, Erfahrungsgrade, and LeP/AsP/KaP resources',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true, // Uses Experience Level (Erfahrungsgrad 1-7)
      },
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'dsa5';
  }

  /**
   * Extract creature data from Foundry document for indexing
   * This is called by the index builder in Foundry's browser context
   */
  extractCreatureData(
    doc: any,
    pack: any
  ): { creature: SystemCreatureIndex; errors: number } | null {
    // Implementation is in index-builder.ts since it runs in browser
    // This method is here for type compliance but delegates to IndexBuilder
    throw new Error('extractCreatureData should be called from DSA5IndexBuilder, not the adapter');
  }

  getFilterSchema() {
    return DSA5FiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, any>): boolean {
    // Validate filters match DSA5 schema
    const validated = DSA5FiltersSchema.safeParse(filters);
    if (!validated.success) {
      return false;
    }

    return matchesDSA5Filters(creature, validated.data as DSA5Filters);
  }

  getDataPaths(): Record<string, string | null> {
    return {
      // DSA5 specific paths
      level: FIELD_PATHS.DETAILS_EXPERIENCE_TOTAL, // Level is calculated from AP
      species: FIELD_PATHS.DETAILS_SPECIES,
      culture: FIELD_PATHS.DETAILS_CULTURE,
      profession: FIELD_PATHS.DETAILS_CAREER, // IMPORTANT: 'career' not 'profession'
      size: FIELD_PATHS.STATUS_SIZE,

      // Characteristics (Eigenschaften)
      characteristics: FIELD_PATHS.CHARACTERISTICS,
      mu: FIELD_PATHS.CHAR_MU,
      kl: FIELD_PATHS.CHAR_KL,
      in: FIELD_PATHS.CHAR_IN,
      ch: FIELD_PATHS.CHAR_CH,
      ff: FIELD_PATHS.CHAR_FF,
      ge: FIELD_PATHS.CHAR_GE,
      ko: FIELD_PATHS.CHAR_KO,
      kk: FIELD_PATHS.CHAR_KK,

      // Status values
      wounds: FIELD_PATHS.STATUS_WOUNDS,
      lifePoints: FIELD_PATHS.STATUS_WOUNDS_CURRENT, // wounds.current has actual LeP
      astralenergy: FIELD_PATHS.STATUS_ASTRAL,
      karmaenergy: FIELD_PATHS.STATUS_KARMA,
      speed: FIELD_PATHS.STATUS_SPEED,
      initiative: FIELD_PATHS.STATUS_INITIATIVE,
      dodge: FIELD_PATHS.STATUS_DODGE,
      armor: FIELD_PATHS.STATUS_ARMOR,

      // Tradition
      tradition: FIELD_PATHS.TRADITION,

      // D&D5e-specific paths don't exist in DSA5
      challengeRating: null,
      creatureType: null,
      alignment: null,
      hitPoints: null,
      armorClass: null,
      legendaryActions: null,
      legendaryResistances: null,

      // PF2e-specific paths don't exist in DSA5
      perception: null,
      saves: null,
      rarity: null,
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): any {
    const dsa5Creature = creature as DSA5CreatureIndex;
    const formatted: any = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel,
      },
    };

    // Add DSA5 specific stats
    if (dsa5Creature.systemData) {
      const stats: any = {};

      if (dsa5Creature.systemData.level !== undefined) {
        stats.level = dsa5Creature.systemData.level;

        // Add experience level name (e.g., "Erfahren")
        const expLevel = getExperienceLevel(dsa5Creature.systemData.experiencePoints ?? 0);
        stats.experienceLevel = expLevel.name;
      }

      if (dsa5Creature.systemData.species) {
        stats.species = dsa5Creature.systemData.species;
      }

      if (dsa5Creature.systemData.culture) {
        stats.culture = dsa5Creature.systemData.culture;
      }

      if (dsa5Creature.systemData.size) {
        stats.size = dsa5Creature.systemData.size;
      }

      if (dsa5Creature.systemData.lifePoints) {
        stats.lifePoints = dsa5Creature.systemData.lifePoints;
      }

      if (dsa5Creature.systemData.meleeDefense) {
        stats.meleeDefense = dsa5Creature.systemData.meleeDefense;
      }

      if (dsa5Creature.systemData.hasSpells) {
        stats.spellcaster = true;
      }

      if (Object.keys(stats).length > 0) {
        formatted.stats = stats;
      }
    }

    if (creature.img) {
      formatted.hasImage = true;
    }

    return formatted;
  }

  formatCreatureForDetails(creature: SystemCreatureIndex): any {
    const dsa5Creature = creature as DSA5CreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    // Add additional details
    if (dsa5Creature.systemData) {
      const expLevel = getExperienceLevel(dsa5Creature.systemData.experiencePoints ?? 0);

      formatted.detailedStats = {
        level: dsa5Creature.systemData.level,
        experienceLevel: {
          name: expLevel.name,
          nameEn: expLevel.nameEn,
          level: expLevel.level,
          apRange: `${expLevel.min}-${expLevel.max === Infinity ? '∞' : expLevel.max}`,
        },
        experiencePoints: dsa5Creature.systemData.experiencePoints,
        species: dsa5Creature.systemData.species,
        culture: dsa5Creature.systemData.culture,
        profession: dsa5Creature.systemData.profession,
        size: dsa5Creature.systemData.size,
        lifePoints: dsa5Creature.systemData.lifePoints,
        meleeDefense: dsa5Creature.systemData.meleeDefense,
        rangedDefense: dsa5Creature.systemData.rangedDefense,
        armor: dsa5Creature.systemData.armor,
        hasSpells: dsa5Creature.systemData.hasSpells,
        hasAstralEnergy: dsa5Creature.systemData.hasAstralEnergy,
        hasKarmaEnergy: dsa5Creature.systemData.hasKarmaEnergy,
        traits: dsa5Creature.systemData.traits || [],
        rarity: dsa5Creature.systemData.rarity,
      };
    }

    if (creature.img) {
      formatted.img = creature.img;
    }

    return formatted;
  }

  describeFilters(filters: Record<string, any>): string {
    const validated = DSA5FiltersSchema.safeParse(filters);
    if (!validated.success) {
      return 'ungültige Filter';
    }

    return describeDSA5Filters(validated.data as DSA5Filters);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const dsa5Creature = creature as DSA5CreatureIndex;

    // DSA5: Use Experience Level (Erfahrungsgrad 1-7)
    if (dsa5Creature.systemData?.level !== undefined) {
      return dsa5Creature.systemData.level;
    }

    return undefined;
  }

  /**
   * Extract character statistics from actor data
   */
  extractCharacterStats(actorData: any): any {
    const system = actorData.system || {};
    const stats: any = {};

    // Basic info
    stats.name = actorData.name;
    stats.type = actorData.type;

    // Experience and Level
    const totalAP = system.details?.experience?.total ?? 0;
    const spentAP = system.details?.experience?.spent ?? 0;

    if (totalAP > 0) {
      const expLevel = getExperienceLevel(totalAP);
      stats.experience = {
        total: totalAP,
        spent: spentAP,
        available: totalAP - spentAP,
        level: expLevel.level,
        levelName: expLevel.name,
        levelNameEn: expLevel.nameEn,
      };
    }

    // LeP (Lebensenergie) - wounds.current contains actual current LeP
    const wounds = system.status?.wounds;
    if (wounds) {
      stats.lifePoints = {
        current: wounds.current ?? 0,
        max: wounds.max ?? 0,
      };
    }

    // AsP (Astralenergie)
    const astral = system.status?.astralenergy;
    if (astral && astral.max > 0) {
      stats.astralEnergy = {
        current: astral.value ?? 0,
        max: astral.max ?? 0,
      };
    }

    // KaP (Karmaenergie)
    const karma = system.status?.karmaenergy;
    if (karma && karma.max > 0) {
      stats.karmaEnergy = {
        current: karma.value ?? 0,
        max: karma.max ?? 0,
      };
    }

    // Eigenschaften (Characteristics: MU, KL, IN, CH, FF, GE, KO, KK)
    if (system.characteristics) {
      stats.characteristics = {};
      for (const [key, eigenschaft] of Object.entries(system.characteristics)) {
        const eigenschaftData = eigenschaft as any;
        const upperKey = key.toUpperCase();
        stats.characteristics[upperKey] = {
          value: eigenschaftData.value ?? 8,
          initial: eigenschaftData.initial ?? 8,
          name: EIGENSCHAFT_NAMES[upperKey]?.german,
          nameEn: EIGENSCHAFT_NAMES[upperKey]?.english,
        };
      }
    }

    // Combat values
    const initiative = system.status?.initiative?.value ?? system.status?.initiative;
    if (initiative !== undefined) {
      stats.initiative = initiative;
    }

    const speed = system.status?.speed?.value ?? system.status?.speed;
    if (speed !== undefined) {
      stats.speed = speed;
    }

    const dodge = system.status?.dodge?.value ?? system.status?.dodge;
    if (dodge !== undefined) {
      stats.dodge = dodge;
    }

    const armor = system.status?.armour?.value ?? system.status?.armor?.value ?? 0;
    if (armor) {
      stats.armor = armor;
    }

    // Identity info
    if (system.details) {
      const identity: any = {};

      const species = system.details.species?.value;
      if (species) {
        identity.species = species;
      }

      const culture = system.details.culture?.value;
      if (culture) {
        identity.culture = culture;
      }

      const career = system.details.career?.value;
      if (career) {
        identity.profession = career;
      }

      if (Object.keys(identity).length > 0) {
        stats.identity = identity;
      }
    }

    // Size
    const size = system.status?.size?.value;
    if (size) {
      stats.size = size;
    }

    // Tradition (magical/clerical)
    if (system.tradition) {
      const tradition: any = {};

      if (system.tradition.magical) {
        tradition.magical = system.tradition.magical;
      }

      if (system.tradition.clerical) {
        tradition.clerical = system.tradition.clerical;
      }

      if (Object.keys(tradition).length > 0) {
        stats.tradition = tradition;
      }
    }

    // Spellcasting detection
    const hasSpells = !!(astral?.max || karma?.max || system.tradition);
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        hasAstralEnergy: !!astral?.max,
        hasKarmaEnergy: !!karma?.max,
      };
    }

    return stats;
  }
}
