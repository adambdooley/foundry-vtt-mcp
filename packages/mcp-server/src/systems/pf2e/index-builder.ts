/**
 * Pathfinder 2e Index Builder
 *
 * Builds enhanced creature index from Foundry compendiums.
 * This code runs in Foundry's browser context, not Node.js.
 *
 * Extracted from data-access.ts for modular system support.
 */

import type { IndexBuilder, PF2eCreatureIndex } from '../types.js';

// Foundry browser globals (unavailable in Node.js TypeScript compilation)
declare const ui: any;

/**
 * PF2e implementation of IndexBuilder
 */
export class PF2eIndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'foundry-mcp-bridge') {
    this.moduleId = moduleId;
  }

  getSystemId() {
    return 'pf2e' as const;
  }

  /**
   * Build enhanced creature index from compendium packs
   */
  async buildIndex(packs: any[], force = false): Promise<PF2eCreatureIndex[]> {
    const startTime = Date.now();
    let progressNotification: any = null;
    let totalErrors = 0;

    try {
      const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: PF2eCreatureIndex[] = [];

      console.log(`[${this.moduleId}] Starting PF2e creature index build from ${actorPacks.length} packs...`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(`Starting PF2e creature index build from ${actorPacks.length} packs...`);
      }

      let currentPack = 0;
      for (const pack of actorPacks) {
        currentPack++;

        if (progressNotification && typeof ui !== 'undefined') {
          progressNotification.remove();
        }
        if (typeof ui !== 'undefined' && ui.notifications) {
          progressNotification = ui.notifications.info(
            `Building PF2e index: Pack ${currentPack}/${actorPacks.length} (${pack.metadata.label})...`
          );
        }

        const result = await this.extractDataFromPack(pack);
        enhancedCreatures.push(...result.creatures);
        totalErrors += result.errors;
      }

      if (progressNotification && typeof ui !== 'undefined') {
        progressNotification.remove();
      }
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(`Saving PF2e index to world database... (${enhancedCreatures.length} creatures)`);
      }

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `PF2e creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;

      console.log(`[${this.moduleId}] ${successMessage}`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(successMessage);
      }

      return enhancedCreatures;

    } catch (error) {
      if (progressNotification && typeof ui !== 'undefined') {
        progressNotification.remove();
      }

      const errorMessage = `Failed to build PF2e creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${this.moduleId}] ${errorMessage}`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.error(errorMessage);
      }

      throw error;
    }
  }

  /**
   * Extract creature data from a single compendium pack
   */
  async extractDataFromPack(pack: any): Promise<{ creatures: PF2eCreatureIndex[]; errors: number }> {
    const creatures: PF2eCreatureIndex[] = [];
    let errors = 0;

    try {
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          if (doc.type !== 'npc' && doc.type !== 'character') {
            continue;
          }

          const result = this.extractCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }

        } catch (error) {
          console.warn(`[${this.moduleId}] Failed to extract PF2e data from ${doc.name} in ${pack.metadata.label}:`, error);
          errors++;
        }
      }

    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to load documents from ${pack.metadata.label}:`, error);
      errors++;
    }

    return { creatures, errors };
  }

  /**
   * Extract Pathfinder 2e creature data from a single document
   */
  extractCreatureData(doc: any, pack: any): { creature: PF2eCreatureIndex; errors: number } | null {
    try {
      const system = doc.system || {};

      // Level extraction (PF2e primary power metric)
      let level = system.details?.level?.value ?? 0;
      level = Number(level) || 0;

      // Traits extraction (PF2e uses array of traits)
      const traitsValue = system.traits?.value || [];
      const traits = Array.isArray(traitsValue) ? traitsValue : [];

      // Extract primary creature type from traits
      const creatureTraits = ['aberration', 'animal', 'beast', 'celestial',
                              'construct', 'dragon', 'elemental', 'fey',
                              'fiend', 'fungus', 'humanoid', 'monitor',
                              'ooze', 'plant', 'undead'];
      const creatureType = traits.find((t: string) =>
        creatureTraits.includes(t.toLowerCase())
      )?.toLowerCase() || 'unknown';

      // Rarity extraction (PF2e specific)
      const rarity = system.traits?.rarity || 'common';

      // Size extraction
      let size = system.traits?.size?.value || 'med';
      // Normalize PF2e size values (tiny, sm, med, lg, huge, grg)
      const sizeMap: Record<string, string> = {
        'tiny': 'tiny',
        'sm': 'small',
        'med': 'medium',
        'lg': 'large',
        'huge': 'huge',
        'grg': 'gargantuan'
      };
      size = sizeMap[size.toLowerCase()] || 'medium';

      // Hit Points
      const hitPoints = system.attributes?.hp?.max || 0;

      // Armor Class
      const armorClass = system.attributes?.ac?.value || 10;

      // Spellcasting detection (PF2e uses spellcasting entries)
      const spellcasting = system.spellcasting || {};
      const hasSpellcasting = Object.keys(spellcasting).length > 0;

      // Alignment
      let alignment = system.details?.alignment?.value || 'N';
      if (typeof alignment !== 'string') {
        alignment = String(alignment || 'N');
      }

      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img,
          system: 'pf2e',
          systemData: {
            level,
            traits,
            size,
            alignment: alignment.toUpperCase(),
            rarity,
            hasSpellcasting,
            hitPoints,
            armorClass
          }
        },
        errors: 0
      };

    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract PF2e data from ${doc.name}:`, error);

      // Fallback with error count
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img || '',
          system: 'pf2e',
          systemData: {
            level: 0,
            traits: [],
            size: 'medium',
            alignment: 'N',
            rarity: 'common',
            hasSpellcasting: false,
            hitPoints: 1,
            armorClass: 10
          }
        },
        errors: 1
      };
    }
  }
}
