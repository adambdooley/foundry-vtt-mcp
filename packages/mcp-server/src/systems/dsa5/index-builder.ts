/**
 * DSA5 Index Builder
 *
 * Builds enhanced creature index from Foundry compendiums.
 * This code runs in Foundry's browser context, not Node.js.
 *
 * Ported from foundry-module/src/tools/dsa5/creature-index.ts
 * Following v0.6.0 Registry Pattern.
 */

import type { IndexBuilder, DSA5CreatureIndex } from '../types.js';
import { SIZE_MAP_DE_TO_EN } from './constants.js';
import { getExperienceLevel } from './constants.js';

// Foundry browser globals (unavailable in Node.js TypeScript compilation)
declare const ui: any;

/**
 * Result of extractCreatureData operation
 */
interface DSA5ExtractionResult {
  creature: DSA5CreatureIndex;
  errors: number;
}

/**
 * DSA5 implementation of IndexBuilder
 */
export class DSA5IndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'foundry-mcp-bridge') {
    this.moduleId = moduleId;
  }

  getSystemId() {
    return 'dsa5' as const;
  }

  /**
   * Build enhanced creature index from compendium packs
   */
  async buildIndex(packs: any[], force = false): Promise<DSA5CreatureIndex[]> {
    const startTime = Date.now();
    let progressNotification: any = null;
    let totalErrors = 0;

    try {
      const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: DSA5CreatureIndex[] = [];

      // Show initial progress notification
      console.log(
        `[${this.moduleId}] Starte DSA5 Kreaturen-Index aus ${actorPacks.length} Paketen...`
      );
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(`Starte DSA5 Kreaturen-Index aus ${actorPacks.length} Paketen...`);
      }

      for (let i = 0; i < actorPacks.length; i++) {
        const pack = actorPacks[i];
        const currentPack = i + 1;

        // Update progress notification
        if (progressNotification && typeof ui !== 'undefined') {
          progressNotification.remove();
        }
        if (typeof ui !== 'undefined' && ui.notifications) {
          progressNotification = ui.notifications.info(
            `Erstelle DSA5 Index: Paket ${currentPack}/${actorPacks.length} (${pack.metadata.label})...`
          );
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
        } catch (error) {
          console.warn(`[${this.moduleId}] Failed to process pack ${pack.metadata.label}:`, error);
          if (typeof ui !== 'undefined' && ui.notifications) {
            ui.notifications.warn(
              `Warnung: Fehler beim Indizieren von "${pack.metadata.label}" - fahre fort`
            );
          }
        }
      }

      // Clear progress notification
      if (progressNotification && typeof ui !== 'undefined') {
        progressNotification.remove();
      }

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} Extraktionsfehler)` : '';
      const successMessage = `DSA5 Kreaturen-Index fertig! ${enhancedCreatures.length} Kreaturen indiziert aus ${actorPacks.length} Paketen in ${buildTimeSeconds}s${errorText}`;

      console.log(`[${this.moduleId}] ${successMessage}`);
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.info(successMessage);
      }

      return enhancedCreatures;
    } catch (error) {
      if (progressNotification && typeof ui !== 'undefined') {
        progressNotification.remove();
      }

      const errorMessage = `Fehler beim Erstellen des DSA5 Kreaturen-Index: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
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
  async extractDataFromPack(
    pack: any
  ): Promise<{ creatures: DSA5CreatureIndex[]; errors: number }> {
    const creatures: DSA5CreatureIndex[] = [];
    let errors = 0;

    try {
      // Load all documents from pack
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          // Only process NPCs, characters, and creatures
          if (doc.type !== 'npc' && doc.type !== 'character' && doc.type !== 'creature') {
            continue;
          }

          const result = this.extractCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }
        } catch (error) {
          console.warn(
            `[${this.moduleId}] Failed to extract DSA5 data from ${doc.name} in ${pack.metadata.label}:`,
            error
          );
          errors++;
        }
      }
    } catch (error) {
      console.warn(
        `[${this.moduleId}] Failed to load documents from ${pack.metadata.label}:`,
        error
      );
      errors++;
    }

    return { creatures, errors };
  }

  /**
   * Extract DSA5 creature data from a single Foundry document
   *
   * @param doc - Foundry actor document
   * @param pack - Source compendium pack
   * @returns Extracted creature data or null if failed
   */
  extractCreatureData(doc: any, pack: any): DSA5ExtractionResult | null {
    try {
      const system = doc.system || {};

      // Extract experience points (AP)
      const experiencePoints =
        system.details?.experience?.total ??
        system.experience?.total ??
        system.status?.experience ??
        0;

      // Calculate level from AP using EXPERIENCE_LEVELS
      const experienceLevel = getExperienceLevel(experiencePoints);
      const level = experienceLevel.level;

      // Extract species
      let species =
        system.details?.species?.value ??
        system.species?.value ??
        system.details?.type ??
        'Unbekannt';
      if (typeof species !== 'string') {
        species = String(species || 'Unbekannt');
      }

      // Extract culture (with default)
      let culture = system.details?.culture?.value ?? system.culture?.value ?? 'Keine';
      if (typeof culture !== 'string') {
        culture = String(culture || 'Keine');
      }

      // Extract profession/career
      let profession =
        system.details?.career?.value ??
        system.details?.profession?.value ??
        system.career?.value ??
        undefined;
      if (profession && typeof profession !== 'string') {
        profession = String(profession);
      }

      // Extract and normalize size
      let size = system.status?.size?.value ?? system.size?.value ?? 'mittel';
      if (typeof size !== 'string') {
        size = String(size || 'mittel');
      }
      size = SIZE_MAP_DE_TO_EN[size.toLowerCase()] || 'medium';

      // Extract combat values
      // Note: wounds.current contains actual LeP (based on template.json reverse engineering)
      const lifePoints =
        system.status?.wounds?.max ?? system.status?.wounds?.current ?? system.wounds?.max ?? 1;

      const meleeDefense =
        system.status?.defense?.value ?? system.defense?.value ?? system.status?.defense ?? 10;

      const rangedDefense =
        system.status?.rangeDefense?.value ?? system.rangeDefense?.value ?? meleeDefense;

      const armor = system.status?.armour?.value ?? system.status?.armor?.value ?? 0;

      // Detect spellcasting capability
      const hasAstralEnergy = !!system.status?.astralenergy?.max;
      const hasKarmaEnergy = !!system.status?.karmaenergy?.max;
      const hasSpells = !!(
        hasAstralEnergy ||
        hasKarmaEnergy ||
        system.spells ||
        system.liturgies ||
        system.details?.tradition
      );

      // Extract traits
      const traitsValue = system.details?.traits?.value || system.traits?.value || [];
      const traits = Array.isArray(traitsValue) ? traitsValue : [];

      // Optional fields
      const rarity = system.details?.rarity ?? system.rarity ?? undefined;

      return {
        creature: {
          // Base SystemCreatureIndex fields
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img,
          system: 'dsa5',

          // DSA5-specific systemData
          systemData: {
            level,
            experiencePoints,
            species,
            culture,
            profession,
            size,
            lifePoints,
            meleeDefense,
            rangedDefense,
            armor,
            hasSpells,
            hasAstralEnergy,
            hasKarmaEnergy,
            traits,
            ...(rarity && { rarity }),
          },
        },
        errors: 0,
      };
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract DSA5 data from ${doc.name}:`, error);

      // Return fallback data with error flag
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img,
          system: 'dsa5',
          systemData: {
            level: 1,
            experiencePoints: 0,
            species: 'Unbekannt',
            culture: 'Keine',
            size: 'medium',
            lifePoints: 1,
            meleeDefense: 10,
            rangedDefense: 10,
            armor: 0,
            hasSpells: false,
            traits: [],
          },
        },
        errors: 1,
      };
    }
  }
}
