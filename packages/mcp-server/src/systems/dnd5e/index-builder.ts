/**
 * D&D 5e Index Builder
 *
 * Builds enhanced creature index from Foundry compendiums.
 * This code runs in Foundry's browser context, not Node.js.
 *
 * Extracted from data-access.ts for modular system support.
 */

import type { IndexBuilder, DnD5eCreatureIndex } from '../types.js';

// Foundry browser globals (unavailable in Node.js TypeScript compilation)
declare const ui: any;

/**
 * D&D 5e implementation of IndexBuilder
 */
export class DnD5eIndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'foundry-mcp-bridge') {
    this.moduleId = moduleId;
  }

  getSystemId() {
    return 'dnd5e' as const;
  }

  /**
   * Build enhanced creature index from compendium packs
   */
  async buildIndex(packs: any[], force = false): Promise<DnD5eCreatureIndex[]> {
    const startTime = Date.now();
    let progressNotification: any = null;
    let totalErrors = 0;

    try {
      const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: DnD5eCreatureIndex[] = [];

      // Show initial progress notification
      console.log(`[${this.moduleId}] Starting D&D 5e creature index build from ${actorPacks.length} packs...`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(`Starting enhanced creature index build from ${actorPacks.length} packs...`);
      }

      for (let i = 0; i < actorPacks.length; i++) {
        const pack = actorPacks[i];
        const progressPercent = Math.round((i / actorPacks.length) * 100);

        // Update progress notification
        if (i % 3 === 0 || pack.metadata.label.toLowerCase().includes('monster')) {
          if (progressNotification && typeof ui !== 'undefined') {
            progressNotification.remove();
          }
          if (typeof ui !== 'undefined' && ui.notifications) {
            progressNotification = ui.notifications.info(
              `Building creature index... ${progressPercent}% (${i + 1}/${actorPacks.length}) Processing: ${pack.metadata.label}`
            );
          }
        }

        try {
          // Ensure pack index is loaded
          if (!pack.indexed) {
            await pack.getIndex({});
          }

          // Process creatures in this pack
          const packResult = await this.extractDataFromPack(pack);
          enhancedCreatures.push(...packResult.creatures);
          totalErrors += packResult.errors;

          // Show milestone notifications
          if (i === 0 || (i + 1) % 5 === 0 || i === actorPacks.length - 1) {
            const totalCreaturesSoFar = enhancedCreatures.length;
            if (progressNotification && typeof ui !== 'undefined') {
              progressNotification.remove();
            }
            if (typeof ui !== 'undefined' && ui.notifications) {
              progressNotification = ui.notifications.info(
                `Index Progress: ${i + 1}/${actorPacks.length} packs complete, ${totalCreaturesSoFar} creatures indexed`
              );
            }
          }

        } catch (error) {
          console.warn(`[${this.moduleId}] Failed to process pack ${pack.metadata.label}:`, error);
          if (typeof ui !== 'undefined' && ui.notifications) {
            ui.notifications.warn(`Warning: Failed to index pack "${pack.metadata.label}" - continuing with other packs`);
          }
        }
      }

      // Clear progress notification
      if (progressNotification && typeof ui !== 'undefined') {
        progressNotification.remove();
      }

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `D&D 5e creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;

      console.log(`[${this.moduleId}] ${successMessage}`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(successMessage);
      }

      return enhancedCreatures;

    } catch (error) {
      if (progressNotification && typeof ui !== 'undefined') {
        progressNotification.remove();
      }

      const errorMessage = `Failed to build D&D 5e creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
  async extractDataFromPack(pack: any): Promise<{ creatures: DnD5eCreatureIndex[]; errors: number }> {
    const creatures: DnD5eCreatureIndex[] = [];
    let errors = 0;

    try {
      // Load all documents from pack
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          // Only process NPCs and characters
          if (doc.type !== 'npc' && doc.type !== 'character') {
            continue;
          }

          const result = this.extractCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }

        } catch (error) {
          console.warn(`[${this.moduleId}] Failed to extract data from ${doc.name} in ${pack.metadata.label}:`, error);
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
   * Extract D&D 5e creature data from a single document
   */
  extractCreatureData(doc: any, pack: any): { creature: DnD5eCreatureIndex; errors: number } | null {
    try {
      const system = doc.system || {};

      // Extract challenge rating with comprehensive fallbacks
      let challengeRating = system.details?.cr ??
                           system.details?.cr?.value ??
                           system.cr?.value ?? system.cr ??
                           system.attributes?.cr?.value ?? system.attributes?.cr ??
                           system.challenge?.rating ?? system.challenge?.cr ?? 0;

      // Handle null values
      if (challengeRating === null || challengeRating === undefined) {
        challengeRating = 0;
      }

      // Handle fractional CR strings
      if (typeof challengeRating === 'string') {
        if (challengeRating === '1/8') challengeRating = 0.125;
        else if (challengeRating === '1/4') challengeRating = 0.25;
        else if (challengeRating === '1/2') challengeRating = 0.5;
        else challengeRating = parseFloat(challengeRating) || 0;
      }

      challengeRating = Number(challengeRating) || 0;

      // Extract creature type
      let creatureType = system.details?.type?.value ??
                         system.details?.type ??
                         system.type?.value ?? system.type ??
                         system.race?.value ?? system.race ??
                         system.details?.race ?? 'unknown';

      if (creatureType === null || creatureType === undefined || creatureType === '') {
        creatureType = 'unknown';
      }

      if (typeof creatureType !== 'string') {
        creatureType = String(creatureType || 'unknown');
      }

      // Extract size
      let size = system.traits?.size?.value || system.traits?.size ||
                 system.size?.value || system.size ||
                 system.details?.size || 'medium';

      if (typeof size !== 'string') {
        size = String(size || 'medium');
      }

      // Extract hit points
      const hitPoints = system.attributes?.hp?.max || system.hp?.max ||
                       system.attributes?.hp?.value || system.hp?.value ||
                       system.health?.max || system.health?.value || 0;

      // Extract armor class
      const armorClass = system.attributes?.ac?.value || system.ac?.value ||
                        system.attributes?.ac || system.ac ||
                        system.armor?.value || system.armor || 10;

      // Extract alignment
      let alignment = system.details?.alignment?.value || system.details?.alignment ||
                      system.alignment?.value || system.alignment || 'unaligned';

      if (typeof alignment !== 'string') {
        alignment = String(alignment || 'unaligned');
      }

      // Check for spellcasting
      const hasSpellcasting = !!(system.spells ||
                                system.attributes?.spellcasting ||
                                (system.details?.spellLevel && system.details.spellLevel > 0) ||
                                (system.resources?.spell && system.resources.spell.max > 0) ||
                                system.spellcasting ||
                                system.traits?.spellcasting ||
                                system.details?.spellcaster);

      // Check for legendary actions
      const hasLegendaryActions = !!(system.resources?.legact ||
                                    system.legendary ||
                                    (system.resources?.legres && system.resources.legres.value > 0) ||
                                    system.details?.legendary ||
                                    system.traits?.legendary ||
                                    (system.resources?.legendary && system.resources.legendary.max > 0));

      // Extract character level (for PCs)
      const level = system.details?.level?.value || system.details?.level || system.level || undefined;

      // Successful extraction
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img,
          system: 'dnd5e',
          systemData: {
            challengeRating,
            creatureType: creatureType.toLowerCase(),
            size: size.toLowerCase(),
            alignment: alignment.toLowerCase(),
            level,
            hasSpellcasting,
            hasLegendaryActions,
            hitPoints,
            armorClass
          }
        },
        errors: 0
      };

    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract D&D 5e data from ${doc.name}:`, error);

      // Return basic fallback with error count
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img || '',
          system: 'dnd5e',
          systemData: {
            challengeRating: 0,
            creatureType: 'unknown',
            size: 'medium',
            hitPoints: 1,
            armorClass: 10,
            hasSpellcasting: false,
            hasLegendaryActions: false,
            alignment: 'unaligned'
          }
        },
        errors: 1
      };
    }
  }
}
