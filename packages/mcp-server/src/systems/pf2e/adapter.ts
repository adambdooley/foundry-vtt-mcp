/**
 * Pathfinder 2e System Adapter
 *
 * Implements SystemAdapter interface for Pathfinder 2nd Edition support.
 * Handles creature indexing, filtering, formatting, and data extraction.
 */

import type { SystemAdapter, SystemMetadata, SystemCreatureIndex, PF2eCreatureIndex } from '../types.js';
import { PF2eFiltersSchema, matchesPF2eFilters, describePF2eFilters, type PF2eFilters } from './filters.js';

/**
 * Pathfinder 2e system adapter
 */
export class PF2eAdapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'pf2e',
      name: 'pf2e',
      displayName: 'Pathfinder 2nd Edition',
      version: '1.0.0',
      description: 'Support for PF2e game system with Level, traits, rarity, and spellcasting entries',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true // Uses Level
      }
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'pf2e';
  }

  /**
   * Extract creature data from Foundry document for indexing
   * This is called by the index builder in Foundry's browser context
   */
  extractCreatureData(doc: any, pack: any): { creature: SystemCreatureIndex; errors: number } | null {
    // Implementation is in index-builder.ts since it runs in browser
    // This method is here for type compliance but delegates to IndexBuilder
    throw new Error('extractCreatureData should be called from PF2eIndexBuilder, not the adapter');
  }

  getFilterSchema() {
    return PF2eFiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, any>): boolean {
    // Validate filters match PF2e schema
    const validated = PF2eFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return false;
    }

    return matchesPF2eFilters(creature, validated.data as PF2eFilters);
  }

  getDataPaths(): Record<string, string | null> {
    return {
      // Pathfinder 2e specific paths
      level: 'system.details.level.value',
      creatureType: 'system.traits.value', // Array of traits
      size: 'system.traits.size.value',
      alignment: 'system.details.alignment.value',
      rarity: 'system.traits.rarity',
      traits: 'system.traits.value', // All traits as array
      hitPoints: 'system.attributes.hp',
      armorClass: 'system.attributes.ac.value',
      abilities: 'system.abilities',
      skills: 'system.skills',
      perception: 'system.perception',
      saves: 'system.saves',
      // PF2e doesn't have CR or legendary actions
      challengeRating: null,
      legendaryActions: null,
      legendaryResistances: null,
      spells: null // PF2e uses spellcasting entries instead
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): any {
    const pf2eCreature = creature as PF2eCreatureIndex;
    const formatted: any = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel
      }
    };

    // Add PF2e specific stats
    if (pf2eCreature.systemData) {
      const stats: any = {};

      if (pf2eCreature.systemData.level !== undefined) {
        stats.level = pf2eCreature.systemData.level;
      }

      if (pf2eCreature.systemData.traits && pf2eCreature.systemData.traits.length > 0) {
        stats.traits = pf2eCreature.systemData.traits;

        // Extract primary creature type from traits
        const creatureTraits = ['aberration', 'animal', 'beast', 'celestial', 'construct',
                                'dragon', 'elemental', 'fey', 'fiend', 'fungus', 'humanoid',
                                'monitor', 'ooze', 'plant', 'undead'];
        const primaryType = pf2eCreature.systemData.traits.find((t: string) =>
          creatureTraits.includes(t.toLowerCase())
        );
        if (primaryType) stats.creatureType = primaryType;
      }

      if (pf2eCreature.systemData.rarity) {
        stats.rarity = pf2eCreature.systemData.rarity;
      }

      if (pf2eCreature.systemData.size) {
        stats.size = pf2eCreature.systemData.size;
      }

      if (pf2eCreature.systemData.alignment) {
        stats.alignment = pf2eCreature.systemData.alignment;
      }

      if (pf2eCreature.systemData.hitPoints) {
        stats.hitPoints = pf2eCreature.systemData.hitPoints;
      }

      if (pf2eCreature.systemData.armorClass) {
        stats.armorClass = pf2eCreature.systemData.armorClass;
      }

      if (pf2eCreature.systemData.hasSpellcasting) {
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
    const pf2eCreature = creature as PF2eCreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    // Add additional details
    if (pf2eCreature.systemData) {
      formatted.detailedStats = {
        level: pf2eCreature.systemData.level,
        traits: pf2eCreature.systemData.traits,
        size: pf2eCreature.systemData.size,
        alignment: pf2eCreature.systemData.alignment,
        rarity: pf2eCreature.systemData.rarity,
        hitPoints: pf2eCreature.systemData.hitPoints,
        armorClass: pf2eCreature.systemData.armorClass,
        hasSpellcasting: pf2eCreature.systemData.hasSpellcasting
      };
    }

    if (creature.img) {
      formatted.img = creature.img;
    }

    return formatted;
  }

  describeFilters(filters: Record<string, any>): string {
    const validated = PF2eFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return 'invalid filters';
    }

    return describePF2eFilters(validated.data as PF2eFilters);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const pf2eCreature = creature as PF2eCreatureIndex;

    // PF2e: Level is the primary metric
    if (pf2eCreature.systemData?.level !== undefined) {
      return pf2eCreature.systemData.level;
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

    // Level
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
          value: abilityData.value ?? abilityData.mod ?? 0,
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
          modifier: skillData.value ?? skillData.mod ?? 0,
          rank: skillData.rank ?? 0,
          proficient: (skillData.rank ?? 0) > 0
        };
      }
    }

    // Perception
    if (system.perception) {
      stats.perception = {
        modifier: system.perception.value ?? system.perception.mod ?? 0,
        rank: system.perception.rank ?? 0
      };
    }

    // Saves
    if (system.saves) {
      stats.saves = {};
      for (const [key, save] of Object.entries(system.saves)) {
        const saveData = save as any;
        stats.saves[key] = {
          modifier: saveData.value ?? saveData.mod ?? 0,
          rank: saveData.rank ?? 0
        };
      }
    }

    // Creature-specific info
    if (actorData.type === 'npc') {
      const traits = system.traits?.value || [];
      if (Array.isArray(traits) && traits.length > 0) {
        stats.traits = traits;

        // Extract primary creature type
        const creatureTraits = ['aberration', 'animal', 'beast', 'celestial', 'construct',
                                'dragon', 'elemental', 'fey', 'fiend', 'fungus', 'humanoid',
                                'monitor', 'ooze', 'plant', 'undead'];
        const primaryType = traits.find((t: string) => creatureTraits.includes(t.toLowerCase()));
        if (primaryType) {
          stats.creatureType = primaryType;
        }
      }

      const size = system.traits?.size?.value ?? system.traits?.size;
      if (size) {
        stats.size = size;
      }

      const alignment = system.details?.alignment?.value ?? system.details?.alignment;
      if (alignment) {
        stats.alignment = alignment;
      }

      const rarity = system.traits?.rarity;
      if (rarity) {
        stats.rarity = rarity;
      }
    }

    // Spellcasting
    const spellcasting = system.spellcasting || {};
    const hasSpells = Object.keys(spellcasting).length > 0;
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        entries: Object.keys(spellcasting).length
      };
    }

    return stats;
  }
}
