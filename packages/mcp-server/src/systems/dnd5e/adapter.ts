/**
 * D&D 5e System Adapter
 *
 * Implements SystemAdapter interface for D&D 5th Edition support.
 * Handles creature indexing, filtering, formatting, and data extraction.
 */

import type { SystemAdapter, SystemMetadata, SystemCreatureIndex, DnD5eCreatureIndex } from '../types.js';
import { DnD5eFiltersSchema, matchesDnD5eFilters, describeDnD5eFilters, type DnD5eFilters } from './filters.js';

/**
 * D&D 5e system adapter
 */
export class DnD5eAdapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'dnd5e',
      name: 'dnd5e',
      displayName: 'Dungeons & Dragons 5th Edition',
      version: '1.0.0',
      description: 'Support for D&D 5e game system with Challenge Rating, creature types, and legendary actions',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true // Uses Challenge Rating
      }
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'dnd5e';
  }

  /**
   * Extract creature data from Foundry document for indexing
   * This is called by the index builder in Foundry's browser context
   */
  extractCreatureData(doc: any, pack: any): { creature: SystemCreatureIndex; errors: number } | null {
    // Implementation is in index-builder.ts since it runs in browser
    // This method is here for type compliance but delegates to IndexBuilder
    throw new Error('extractCreatureData should be called from DnD5eIndexBuilder, not the adapter');
  }

  getFilterSchema() {
    return DnD5eFiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, any>): boolean {
    // Validate filters match D&D 5e schema
    const validated = DnD5eFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return false;
    }

    return matchesDnD5eFilters(creature, validated.data as DnD5eFilters);
  }

  getDataPaths(): Record<string, string | null> {
    return {
      // D&D 5e specific paths
      challengeRating: 'system.details.cr',
      creatureType: 'system.details.type.value',
      size: 'system.traits.size',
      alignment: 'system.details.alignment',
      level: 'system.details.level.value', // For NPCs/characters
      hitPoints: 'system.attributes.hp',
      armorClass: 'system.attributes.ac.value',
      abilities: 'system.abilities',
      skills: 'system.skills',
      spells: 'system.spells',
      legendaryActions: 'system.resources.legact',
      legendaryResistances: 'system.resources.legres',
      // PF2e-specific paths don't exist in D&D 5e
      perception: null,
      saves: null,
      rarity: null
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): any {
    const dnd5eCreature = creature as DnD5eCreatureIndex;
    const formatted: any = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel
      }
    };

    // Add D&D 5e specific stats
    if (dnd5eCreature.systemData) {
      const stats: any = {};

      if (dnd5eCreature.systemData.challengeRating !== undefined) {
        stats.challengeRating = dnd5eCreature.systemData.challengeRating;
      }

      if (dnd5eCreature.systemData.creatureType) {
        stats.creatureType = dnd5eCreature.systemData.creatureType;
      }

      if (dnd5eCreature.systemData.size) {
        stats.size = dnd5eCreature.systemData.size;
      }

      if (dnd5eCreature.systemData.alignment) {
        stats.alignment = dnd5eCreature.systemData.alignment;
      }

      if (dnd5eCreature.systemData.hitPoints) {
        stats.hitPoints = dnd5eCreature.systemData.hitPoints;
      }

      if (dnd5eCreature.systemData.armorClass) {
        stats.armorClass = dnd5eCreature.systemData.armorClass;
      }

      if (dnd5eCreature.systemData.hasLegendaryActions) {
        stats.hasLegendaryActions = true;
      }

      if (dnd5eCreature.systemData.hasSpellcasting) {
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
    const dnd5eCreature = creature as DnD5eCreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    // Add additional details
    if (dnd5eCreature.systemData) {
      formatted.detailedStats = {
        challengeRating: dnd5eCreature.systemData.challengeRating,
        creatureType: dnd5eCreature.systemData.creatureType,
        size: dnd5eCreature.systemData.size,
        alignment: dnd5eCreature.systemData.alignment,
        level: dnd5eCreature.systemData.level,
        hitPoints: dnd5eCreature.systemData.hitPoints,
        armorClass: dnd5eCreature.systemData.armorClass,
        hasSpellcasting: dnd5eCreature.systemData.hasSpellcasting,
        hasLegendaryActions: dnd5eCreature.systemData.hasLegendaryActions
      };
    }

    if (creature.img) {
      formatted.img = creature.img;
    }

    return formatted;
  }

  describeFilters(filters: Record<string, any>): string {
    const validated = DnD5eFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return 'invalid filters';
    }

    return describeDnD5eFilters(validated.data as DnD5eFilters);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const dnd5eCreature = creature as DnD5eCreatureIndex;

    // D&D 5e: Try CR first, then character level
    if (dnd5eCreature.systemData?.challengeRating !== undefined) {
      return dnd5eCreature.systemData.challengeRating;
    }

    if (dnd5eCreature.systemData?.level !== undefined) {
      return dnd5eCreature.systemData.level;
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

    // Challenge Rating or Level
    const cr = system.details?.cr ?? system.details?.cr?.value ?? system.cr;
    if (cr !== undefined && cr !== null) {
      stats.challengeRating = Number(cr);
    }

    const level = system.details?.level?.value ?? system.details?.level ?? system.level;
    if (level !== undefined && level !== null) {
      stats.level = Number(level);
    }

    // Hit Points
    const hp = system.attributes?.hp;
    if (hp) {
      stats.hitPoints = {
        current: hp.value ?? 0,
        max: hp.max ?? 0,
        temp: hp.temp ?? 0
      };
    }

    // Armor Class
    const ac = system.attributes?.ac?.value ?? system.attributes?.ac;
    if (ac !== undefined) {
      stats.armorClass = ac;
    }

    // Abilities (STR, DEX, CON, INT, WIS, CHA)
    if (system.abilities) {
      stats.abilities = {};
      for (const [key, ability] of Object.entries(system.abilities)) {
        const abilityData = ability as any;
        stats.abilities[key] = {
          value: abilityData.value ?? 10,
          modifier: abilityData.mod ?? 0
        };
      }
    }

    // Skills
    if (system.skills) {
      stats.skills = {};
      for (const [key, skill] of Object.entries(system.skills)) {
        const skillData = skill as any;
        stats.skills[key] = {
          value: skillData.value ?? 0,
          modifier: skillData.total ?? skillData.mod ?? 0,
          proficient: skillData.proficient ?? 0
        };
      }
    }

    // Creature-specific info
    if (actorData.type === 'npc') {
      const creatureType = system.details?.type?.value ?? system.details?.type;
      if (creatureType) {
        stats.creatureType = creatureType;
      }

      const size = system.traits?.size?.value ?? system.traits?.size ?? system.size;
      if (size) {
        stats.size = size;
      }

      const alignment = system.details?.alignment?.value ?? system.details?.alignment;
      if (alignment) {
        stats.alignment = alignment;
      }

      // Legendary actions
      const legact = system.resources?.legact;
      if (legact) {
        stats.legendaryActions = {
          available: legact.value ?? 0,
          max: legact.max ?? 0
        };
      }
    }

    // Spellcasting
    const hasSpells = !!(system.spells ||
                        system.attributes?.spellcasting ||
                        (system.details?.spellLevel && system.details.spellLevel > 0));
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        spellLevel: system.details?.spellLevel ?? 0
      };
    }

    return stats;
  }
}
