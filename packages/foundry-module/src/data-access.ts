import { MODULE_ID, ERROR_MESSAGES, TOKEN_DISPOSITIONS } from './constants.js';
import { permissionManager } from './permissions.js';
import { transactionManager } from './transaction-manager.js';
// Local type definitions to avoid shared package import issues
interface CharacterInfo {
  id: string;
  name: string;
  type: string;
  img?: string;
  system: Record<string, unknown>;
  items: CharacterItem[];
  effects: CharacterEffect[];
}

interface CharacterItem {
  id: string;
  name: string;
  type: string;
  img?: string;
  system: Record<string, unknown>;
}

interface CharacterEffect {
  id: string;
  name: string;
  icon?: string;
  disabled: boolean;
  duration?: {
    type: string;
    duration?: number;
    remaining?: number;
  };
}

interface CompendiumSearchResult {
  id: string;
  name: string;
  type: string;
  img?: string;
  pack: string;
  packLabel: string;
  system?: Record<string, unknown>;
  summary?: string;
  hasImage?: boolean;
  description?: string;
}

// D&D 5e Enhanced Creature Index
interface DnD5eCreatureIndex {
  id: string;
  name: string;
  type: string;
  pack: string;
  packLabel: string;
  challengeRating: number;
  creatureType: string;
  size: string;
  hitPoints: number;
  armorClass: number;
  hasSpells: boolean;
  hasLegendaryActions: boolean;
  alignment: string;
  description?: string;
  img?: string;
}

// Pathfinder 2e Enhanced Creature Index
interface PF2eCreatureIndex {
  id: string;
  name: string;
  type: string;
  pack: string;
  packLabel: string;
  level: number;                    // PF2e: -1 to 25+
  traits: string[];                 // PF2e: ['dragon', 'fire', 'amphibious']
  creatureType: string;             // Primary trait extracted from traits array
  rarity: string;                   // PF2e: 'common', 'uncommon', 'rare', 'unique'
  size: string;
  hitPoints: number;
  armorClass: number;
  hasSpells: boolean;
  alignment: string;
  description?: string;
  img?: string;
}

// Union type for both systems
type EnhancedCreatureIndex = DnD5eCreatureIndex | PF2eCreatureIndex;

interface PersistentIndexMetadata {
  version: string;
  timestamp: number;
  packFingerprints: Map<string, PackFingerprint>;
  totalCreatures: number;
  gameSystem: string;  // 'dnd5e' or 'pf2e'
}

interface PackFingerprint {
  packId: string;
  packLabel: string;
  lastModified: number;
  documentCount: number;
  checksum: string;
}

interface PersistentEnhancedIndex {
  metadata: PersistentIndexMetadata;
  creatures: EnhancedCreatureIndex[];
}

interface SceneInfo {
  id: string;
  name: string;
  img?: string;
  background?: string;
  width: number;
  height: number;
  padding: number;
  active: boolean;
  navigation: boolean;
  tokens: SceneToken[];
  walls: number;
  lights: number;
  sounds: number;
  notes: SceneNote[];
}

interface SceneToken {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  actorId?: string;
  img: string;
  hidden: boolean;
  disposition: number;
}

interface SceneNote {
  id: string;
  text: string;
  x: number;
  y: number;
}

interface WorldInfo {
  id: string;
  title: string;
  system: string;
  systemVersion: string;
  foundryVersion: string;
  users: WorldUser[];
}

interface WorldUser {
  id: string;
  name: string;
  active: boolean;
  isGM: boolean;
}

// Phase 2: Write Operation Interfaces
interface ActorCreationRequest {
  creatureType: string;
  customNames?: string[] | undefined;
  packPreference?: string | undefined;
  quantity?: number | undefined;
  addToScene?: boolean | undefined;
}

interface ActorCreationResult {
  success: boolean;
  actors: CreatedActorInfo[];
  errors?: string[] | undefined;
  tokensPlaced?: number;
  totalRequested: number;
  totalCreated: number;
}

interface CreatedActorInfo {
  id: string;
  name: string;
  originalName: string;
  type: string;
  sourcePackId: string;
  sourcePackLabel: string;
  img?: string;
}

interface CompendiumEntryFull {
  id: string;
  name: string;
  type: string;
  img?: string;
  pack: string;
  packLabel: string;
  system: Record<string, unknown>;
  items?: CompendiumItem[];
  effects?: CompendiumEffect[];
  fullData: Record<string, unknown>;
}

interface CompendiumItem {
  id: string;
  name: string;
  type: string;
  img?: string;
  system: Record<string, unknown>;
}

interface CompendiumEffect {
  id: string;
  name: string;
  icon?: string;
  disabled: boolean;
  duration?: Record<string, unknown>;
}

interface SceneTokenPlacement {
  actorIds: string[];
  placement: 'random' | 'grid' | 'center' | 'coordinates';
  hidden: boolean;
  coordinates?: { x: number; y: number }[];
}

interface TokenPlacementResult {
  success: boolean;
  tokensCreated: number;
  tokenIds: string[];
  errors?: string[] | undefined;
}

/**
 * Persistent Enhanced Creature Index System
 * Stores pre-computed creature data in JSON file within Foundry world directory for instant filtering
 * Uses file-based storage following Foundry best practices for large data sets
 */
class PersistentCreatureIndex {
  private moduleId: string = MODULE_ID;
  private readonly INDEX_VERSION = '1.0.0';
  private readonly INDEX_FILENAME = 'enhanced-creature-index.json';
  private buildInProgress = false;
  private hooksRegistered = false;

  constructor() {
    this.registerFoundryHooks();
  }

  /**
   * Get the file path for the enhanced creature index
   */
  private getIndexFilePath(): string {
    // Store in world data directory using world ID
    return `worlds/${game.world.id}/${this.INDEX_FILENAME}`;
  }

  /**
   * Get or build the enhanced creature index
   */
  async getEnhancedIndex(): Promise<EnhancedCreatureIndex[]> {
    // Check if we have a valid persistent index
    const existingIndex = await this.loadPersistedIndex();
    
    if (existingIndex && this.isIndexValid(existingIndex)) {
      return existingIndex.creatures;
    }
    
    // Build new index if needed
    return await this.buildEnhancedIndex();
  }

  /**
   * Force rebuild of the enhanced index
   */
  async rebuildIndex(): Promise<EnhancedCreatureIndex[]> {
    return await this.buildEnhancedIndex(true);
  }

  /**
   * Load persisted index from JSON file
   */
  private async loadPersistedIndex(): Promise<PersistentEnhancedIndex | null> {
    try {
      const filePath = this.getIndexFilePath();
      
      // Check if file exists using Foundry's FilePicker
      let fileExists = false;
      try {
        const browseResult = await (foundry as any).applications.apps.FilePicker.implementation.browse('data', `worlds/${game.world.id}`);
        fileExists = browseResult.files.some((f: any) => f.endsWith(this.INDEX_FILENAME));
      } catch (error) {
        // Directory doesn't exist or other error, return null
        return null;
      }

      if (!fileExists) {
        return null;
      }

      // Load file content
      const response = await fetch(filePath);
      if (!response.ok) {
        console.warn(`[${this.moduleId}] Failed to load index file: ${response.status}`);
        return null;
      }

      const rawData = await response.json();
      

      // Convert Map data back from JSON
      const metadata = rawData.metadata;
      if (metadata && metadata.packFingerprints) {
        metadata.packFingerprints = new Map(metadata.packFingerprints);
      }

      return rawData;
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to load persisted index from file:`, error);
      return null;
    }
  }

  /**
   * Save enhanced index to JSON file
   */
  private async savePersistedIndex(index: PersistentEnhancedIndex): Promise<void> {
    try {
      // Convert Map to Array for JSON serialization
      const saveData = {
        ...index,
        metadata: {
          ...index.metadata,
          packFingerprints: Array.from(index.metadata.packFingerprints.entries())
        }
      };

      const jsonContent = JSON.stringify(saveData, null, 2);

      // Create a File object and upload it using Foundry's file system
      const file = new File([jsonContent], this.INDEX_FILENAME, { type: 'application/json' });
      
      // Upload the file to the world directory
      const uploadResponse = await (foundry as any).applications.apps.FilePicker.implementation.upload('data', `worlds/${game.world.id}`, file);

      if (uploadResponse) {
      } else {
        throw new Error('File upload failed');
      }
    } catch (error) {
      console.error(`[${this.moduleId}] Failed to save enhanced index to file:`, error);
      throw error;
    }
  }

  /**
   * Check if existing index is valid (all packs unchanged)
   */
  private isIndexValid(existingIndex: PersistentEnhancedIndex): boolean {
    // Check version
    if (existingIndex.metadata.version !== this.INDEX_VERSION) {
      return false;
    }

    // NEW: Check system compatibility
    const currentSystem = (game as any).system.id;
    if (existingIndex.metadata.gameSystem !== currentSystem) {
      console.log(`[${this.moduleId}] System changed from ${existingIndex.metadata.gameSystem} to ${currentSystem}, index invalidated`);
      return false;
    }

    // Check each pack fingerprint
    const actorPacks = Array.from(game.packs.values()).filter(pack => pack.metadata.type === 'Actor');
    
    for (const pack of actorPacks) {
      const currentFingerprint = this.generatePackFingerprint(pack);
      const savedFingerprint = existingIndex.metadata.packFingerprints.get(pack.metadata.id);
      
      if (!savedFingerprint) {
        return false;
      }
      
      if (!this.fingerprintsMatch(currentFingerprint, savedFingerprint)) {
        return false;
      }
    }

    // Check if any saved packs no longer exist
    for (const [packId] of existingIndex.metadata.packFingerprints) {
      if (!game.packs.get(packId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Register Foundry hooks for real-time pack change detection
   */
  private registerFoundryHooks(): void {
    if (this.hooksRegistered) return;

    // Listen for compendium document changes
    Hooks.on('createDocument', (document: any) => {
      if (document.pack && (document.type === 'npc' || document.type === 'character')) {
        this.invalidateIndex();
      }
    });

    Hooks.on('updateDocument', (document: any) => {
      if (document.pack && (document.type === 'npc' || document.type === 'character')) {
        this.invalidateIndex();
      }
    });

    Hooks.on('deleteDocument', (document: any) => {
      if (document.pack && (document.type === 'npc' || document.type === 'character')) {
        this.invalidateIndex();
      }
    });

    // Listen for pack creation/deletion
    Hooks.on('createCompendium', (pack: any) => {
      if (pack.metadata.type === 'Actor') {
        this.invalidateIndex();
      }
    });

    Hooks.on('deleteCompendium', (pack: any) => {
      if (pack.metadata.type === 'Actor') {
        this.invalidateIndex();
      }
    });

    this.hooksRegistered = true;
  }

  /**
   * Invalidate the current index (mark for rebuild on next access)
   */
  private async invalidateIndex(): Promise<void> {
    try {
      // Check if auto-rebuild is enabled
      const autoRebuild = game.settings.get(this.moduleId, 'autoRebuildIndex');
      
      if (!autoRebuild) {
        return;
      }

      // Delete the index file to force rebuild
      const filePath = this.getIndexFilePath();
      
      try {
        // Check if file exists first by trying to browse to the world directory
        const browseResult = await (foundry as any).applications.apps.FilePicker.implementation.browse('data', `worlds/${game.world.id}`);
        const fileExists = browseResult.files.some((f: any) => f.endsWith(this.INDEX_FILENAME));
        
        if (fileExists) {
          // File exists, delete it using fetch with DELETE method
          await fetch(filePath, { method: 'DELETE' });
          // File deletion completed (or failed silently)
        }
      } catch (error) {
        // File doesn't exist or deletion failed - that's okay
      }
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to invalidate index:`, error);
    }
  }

  /**
   * Generate fingerprint for pack change detection with improved accuracy
   */
  private generatePackFingerprint(pack: any): PackFingerprint {
    // Get actual modification time if available
    let lastModified = Date.now();
    if (pack.metadata.lastModified) {
      lastModified = new Date(pack.metadata.lastModified).getTime();
    }

    return {
      packId: pack.metadata.id,
      packLabel: pack.metadata.label,
      lastModified: lastModified,
      documentCount: pack.index?.size || 0,
      checksum: this.generatePackChecksum(pack)
    };
  }

  /**
   * Generate checksum for pack contents
   */
  private generatePackChecksum(pack: any): string {
    // Simple checksum based on pack metadata and size
    const data = `${pack.metadata.id}-${pack.metadata.label}-${pack.index?.size || 0}`;
    return btoa(data).slice(0, 16); // Simple hash for demonstration
  }

  /**
   * Compare two pack fingerprints
   */
  private fingerprintsMatch(current: PackFingerprint, saved: PackFingerprint): boolean {
    return current.documentCount === saved.documentCount && 
           current.checksum === saved.checksum;
  }

  /**
   * Build enhanced creature index from all Actor packs with detailed progress tracking
   */
  private async buildEnhancedIndex(force = false): Promise<EnhancedCreatureIndex[]> {
    if (this.buildInProgress && !force) {
      throw new Error('Index build already in progress');
    }

    // Detect game system ONCE at build time
    const gameSystem = (game as any).system.id;

    console.log(`[${this.moduleId}] Building enhanced creature index for system: ${gameSystem}`);

    // Route to system-specific builder
    if (gameSystem === 'pf2e') {
      return await this.buildPF2eIndex(force);
    } else if (gameSystem === 'dnd5e') {
      return await this.buildDnD5eIndex(force);
    } else {
      throw new Error(`Enhanced creature index not supported for system: ${gameSystem}. Only D&D 5e and Pathfinder 2e are currently supported.`);
    }
  }

  /**
   * Build D&D 5e enhanced creature index
   */
  private async buildDnD5eIndex(_force = false): Promise<DnD5eCreatureIndex[]> {
    this.buildInProgress = true;

    const startTime = Date.now();
    let progressNotification: any = null;
    let totalErrors = 0; // Track extraction errors

    try {

      const actorPacks = Array.from(game.packs.values()).filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: DnD5eCreatureIndex[] = [];
      const packFingerprints = new Map<string, PackFingerprint>();

      // Show initial progress notification
      ui.notifications?.info(`Starting enhanced creature index build from ${actorPacks.length} packs...`);

      for (let i = 0; i < actorPacks.length; i++) {
        const pack = actorPacks[i];
        const progressPercent = Math.round((i / actorPacks.length) * 100);
        
        // Update progress notification every few packs or for important packs
        if (i % 3 === 0 || pack.metadata.label.toLowerCase().includes('monster')) {
          if (progressNotification) {
            progressNotification.remove();
          }
          progressNotification = ui.notifications?.info(
            `Building creature index... ${progressPercent}% (${i + 1}/${actorPacks.length}) Processing: ${pack.metadata.label}`
          );
        }


        try {
          // Ensure pack index is loaded
          if (!pack.indexed) {
            await pack.getIndex({});
          }

          // Generate pack fingerprint for change detection
          packFingerprints.set(pack.metadata.id, this.generatePackFingerprint(pack));

          // Show pack processing details for large packs
          const packSize = pack.index?.size || 0;
          if (packSize > 50) {
            if (progressNotification) {
              progressNotification.remove();
            }
            progressNotification = ui.notifications?.info(
              `Processing large pack: ${pack.metadata.label} (${packSize} documents)...`
            );
          }

          // Process creatures in this pack
          const packResult = await this.extractDnD5eDataFromPack(pack);
          enhancedCreatures.push(...packResult.creatures);
          totalErrors += packResult.errors;

          // Pack processing completed: ${pack.metadata.label} - ${packResult.creatures.length} creatures extracted

          // Show milestone notifications for significant progress
          if (i === 0 || (i + 1) % 5 === 0 || i === actorPacks.length - 1) {
            const totalCreaturesSoFar = enhancedCreatures.length;
            if (progressNotification) {
              progressNotification.remove();
            }
            progressNotification = ui.notifications?.info(
              `Index Progress: ${i + 1}/${actorPacks.length} packs complete, ${totalCreaturesSoFar} creatures indexed`
            );
          }

        } catch (error) {
          console.warn(`[${this.moduleId}] Failed to process pack ${pack.metadata.label}:`, error);
          // Show error notification for pack failures
          ui.notifications?.warn(`Warning: Failed to index pack "${pack.metadata.label}" - continuing with other packs`);
        }
      }

      // Clear progress notification and show final processing step
      if (progressNotification) {
        progressNotification.remove();
      }
      ui.notifications?.info(`Saving enhanced index to world database... (${enhancedCreatures.length} creatures)`);

      // Create persistent index structure
      const persistentIndex: PersistentEnhancedIndex = {
        metadata: {
          version: this.INDEX_VERSION,
          timestamp: Date.now(),
          packFingerprints,
          totalCreatures: enhancedCreatures.length,
          gameSystem: 'dnd5e'  // Mark as D&D 5e index
        },
        creatures: enhancedCreatures
      };

      // Save to world flags
      await this.savePersistedIndex(persistentIndex);

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `Enhanced creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;
      
      ui.notifications?.info(successMessage);

      return enhancedCreatures;

    } catch (error) {
      // Clear any progress notifications on error
      if (progressNotification) {
        progressNotification.remove();
      }
      
      const errorMessage = `Failed to build enhanced creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${this.moduleId}] ${errorMessage}`);
      ui.notifications?.error(errorMessage);
      
      throw error;
      
    } finally {
      this.buildInProgress = false;
      
      // Ensure progress notification is cleared
      if (progressNotification) {
        progressNotification.remove();
      }
    }
  }

  /**
   * Extract D&D 5e data from all documents in a pack
   */
  private async extractDnD5eDataFromPack(pack: any): Promise<{ creatures: DnD5eCreatureIndex[], errors: number }> {
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

          const result = this.extractDnD5eCreatureData(doc, pack);
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
  private extractDnD5eCreatureData(doc: any, pack: any): { creature: DnD5eCreatureIndex, errors: number } | null {
    try {
      const system = doc.system || {};
      
      
      // Extract challenge rating with comprehensive fallbacks
      // Based on debug logs: system.details.cr contains the actual value
      let challengeRating = system.details?.cr ?? 
                           system.details?.cr?.value ?? 
                           system.cr?.value ?? system.cr ?? 
                           system.attributes?.cr?.value ?? system.attributes?.cr ??
                           system.challenge?.rating ?? system.challenge?.cr ?? 0;
      
      // Handle null values (spell effects, etc.)
      if (challengeRating === null || challengeRating === undefined) {
        challengeRating = 0;
      }
      
      if (typeof challengeRating === 'string') {
        if (challengeRating === '1/8') challengeRating = 0.125;
        else if (challengeRating === '1/4') challengeRating = 0.25;
        else if (challengeRating === '1/2') challengeRating = 0.5;
        else challengeRating = parseFloat(challengeRating) || 0;
      }
      
      // Ensure it's a number
      challengeRating = Number(challengeRating) || 0;

      // Extract creature type with proper type checking
      // Based on debug logs: system.details.type.value contains the actual value
      let creatureType = system.details?.type?.value ?? 
                         system.details?.type ?? 
                         system.type?.value ?? system.type ?? 
                         system.race?.value ?? system.race ??
                         system.details?.race ?? 'unknown';
      
      // Handle null/undefined values properly
      if (creatureType === null || creatureType === undefined || creatureType === '') {
        creatureType = 'unknown';
      }
      
      // Ensure creatureType is a string before calling toLowerCase()
      if (typeof creatureType !== 'string') {
        creatureType = String(creatureType || 'unknown');
      }

      // Extract size with proper type checking
      let size = system.traits?.size?.value || system.traits?.size || 
                 system.size?.value || system.size || 
                 system.details?.size || 'medium';
      
      // Ensure size is a string
      if (typeof size !== 'string') {
        size = String(size || 'medium');
      }

      // Extract hit points with more fallbacks
      const hitPoints = system.attributes?.hp?.max || system.hp?.max || 
                       system.attributes?.hp?.value || system.hp?.value || 
                       system.health?.max || system.health?.value || 0;

      // Extract armor class with more fallbacks
      const armorClass = system.attributes?.ac?.value || system.ac?.value || 
                        system.attributes?.ac || system.ac || 
                        system.armor?.value || system.armor || 10;

      // Extract alignment with proper type checking
      let alignment = system.details?.alignment?.value || system.details?.alignment || 
                      system.alignment?.value || system.alignment || 'unaligned';
      
      // Ensure alignment is a string
      if (typeof alignment !== 'string') {
        alignment = String(alignment || 'unaligned');
      }

      // Check for spells with more comprehensive detection
      const hasSpells = !!(system.spells || 
                          system.attributes?.spellcasting || 
                          (system.details?.spellLevel && system.details.spellLevel > 0) ||
                          (system.resources?.spell && system.resources.spell.max > 0) ||
                          system.spellcasting ||
                          (system.traits?.spellcasting) ||
                          (system.details?.spellcaster));

      // Check for legendary actions with more comprehensive detection
      const hasLegendaryActions = !!(system.resources?.legact || 
                                    system.legendary || 
                                    (system.resources?.legres && system.resources.legres.value > 0) ||
                                    system.details?.legendary ||
                                    system.traits?.legendary ||
                                    (system.resources?.legendary && system.resources.legendary.max > 0));

      // DEBUG: Log what we extracted for comparison

      // Successful extraction
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          pack: pack.metadata.id,
          packLabel: pack.metadata.label,
          challengeRating: challengeRating,
          creatureType: creatureType.toLowerCase(),
          size: size.toLowerCase(),
          hitPoints: hitPoints,
          armorClass: armorClass,
          hasSpells: hasSpells,
          hasLegendaryActions: hasLegendaryActions,
          alignment: alignment.toLowerCase(),
          description: doc.system?.details?.biography || doc.system?.description || '',
          img: doc.img
        },
        errors: 0
      };

    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract enhanced data from ${doc.name}:`, error);
      
      // Return a basic fallback record with error count instead of null to avoid losing creatures
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          pack: pack.metadata.id,
          packLabel: pack.metadata.label,
          challengeRating: 0,
          creatureType: 'unknown',
          size: 'medium',
          hitPoints: 1,
          armorClass: 10,
          hasSpells: false,
          hasLegendaryActions: false,
          alignment: 'unaligned',
          description: 'Data extraction failed',
          img: doc.img || ''
        },
        errors: 1
      };
    }
  }

  /**
   * Build Pathfinder 2e enhanced creature index
   */
  private async buildPF2eIndex(_force = false): Promise<PF2eCreatureIndex[]> {
    this.buildInProgress = true;

    const startTime = Date.now();
    let progressNotification: any = null;
    let totalErrors = 0;

    try {
      const actorPacks = Array.from(game.packs.values()).filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: PF2eCreatureIndex[] = [];
      const packFingerprints = new Map<string, PackFingerprint>();

      ui.notifications?.info(`Starting PF2e creature index build from ${actorPacks.length} packs...`);

      let currentPack = 0;
      for (const pack of actorPacks) {
        currentPack++;

        if (progressNotification) {
          progressNotification.remove();
        }
        progressNotification = ui.notifications?.info(
          `Building PF2e index: Pack ${currentPack}/${actorPacks.length} (${pack.metadata.label})...`
        );

        const fingerprint = await this.generatePackFingerprint(pack);
        packFingerprints.set(pack.metadata.id, fingerprint);

        const result = await this.extractPF2eDataFromPack(pack);
        enhancedCreatures.push(...result.creatures);
        totalErrors += result.errors;
      }

      if (progressNotification) {
        progressNotification.remove();
      }
      ui.notifications?.info(`Saving PF2e index to world database... (${enhancedCreatures.length} creatures)`);

      const persistentIndex: PersistentEnhancedIndex = {
        metadata: {
          version: this.INDEX_VERSION,
          timestamp: Date.now(),
          packFingerprints,
          totalCreatures: enhancedCreatures.length,
          gameSystem: 'pf2e'  // Mark as PF2e index
        },
        creatures: enhancedCreatures
      };

      await this.savePersistedIndex(persistentIndex);

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `PF2e creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;

      ui.notifications?.info(successMessage);

      return enhancedCreatures;

    } catch (error) {
      if (progressNotification) {
        progressNotification.remove();
      }

      const errorMessage = `Failed to build PF2e creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${this.moduleId}] ${errorMessage}`);
      ui.notifications?.error(errorMessage);

      throw error;

    } finally {
      this.buildInProgress = false;

      if (progressNotification) {
        progressNotification.remove();
      }
    }
  }

  /**
   * Extract PF2e creature data from all documents in a pack
   */
  private async extractPF2eDataFromPack(pack: any): Promise<{ creatures: PF2eCreatureIndex[], errors: number }> {
    const creatures: PF2eCreatureIndex[] = [];
    let errors = 0;

    try {
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          if (doc.type !== 'npc' && doc.type !== 'character') {
            continue;
          }

          const result = this.extractPF2eCreatureData(doc, pack);
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
  private extractPF2eCreatureData(doc: any, pack: any): { creature: PF2eCreatureIndex, errors: number } | null {
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
      const hasSpells = Object.keys(spellcasting).length > 0;

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
          pack: pack.metadata.id,
          packLabel: pack.metadata.label,
          level: level,
          traits: traits,
          creatureType: creatureType,
          rarity: rarity,
          size: size,
          hitPoints: hitPoints,
          armorClass: armorClass,
          hasSpells: hasSpells,
          alignment: alignment.toUpperCase(),
          description: system.details?.publicNotes || system.details?.biography || '',
          img: doc.img
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
          pack: pack.metadata.id,
          packLabel: pack.metadata.label,
          level: 0,
          traits: [],
          creatureType: 'unknown',
          rarity: 'common',
          size: 'medium',
          hitPoints: 1,
          armorClass: 10,
          hasSpells: false,
          alignment: 'N',
          description: 'Data extraction failed',
          img: doc.img || ''
        },
        errors: 1
      };
    }
  }
}

export class FoundryDataAccess {
  private moduleId: string = MODULE_ID;
  private persistentIndex: PersistentCreatureIndex = new PersistentCreatureIndex();

  constructor() {}

  /**
   * Force rebuild of enhanced creature index
   */
  async rebuildEnhancedCreatureIndex(): Promise<{ success: boolean; totalCreatures: number; message: string }> {
    try {
      const creatures = await this.persistentIndex.rebuildIndex();
      return {
        success: true,
        totalCreatures: creatures.length,
        message: `Enhanced creature index rebuilt: ${creatures.length} creatures indexed from all packs`
      };
    } catch (error) {
      console.error(`[${this.moduleId}] Failed to rebuild enhanced creature index:`, error);
      return {
        success: false,
        totalCreatures: 0,
        message: `Failed to rebuild index: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }


  /**
   * Get character/actor information by name or ID
   */
  async getCharacterInfo(identifier: string): Promise<CharacterInfo> {

    let actor: Actor | undefined;

    // Try to find by ID first, then by name
    if (identifier.length === 16) { // Foundry ID length
      actor = game.actors.get(identifier);
    }
    
    if (!actor) {
      actor = game.actors.find(a => 
        a.name?.toLowerCase() === identifier.toLowerCase()
      );
    }

    if (!actor) {
      throw new Error(`${ERROR_MESSAGES.CHARACTER_NOT_FOUND}: ${identifier}`);
    }

    // Build character data structure
    const characterData: CharacterInfo = {
      id: actor.id || '',
      name: actor.name || '',
      type: actor.type,
      ...(actor.img ? { img: actor.img } : {}),
      system: this.sanitizeData((actor as any).system),
      items: actor.items.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type,
        ...(item.img ? { img: item.img } : {}),
        system: this.sanitizeData(item.system),
      })),
      effects: actor.effects.map(effect => ({
        id: effect.id,
        name: (effect as any).name || (effect as any).label || 'Unknown Effect',
        ...((effect as any).icon ? { icon: (effect as any).icon } : {}),
        disabled: (effect as any).disabled,
        ...(((effect as any).duration) ? {
          duration: {
            type: (effect as any).duration.type || 'none',
            duration: (effect as any).duration.duration,
            remaining: (effect as any).duration.remaining,
          }
        } : {}),
      })),
    };

    return characterData;
  }

  /**
   * Search compendium packs for items matching query with optional filters
   */
  async searchCompendium(query: string, packType?: string, filters?: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    alignment?: string;
    hasLegendaryActions?: boolean;
    spellcaster?: boolean;
  }): Promise<CompendiumSearchResult[]> {

    // Add defensive checks for query parameter
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      throw new Error('Search query must be a string with at least 2 characters');
    }

    // ENHANCED SEARCH: If we have creature-specific filters and Actor packType, use enhanced index
    if (filters && packType === 'Actor' && 
        (filters.challengeRating || filters.creatureType || filters.hasLegendaryActions)) {
      
      
      // Check if enhanced creature index is enabled
      const enhancedIndexEnabled = game.settings.get(this.moduleId, 'enableEnhancedCreatureIndex');
      
      if (enhancedIndexEnabled) {
        try {
          // Convert search criteria and use enhanced search
          const criteria: any = { limit: 100 }; // Default limit for search
          
          if (filters.challengeRating) criteria.challengeRating = filters.challengeRating;
          if (filters.creatureType) criteria.creatureType = filters.creatureType;
          if (filters.size) criteria.size = filters.size;
          if (filters.hasLegendaryActions) criteria.hasLegendaryActions = filters.hasLegendaryActions;
          
          const enhancedResult = await this.listCreaturesByCriteria(criteria);
          
          // No name filtering needed - trust the enhanced creature index!
          const filteredResults = enhancedResult.creatures;
          
          
          // Convert to CompendiumSearchResult format
          return filteredResults.map(creature => ({
            id: creature.id || creature.name,
            name: creature.name,
            type: creature.type || 'npc',
            pack: creature.pack,
            packLabel: creature.packLabel || creature.pack,
            description: creature.description || '',
            hasImage: creature.hasImage || !!creature.img,
            summary: `CR ${creature.challengeRating} ${creature.creatureType} from ${creature.packLabel}`,
            // Enhanced data (not part of interface but will be included)
            challengeRating: creature.challengeRating,
            creatureType: creature.creatureType,
            size: creature.size,
            hasLegendaryActions: creature.hasLegendaryActions
          } as CompendiumSearchResult & {
            challengeRating: number;
            creatureType: string;
            size: string;
            hasLegendaryActions: boolean;
          }));
          
        } catch (error) {
          console.warn(`[${this.moduleId}] Enhanced search failed, falling back to basic search:`, error);
          // Continue to basic search below
        }
      }
    }

    const results: CompendiumSearchResult[] = [];
    const cleanQuery = query.toLowerCase().trim();
    const searchTerms = cleanQuery.split(' ').filter(term => term && typeof term === 'string' && term.length > 0);

    if (searchTerms.length === 0) {
      throw new Error('Search query must contain valid search terms');
    }

    // Filter packs by type if specified
    const packs = Array.from(game.packs.values()).filter(pack => {
      if (packType && pack.metadata.type !== packType) {
        return false;
      }
      return pack.metadata.type !== 'Scene'; // Exclude scene packs for safety
    });

    for (const pack of packs) {
      try {
        // Ensure pack index is loaded
        if (!pack.indexed) {
          await pack.getIndex({});
        }

        // Use basic compendium index for all searches
        const entriesToSearch = Array.from(pack.index.values());
        
        for (const entry of entriesToSearch) {
          try {
            // Type assertion and comprehensive safety checks for entry properties
            const typedEntry = entry as any;
            if (!typedEntry || !typedEntry.name || typeof typedEntry.name !== 'string' || typedEntry.name.trim().length === 0) {
              continue;
            }

            // Ensure searchTerms are valid before using them
            if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
              continue;
            }

            // Use already created typedEntry
            
            const entryNameLower = typedEntry.name.toLowerCase();
            const nameMatch = searchTerms.every(term => {
              if (!term || typeof term !== 'string') {
                return false;
              }
              return entryNameLower.includes(term);
            });

            if (nameMatch) {
              // For Actor packs with filters, use simple name/description matching
              if (filters && this.shouldApplyFilters(entry, filters) && pack.metadata.type === 'Actor') {
                // Convert filters to search criteria for compatibility
                const searchCriteria: any = {};
                
                if (filters.challengeRating) {
                  const searchTerms = [];
                  if (typeof filters.challengeRating === 'number') {
                    if (filters.challengeRating >= 15) {
                      searchTerms.push('ancient', 'legendary', 'elder', 'greater');
                    } else if (filters.challengeRating >= 10) {
                      searchTerms.push('adult', 'warlord', 'champion', 'master');
                    } else if (filters.challengeRating >= 5) {
                      searchTerms.push('captain', 'knight', 'priest', 'mage');
                    } else {
                      searchTerms.push('guard', 'soldier', 'warrior', 'scout');
                    }
                  }
                  searchCriteria.searchTerms = searchTerms;
                }
                
                if (filters.creatureType) {
                  const typeTerms = [filters.creatureType];
                  if (filters.creatureType.toLowerCase() === 'humanoid') {
                    typeTerms.push('human', 'elf', 'dwarf', 'orc', 'goblin');
                  }
                  searchCriteria.searchTerms = [...(searchCriteria.searchTerms || []), ...typeTerms];
                }
                
                if (!this.matchesSearchCriteria(typedEntry, searchCriteria)) {
                  continue;
                }
              }

              // Standard index entry result
              results.push({
                id: typedEntry._id || '',
                name: typedEntry.name,
                type: typedEntry.type || 'unknown',
                img: typedEntry.img || undefined,
                pack: pack.metadata.id,
                packLabel: pack.metadata.label,
                description: typedEntry.description || '',
                hasImage: !!typedEntry.img,
                summary: `${typedEntry.type} from ${pack.metadata.label}`,
              });
            }
          } catch (entryError) {
            // Log individual entry errors but continue processing
            console.warn(`[${this.moduleId}] Error processing entry in pack ${pack.metadata.id}:`, entryError);
            continue;
          }

          // Limit results per pack to prevent overwhelming responses
          if (results.length >= 100) break;
        }
      } catch (error) {
        console.warn(`[${this.moduleId}] Failed to search pack ${pack.metadata.id}:`, error);
      }

      // Global limit to prevent memory issues
      if (results.length >= 100) break;
    }

    // Sort results by relevance with enhanced ranking for filtered searches
    results.sort((a, b) => {
      // Exact name matches first
      const aExact = a.name.toLowerCase() === query.toLowerCase();
      const bExact = b.name.toLowerCase() === query.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // If filters are used, prioritize by filter match quality
      if (filters) {
        const aScore = this.calculateRelevanceScore(a, filters, query);
        const bScore = this.calculateRelevanceScore(b, filters, query);
        if (aScore !== bScore) return bScore - aScore; // Higher score first
      }
      
      // Fallback to alphabetical
      return a.name.localeCompare(b.name);
    });

    return results.slice(0, 50); // Final limit
  }

  /**
   * Check if filters should be applied to this entry
   */
  private shouldApplyFilters(entry: any, filters: any): boolean {
    // Only apply filters to Actor entries (which includes NPCs/monsters)
    if (entry.type !== 'npc' && entry.type !== 'character') {
      return false;
    }
    
    // Check if any filters are actually specified
    return Object.keys(filters).some(key => filters[key] !== undefined);
  }

  /**
   * Check if entry passes all specified filters
   * @unused - Replaced with simple index-only approach
   */
  // @ts-ignore - Unused method kept for compatibility
  private passesFilters(entry: any, filters: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    alignment?: string;
    hasLegendaryActions?: boolean;
    spellcaster?: boolean;
  }): boolean {
    const system = entry.system || {};


    // Challenge Rating filter
    if (filters.challengeRating !== undefined) {
      // Try multiple possible CR locations in D&D 5e data structure
      let entryCR = system.details?.cr?.value || system.details?.cr || system.cr?.value || system.cr || 0;
      
      // Handle fractional CRs (common in D&D 5e)
      if (typeof entryCR === 'string') {
        if (entryCR === '1/8') entryCR = 0.125;
        else if (entryCR === '1/4') entryCR = 0.25;
        else if (entryCR === '1/2') entryCR = 0.5;
        else entryCR = parseFloat(entryCR) || 0;
      }
      
      if (typeof filters.challengeRating === 'number') {
        // Exact CR match
        if (entryCR !== filters.challengeRating) {
          return false;
        }
      } else if (typeof filters.challengeRating === 'object') {
        // CR range
        const { min, max } = filters.challengeRating;
        if (min !== undefined && entryCR < min) {
          return false;
        }
        if (max !== undefined && entryCR > max) {
          return false;
        }
      }
    }

    // Creature Type filter
    if (filters.creatureType) {
      const entryType = system.details?.type?.value || system.type?.value || '';
      if (entryType.toLowerCase() !== filters.creatureType.toLowerCase()) {
        return false;
      }
    }

    // Size filter
    if (filters.size) {
      const entrySize = system.traits?.size || system.size || '';
      if (entrySize.toLowerCase() !== filters.size.toLowerCase()) {
        return false;
      }
    }

    // Alignment filter
    if (filters.alignment) {
      const entryAlignment = system.details?.alignment || system.alignment || '';
      if (!entryAlignment.toLowerCase().includes(filters.alignment.toLowerCase())) {
        return false;
      }
    }

    // Legendary Actions filter
    if (filters.hasLegendaryActions !== undefined) {
      const hasLegendary = !!(system.resources?.legact || system.legendary || 
                             (system.resources?.legres && system.resources.legres.value > 0));
      if (hasLegendary !== filters.hasLegendaryActions) {
        return false;
      }
    }

    // Spellcaster filter
    if (filters.spellcaster !== undefined) {
      const isSpellcaster = !!(system.spells || system.attributes?.spellcasting || 
                               (system.details?.spellLevel && system.details.spellLevel > 0));
      if (isSpellcaster !== filters.spellcaster) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate relevance score for search result ranking
   */
  private calculateRelevanceScore(entry: any, filters: any, query: string): number {
    let score = 0;
    const system = entry.system || {};
    
    // Bonus for creature type match (high importance for encounter building)
    if (filters.creatureType) {
      const entryType = system.details?.type?.value || system.type?.value || '';
      if (entryType.toLowerCase() === filters.creatureType.toLowerCase()) {
        score += 20;
      }
    }
    
    // Bonus for CR match (exact match gets higher score than range)
    if (filters.challengeRating !== undefined) {
      const entryCR = system.details?.cr || system.cr || 0;
      if (typeof filters.challengeRating === 'number') {
        if (entryCR === filters.challengeRating) score += 15;
      } else if (typeof filters.challengeRating === 'object') {
        const { min, max } = filters.challengeRating;
        if (min !== undefined && max !== undefined) {
          // Bonus for being in range, extra for being in middle of range
          if (entryCR >= min && entryCR <= max) {
            score += 10;
            const rangeMid = (min + max) / 2;
            const distFromMid = Math.abs(entryCR - rangeMid);
            score += Math.max(0, 5 - distFromMid); // Up to 5 bonus for being near middle
          }
        }
      }
    }
    
    // Bonus for common creature names (better for encounters)
    const commonNames = ['knight', 'warrior', 'guard', 'soldier', 'mage', 'priest', 'bandit', 'orc', 'goblin', 'dragon'];
    const lowerName = entry.name.toLowerCase();
    if (commonNames.some(name => lowerName.includes(name))) {
      score += 5;
    }
    
    // Bonus for query term matches in name
    const queryTerms = query.toLowerCase().split(' ');
    for (const term of queryTerms) {
      if (term.length > 2 && lowerName.includes(term)) {
        score += 3;
      }
    }
    
    return score;
  }

  /**
   * List creatures by criteria using enhanced persistent index - optimized for instant filtering
   */
  async listCreaturesByCriteria(criteria: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
    limit?: number;
  }): Promise<{creatures: any[], searchSummary: any}> {

    const limit = criteria.limit || 500;

    // Check if enhanced creature index is enabled
    const enhancedIndexEnabled = game.settings.get(this.moduleId, 'enableEnhancedCreatureIndex');

    if (!enhancedIndexEnabled) {
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }

    try {
      
      // Get enhanced creature index (builds if needed)
      const enhancedCreatures = await this.persistentIndex.getEnhancedIndex();

      // Apply filters to enhanced data
      let filteredCreatures = enhancedCreatures.filter(creature => this.passesEnhancedCriteria(creature, criteria));


      // Sort by Level/CR then name for consistent ordering (system-aware)
      filteredCreatures.sort((a, b) => {
        // Get power level (CR for D&D 5e, Level for PF2e)
        const powerA = 'level' in a ? (a as PF2eCreatureIndex).level : (a as DnD5eCreatureIndex).challengeRating;
        const powerB = 'level' in b ? (b as PF2eCreatureIndex).level : (b as DnD5eCreatureIndex).challengeRating;

        if (powerA !== powerB) {
          return powerA - powerB; // Lower power first
        }
        return a.name.localeCompare(b.name);
      });

      // Apply limit
      if (filteredCreatures.length > limit) {
        filteredCreatures = filteredCreatures.slice(0, limit);
      }

      // Convert enhanced creatures to result format (system-aware)
      const results = filteredCreatures.map(creature => {
        // Type guard for result formatting
        const isPF2e = 'level' in creature;

        return {
          id: creature.id,
          name: creature.name,
          type: creature.type,
          pack: creature.pack,
          packLabel: creature.packLabel,
          description: creature.description || '',
          hasImage: !!creature.img,

          // System-aware summary
          summary: isPF2e
            ? `Level ${(creature as PF2eCreatureIndex).level} ${creature.creatureType} (${(creature as PF2eCreatureIndex).rarity}) from ${creature.packLabel}`
            : `CR ${(creature as DnD5eCreatureIndex).challengeRating} ${creature.creatureType} from ${creature.packLabel}`,

          // Include all creature data (conditional based on system)
          ...(isPF2e ? {
            level: (creature as PF2eCreatureIndex).level,
            traits: (creature as PF2eCreatureIndex).traits,
            rarity: (creature as PF2eCreatureIndex).rarity
          } : {
            challengeRating: (creature as DnD5eCreatureIndex).challengeRating,
            hasLegendaryActions: (creature as DnD5eCreatureIndex).hasLegendaryActions
          }),

          creatureType: creature.creatureType,
          size: creature.size,
          hitPoints: creature.hitPoints,
          armorClass: creature.armorClass,
          hasSpells: creature.hasSpells,
          alignment: creature.alignment
        };
      });

      // Calculate pack distribution for summary
      const packResults = new Map();
      results.forEach(creature => {
        const count = packResults.get(creature.packLabel) || 0;
        packResults.set(creature.packLabel, count + 1);
      });

      // Get unique pack information
      const uniquePacks = Array.from(new Set(enhancedCreatures.map(c => c.pack)));
      const topPacks = uniquePacks.slice(0, 5).map(packId => {
        const sampleCreature = enhancedCreatures.find(c => c.pack === packId);
        return {
          id: packId,
          label: sampleCreature?.packLabel || 'Unknown Pack',
          priority: 100 // All packs are prioritized equally in enhanced index
        };
      });

      if (packResults.size > 0) {
      }


      return {
        creatures: results,
        searchSummary: {
          packsSearched: uniquePacks.length,
          topPacks,
          totalCreaturesFound: results.length,
          resultsByPack: Object.fromEntries(packResults),
          criteria: criteria,
          indexMetadata: {
            totalIndexedCreatures: enhancedCreatures.length,
            searchMethod: 'enhanced_persistent_index'
          }
        }
      };

    } catch (error) {
      console.error(`[${this.moduleId}] Enhanced creature search failed:`, error);
      // Fallback to basic search if enhanced index fails
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }
  }

  /**
   * Check if enhanced creature passes all specified criteria (system-aware routing)
   */
  private passesEnhancedCriteria(creature: EnhancedCreatureIndex, criteria: any): boolean {
    // Type guard for PF2e creatures - check for level property
    if ('level' in creature) {
      return this.passesPF2eCriteria(creature as PF2eCreatureIndex, criteria);
    } else {
      return this.passesDnD5eCriteria(creature as DnD5eCreatureIndex, criteria);
    }
  }

  /**
   * Check if D&D 5e creature passes all specified criteria
   */
  private passesDnD5eCriteria(creature: DnD5eCreatureIndex, criteria: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
  }): boolean {

    // Challenge Rating filter
    if (criteria.challengeRating !== undefined) {
      if (typeof criteria.challengeRating === 'number') {
        if (creature.challengeRating !== criteria.challengeRating) {
          return false;
        }
      } else if (typeof criteria.challengeRating === 'object') {
        const { min, max } = criteria.challengeRating;
        if (min !== undefined && creature.challengeRating < min) {
          return false;
        }
        if (max !== undefined && creature.challengeRating > max) {
          return false;
        }
      }
    }

    // Creature Type filter
    if (criteria.creatureType) {
      if (creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
        return false;
      }
    }

    // Size filter
    if (criteria.size) {
      if (creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
        return false;
      }
    }

    // Spellcaster filter
    if (criteria.hasSpells !== undefined) {
      if (creature.hasSpells !== criteria.hasSpells) {
        return false;
      }
    }

    // Legendary Actions filter
    if (criteria.hasLegendaryActions !== undefined) {
      if (creature.hasLegendaryActions !== criteria.hasLegendaryActions) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if PF2e creature passes all specified criteria
   */
  private passesPF2eCriteria(creature: PF2eCreatureIndex, criteria: {
    level?: number | { min?: number; max?: number };
    traits?: string[];
    rarity?: string;
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
  }): boolean {

    // Level filter
    if (criteria.level !== undefined) {
      if (typeof criteria.level === 'number') {
        if (creature.level !== criteria.level) {
          return false;
        }
      } else if (typeof criteria.level === 'object') {
        const { min = -1, max = 25 } = criteria.level;
        if (creature.level < min || creature.level > max) {
          return false;
        }
      }
    }

    // Traits filter (creature must have ALL specified traits)
    if (criteria.traits && criteria.traits.length > 0) {
      const hasAllTraits = criteria.traits.every(requiredTrait =>
        creature.traits.some(t => t.toLowerCase() === requiredTrait.toLowerCase())
      );
      if (!hasAllTraits) {
        return false;
      }
    }

    // Rarity filter
    if (criteria.rarity && creature.rarity !== criteria.rarity) {
      return false;
    }

    // Creature type filter
    if (criteria.creatureType &&
        creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
      return false;
    }

    // Size filter
    if (criteria.size && creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
      return false;
    }

    // Spellcasting filter
    if (criteria.hasSpells !== undefined && creature.hasSpells !== criteria.hasSpells) {
      return false;
    }

    return true;
  }

  /**
   * Fallback to basic creature search if enhanced index fails
   */
  private async fallbackBasicCreatureSearch(criteria: any, limit: number): Promise<{creatures: any[], searchSummary: any}> {
    console.warn(`[${this.moduleId}] Falling back to basic search due to enhanced index failure`);
    
    // Use a simple text-based search as fallback
    const searchTerms: string[] = [];
    
    if (criteria.creatureType) {
      searchTerms.push(criteria.creatureType);
    }
    
    if (criteria.challengeRating) {
      if (typeof criteria.challengeRating === 'number') {
        // Add CR-based name patterns as fallback
        if (criteria.challengeRating >= 15) searchTerms.push('ancient', 'legendary');
        else if (criteria.challengeRating >= 10) searchTerms.push('adult', 'champion');
        else if (criteria.challengeRating >= 5) searchTerms.push('captain', 'knight');
      }
    }
    
    const searchQuery = searchTerms.join(' ') || 'monster';
    const basicResults = await this.searchCompendium(searchQuery, 'Actor');
    
    return {
      creatures: basicResults.slice(0, limit),
      searchSummary: {
        packsSearched: 0,
        topPacks: [],
        totalCreaturesFound: basicResults.length,
        resultsByPack: {},
        criteria: criteria,
        fallback: true,
        searchMethod: 'basic_fallback'
      }
    };
  }

  /**
   * Prioritize compendium packs by likelihood of containing relevant creatures
   * @unused - Replaced by enhanced persistent index system
   */
  // @ts-ignore - Unused method kept for compatibility
  private prioritizePacksForCreatures(packs: any[]): any[] {
    const priorityOrder = [
      // Tier 1: Core D&D 5e content (highest priority)
      { pattern: /^dnd5e\.monsters/, priority: 100 },           // Core D&D 5e monsters 
      { pattern: /^dnd5e\.actors/, priority: 95 },             // Core D&D 5e actors
      { pattern: /ddb.*monsters/i, priority: 90 },             // D&D Beyond monsters
      
      // Tier 2: Official modules and supplements
      { pattern: /^world\..*ddb.*monsters/i, priority: 85 },   // World-specific DDB monsters
      { pattern: /monsters/i, priority: 80 },                  // Any pack with "monsters"
      
      // Tier 3: Campaign and adventure content
      { pattern: /^world\.(?!.*summon|.*hero)/i, priority: 70 }, // World packs (not summons/heroes)
      
      // Tier 4: Specialized content
      { pattern: /summon|familiar/i, priority: 40 },           // Summons and familiars
      
      // Tier 5: Unlikely to contain monsters (lowest priority) 
      { pattern: /hero|player|pc/i, priority: 10 },            // Player characters
    ];

    return packs.sort((a, b) => {
      const aScore = this.getPackPriority(a.metadata.id, a.metadata.label, priorityOrder);
      const bScore = this.getPackPriority(b.metadata.id, b.metadata.label, priorityOrder);
      
      if (aScore !== bScore) {
        return bScore - aScore; // Higher score first
      }
      
      // Secondary sort by pack label alphabetically
      return a.metadata.label.localeCompare(b.metadata.label);
    });
  }

  /**
   * Get priority score for a pack based on ID and label
   */
  private getPackPriority(packId: string, packLabel: string, priorityOrder: { pattern: RegExp; priority: number }[]): number {
    for (const rule of priorityOrder) {
      if (rule.pattern.test(packId) || rule.pattern.test(packLabel)) {
        return rule.priority;
      }
    }
    // Default priority for unmatched packs
    return 50;
  }

  /**
   * Check if creature entry passes the given criteria
   * @unused - Legacy method replaced by passesEnhancedCriteria
   */
  // @ts-ignore - Legacy method kept for compatibility
  private passesCriteria(entry: any, criteria: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
  }): boolean {
    const system = entry.system || {};


    // Challenge Rating filter - enhanced extraction
    if (criteria.challengeRating !== undefined) {
      // Try multiple possible CR locations in D&D 5e data structure
      let entryCR = system.details?.cr?.value || system.details?.cr || system.cr?.value || system.cr || 0;
      
      // Handle fractional CRs (common in D&D 5e)
      if (typeof entryCR === 'string') {
        if (entryCR === '1/8') entryCR = 0.125;
        else if (entryCR === '1/4') entryCR = 0.25;
        else if (entryCR === '1/2') entryCR = 0.5;
        else entryCR = parseFloat(entryCR) || 0;
      }
      
      if (typeof criteria.challengeRating === 'number') {
        if (entryCR !== criteria.challengeRating) {
          return false;
        }
      } else if (typeof criteria.challengeRating === 'object') {
        const { min = 0, max = 30 } = criteria.challengeRating;
        if (entryCR < min || entryCR > max) {
          return false;
        }
      }
    }

    // Creature Type filter - enhanced extraction
    if (criteria.creatureType) {
      // Try multiple possible type locations in D&D 5e data structure
      const entryType = system.details?.type?.value || system.details?.type || system.type?.value || system.type || '';
      if (entryType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
        return false;
      }
    }

    // Size filter
    if (criteria.size) {
      const entrySize = system.traits?.size || system.size || '';
      if (entrySize.toLowerCase() !== criteria.size.toLowerCase()) return false;
    }

    // Spellcaster filter
    if (criteria.hasSpells !== undefined) {
      const isSpellcaster = !!(system.spells || system.attributes?.spellcasting || 
                               (system.details?.spellLevel && system.details.spellLevel > 0));
      if (isSpellcaster !== criteria.hasSpells) return false;
    }

    // Legendary Actions filter
    if (criteria.hasLegendaryActions !== undefined) {
      const hasLegendary = !!(system.resources?.legact || system.legendary || 
                             (system.resources?.legres && system.resources.legres.value > 0));
      if (hasLegendary !== criteria.hasLegendaryActions) return false;
    }

    return true;
  }

  /**
   * Simple name/description-based matching for creatures using index data only
   */
  private matchesSearchCriteria(entry: any, criteria: {
    searchTerms?: string[];
    excludeTerms?: string[];
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
  }): boolean {
    const name = (entry.name || '').toLowerCase();
    const description = (entry.description || '').toLowerCase();
    const searchText = `${name} ${description}`;

    // Include terms - at least one must match
    if (criteria.searchTerms && criteria.searchTerms.length > 0) {
      const hasMatch = criteria.searchTerms.some(term => 
        searchText.includes(term.toLowerCase())
      );
      if (!hasMatch) {
        return false;
      }
    }

    // Exclude terms - none should match
    if (criteria.excludeTerms && criteria.excludeTerms.length > 0) {
      const hasExcluded = criteria.excludeTerms.some(term => 
        searchText.includes(term.toLowerCase())
      );
      if (hasExcluded) {
        return false;
      }
    }

    return true;
  }

  /**
   * List all actors with basic information
   */
  async listActors(): Promise<Array<{ id: string; name: string; type: string; img?: string }>> {

    return game.actors.map(actor => ({
      id: actor.id || '',
      name: actor.name || '',
      type: actor.type,
      ...(actor.img ? { img: actor.img } : {}),
    }));
  }

  /**
   * Get active scene information
   */
  async getActiveScene(): Promise<SceneInfo> {

    const scene = (game.scenes as any).current;
    if (!scene) {
      throw new Error(ERROR_MESSAGES.SCENE_NOT_FOUND);
    }

    const sceneData: SceneInfo = {
      id: scene.id,
      name: scene.name,
      img: scene.img || undefined,
      background: scene.background?.src || undefined,
      width: scene.width,
      height: scene.height,
      padding: scene.padding,
      active: scene.active,
      navigation: scene.navigation,
      tokens: scene.tokens.map((token: any) => ({
        id: token.id,
        name: token.name,
        x: token.x,
        y: token.y,
        width: token.width,
        height: token.height,
        actorId: token.actorId || undefined,
        img: token.texture?.src || '',
        hidden: token.hidden,
        disposition: this.getTokenDisposition(token.disposition),
      })),
      walls: scene.walls.size,
      lights: scene.lights.size,
      sounds: scene.sounds.size,
      notes: scene.notes.map((note: any) => ({
        id: note.id,
        text: note.text || '',
        x: note.x,
        y: note.y,
      })),
    };

    return sceneData;
  }

  /**
   * Get world information
   */
  async getWorldInfo(): Promise<WorldInfo> {
    // World info doesn't require special permissions as it's basic metadata
    
    return {
      id: game.world.id,
      title: game.world.title,
      system: game.system.id,
      systemVersion: game.system.version,
      foundryVersion: game.version,
      users: game.users.map(user => ({
        id: user.id || '',
        name: user.name || '',
        active: user.active,
        isGM: user.isGM,
      })),
    };
  }

  /**
   * Get available compendium packs
   */
  async getAvailablePacks() {

    return Array.from(game.packs.values()).map(pack => ({
      id: pack.metadata.id,
      label: pack.metadata.label,
      type: pack.metadata.type,
      system: pack.metadata.system,
      private: pack.metadata.private,
    }));
  }

  /**
   * Sanitize data to remove sensitive information and make it JSON-safe
   */
  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    try {
      // removeSensitiveFields now returns a sanitized copy
      const sanitized = this.removeSensitiveFields(data);
      
      // Use custom JSON serializer to avoid deprecated property warnings
      const jsonString = this.safeJSONStringify(sanitized);
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to sanitize data:`, error);
      return {};
    }
  }

  /**
   * Remove sensitive fields from data object with circular reference protection
   * Returns a sanitized copy instead of modifying the original
   */
  private removeSensitiveFields(obj: any, visited: WeakSet<object> = new WeakSet(), depth: number = 0): any {
    // Handle primitives
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Safety depth limit to prevent extremely deep recursion
    if (depth > 50) {
      console.warn(`[${this.moduleId}] Sanitization depth limit reached at depth ${depth}`);
      return '[Max depth reached]';
    }

    // Check for circular reference
    if (visited.has(obj)) {
      return '[Circular Reference]';
    }

    // Mark this object as visited
    visited.add(obj);

    try {
      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => this.removeSensitiveFields(item, visited, depth + 1));
      }

      // Create a new sanitized object
      const sanitized: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        // Skip sensitive and problematic fields entirely
        if (this.isSensitiveOrProblematicField(key)) {
          continue;
        }

        // Skip most private properties except essential ones
        if (key.startsWith('_') && !['_id', '_stats', '_source'].includes(key)) {
          continue;
        }

        // Recursively sanitize the value
        sanitized[key] = this.removeSensitiveFields(value, visited, depth + 1);
      }

      return sanitized;

    } catch (error) {
      console.warn(`[${this.moduleId}] Error during sanitization at depth ${depth}:`, error);
      return '[Sanitization failed]';
    }
  }

  /**
   * Check if a field should be excluded from sanitized output
   */
  private isSensitiveOrProblematicField(key: string): boolean {
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'auth',
      'credential', 'session', 'cookie', 'private'
    ];

    const problematicKeys = [
      'parent', '_parent', 'collection', 'apps', 'document', '_document',
      'constructor', 'prototype', '__proto__', 'valueOf', 'toString'
    ];

    // Skip deprecated ability save properties that trigger warnings
    const deprecatedKeys = [
      'save' // Skip the deprecated 'save' property on abilities
    ];

    return sensitiveKeys.includes(key) || problematicKeys.includes(key) || deprecatedKeys.includes(key);
  }

  /**
   * Custom JSON serializer that handles Foundry objects safely
   */
  private safeJSONStringify(obj: any): string {
    try {
      return JSON.stringify(obj, (key, value) => {
        // Skip deprecated properties during JSON serialization
        if (key === 'save' && typeof value === 'object' && value !== null) {
          // If this looks like a deprecated ability save object, skip it
          return undefined;
        }
        return value;
      });
    } catch (error) {
      console.warn(`[${this.moduleId}] JSON stringify failed, using fallback:`, error);
      return '{}';
    }
  }

  /**
   * Get token disposition as number
   */
  private getTokenDisposition(disposition: any): number {
    if (typeof disposition === 'number') {
      return disposition;
    }
    
    // Default to neutral if unknown
    return TOKEN_DISPOSITIONS.NEUTRAL;
  }

  /**
   * Validate that Foundry is ready and world is active
   */
  validateFoundryState(): void {
    if (!game || !game.ready) {
      throw new Error('Foundry VTT is not ready');
    }

    if (!game.world) {
      throw new Error('No active world');
    }

    if (!game.user) {
      throw new Error('No active user');
    }
  }


  /**
   * Audit log for write operations
   */
  private auditLog(operation: string, data: any, result: 'success' | 'failure', error?: string): void {
    // Always audit write operations (no setting required)
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      user: game.user?.name || 'Unknown',
      userId: game.user?.id || 'unknown',
      world: game.world?.id || 'unknown',
      data: this.sanitizeData(data),
      result,
      error,
    };

    
    // Store in flags for persistence (optional)
    if (game.world && (game.world as any).setFlag) {
      const auditLogs = (game.world as any).getFlag(this.moduleId, 'auditLogs') || [];
      auditLogs.push(logEntry);
      
      // Keep only last 100 entries to prevent bloat
      if (auditLogs.length > 100) {
        auditLogs.splice(0, auditLogs.length - 100);
      }
      
      (game.world as any).setFlag(this.moduleId, 'auditLogs', auditLogs);
    }
  }

  // ===== PHASE 2 & 3: WRITE OPERATIONS =====

  /**
   * Create journal entry for quests
   */
  async createJournalEntry(request: { name: string; content: string; folderName?: string }): Promise<{ id: string; name: string }> {
    this.validateFoundryState();

    // Use permission system for journal creation
    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: 1, // Treat journal creation similar to actor creation for permissions
    });

    if (!permissionCheck.allowed) {
      throw new Error(`Journal creation denied: ${permissionCheck.reason}`);
    }

    try {
      // Create journal entry with proper Foundry v13 structure
      const journalData = {
        name: request.name,
        pages: [{
          type: 'text',
          name: 'Quest Details', // Use generic page name to avoid title repetition
          text: {
            content: request.content
          }
        }],
        ownership: { default: 0 }, // GM only by default
        folder: await this.getOrCreateFolder(request.folderName || request.name, 'JournalEntry')
      };

      const journal = await JournalEntry.create(journalData);
      
      if (!journal) {
        throw new Error('Failed to create journal entry');
      }

      const result = {
        id: journal.id,
        name: journal.name || request.name,
      };

      this.auditLog('createJournalEntry', request, 'success');
      return result;

    } catch (error) {
      this.auditLog('createJournalEntry', request, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * List all journal entries
   */
  async listJournals(): Promise<Array<{ id: string; name: string; type: string }>> {
    this.validateFoundryState();

    return game.journal.map((journal: any) => ({
      id: journal.id || '',
      name: journal.name || '',
      type: 'JournalEntry',
    }));
  }

  /**
   * Get journal entry content
   */
  async getJournalContent(journalId: string): Promise<{ content: string } | null> {
    this.validateFoundryState();

    const journal = game.journal.get(journalId);
    if (!journal) {
      return null;
    }

    // Get first text page content
    const firstPage = journal.pages.find((page: any) => page.type === 'text');
    if (!firstPage) {
      return { content: '' };
    }

    return {
      content: firstPage.text?.content || '',
    };
  }

  /**
   * Update journal entry content
   */
  async updateJournalContent(request: { journalId: string; content: string }): Promise<{ success: boolean }> {
    this.validateFoundryState();

    // Use permission system for journal updates - treating as createActor permission level
    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: 1, // Treat journal updates similar to actor creation for permissions
    });

    if (!permissionCheck.allowed) {
      throw new Error(`Journal update denied: ${permissionCheck.reason}`);
    }

    try {
      
      const journal = game.journal.get(request.journalId);
      if (!journal) {
        throw new Error('Journal entry not found');
      }


      // Update first text page or create one if none exists
      const firstPage = journal.pages.find((page: any) => page.type === 'text');
      
      if (firstPage) {
        // Update existing page
        await firstPage.update({
          'text.content': request.content,
        });
      } else {
        // Create new text page
        await journal.createEmbeddedDocuments('JournalEntryPage', [{
          type: 'text',
          name: 'Quest Details', // Use generic page name to avoid title repetition
          text: {
            content: request.content,
          },
        }]);
      }

      this.auditLog('updateJournalContent', request, 'success');
      return { success: true };

    } catch (error) {
      this.auditLog('updateJournalContent', request, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Create actors from compendium entries with custom names
   */
  async createActorFromCompendium(request: ActorCreationRequest): Promise<ActorCreationResult> {
    this.validateFoundryState();

    // Use new permission system
    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: request.quantity || 1,
    });
    
    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    // Audit the permission check
    permissionManager.auditPermissionCheck('createActor', permissionCheck, request);

    const maxActors = game.settings.get(this.moduleId, 'maxActorsPerRequest') as number;
    const quantity = Math.min(request.quantity || 1, maxActors);
    
    // Start transaction for rollback capability
    const transactionId = transactionManager.startTransaction(
      `Create ${quantity} actor(s) from compendium: ${request.creatureType}`
    );

    try {
      // Find matching compendium entry
      const compendiumEntry = await this.findBestCompendiumMatch(request.creatureType, request.packPreference);
      if (!compendiumEntry) {
        throw new Error(`No compendium entry found for "${request.creatureType}"`);
      }


      // Get full compendium document
      const sourceDoc = await this.getCompendiumDocumentFull(
        compendiumEntry.pack, 
        compendiumEntry.id
      );

      const createdActors: CreatedActorInfo[] = [];
      const errors: string[] = [];

      // Create actors with custom names
      for (let i = 0; i < quantity; i++) {
        try {
          const customName = request.customNames?.[i] || 
                           (quantity > 1 ? `${sourceDoc.name} ${i + 1}` : sourceDoc.name);
          
          const newActor = await this.createActorFromSource(sourceDoc, customName);
          
          // Track actor creation for rollback
          transactionManager.addAction(transactionId, 
            transactionManager.createActorCreationAction(newActor.id)
          );
          
          createdActors.push({
            id: newActor.id,
            name: newActor.name,
            originalName: sourceDoc.name,
            type: newActor.type,
            sourcePackId: compendiumEntry.pack,
            sourcePackLabel: compendiumEntry.packLabel,
            img: newActor.img,
          });
        } catch (error) {
          errors.push(`Failed to create actor ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      let tokensPlaced = 0;
      
      // Add to scene if requested and permission allows
      if (request.addToScene && createdActors.length > 0) {
        try {
          const scenePermissionCheck = permissionManager.checkWritePermission('modifyScene', {
            targetIds: createdActors.map(a => a.id),
          });
          
          if (!scenePermissionCheck.allowed) {
            errors.push(`Cannot add to scene: ${scenePermissionCheck.reason}`);
          } else {
            const tokenResult = await this.addActorsToScene({
              actorIds: createdActors.map(a => a.id),
              placement: 'random',
              hidden: false,
            }, transactionId);
            tokensPlaced = tokenResult.tokensCreated;
          }
        } catch (error) {
          errors.push(`Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // If we had partial failure, decide whether to rollback
      if (errors.length > 0 && createdActors.length < quantity) {
        // Rollback if we failed to create more than half the requested actors
        if (createdActors.length < quantity / 2) {
          console.warn(`[${this.moduleId}] Rolling back due to significant failures (${createdActors.length}/${quantity} created)`);
          await transactionManager.rollbackTransaction(transactionId);
          throw new Error(`Actor creation failed: ${errors.join(', ')}`);
        }
      }

      // Commit transaction
      transactionManager.commitTransaction(transactionId);

      const result: ActorCreationResult = {
        success: createdActors.length > 0,
        actors: createdActors,
        ...(errors.length > 0 ? { errors } : {}),
        tokensPlaced,
        totalRequested: quantity,
        totalCreated: createdActors.length,
      };

      this.auditLog('createActorFromCompendium', request, 'success');
      return result;

    } catch (error) {
      // Rollback on complete failure
      try {
        await transactionManager.rollbackTransaction(transactionId);
      } catch (rollbackError) {
        console.error(`[${this.moduleId}] Failed to rollback transaction:`, rollbackError);
      }
      
      this.auditLog('createActorFromCompendium', request, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Create actor from specific compendium entry using pack/item IDs
   */
  async createActorFromCompendiumEntry(request: {
    packId: string;
    itemId: string;
    customNames: string[];
    quantity?: number;
    addToScene?: boolean;
    placement?: {
      type: 'random' | 'grid' | 'center' | 'coordinates';
      coordinates?: { x: number; y: number }[];
    };
  }): Promise<ActorCreationResult> {
    this.validateFoundryState();

    try {
      const { packId, itemId, customNames, quantity = 1, addToScene = false, placement } = request;

      // Validate inputs
      if (!packId || !itemId) {
        throw new Error('Both packId and itemId are required');
      }

      // Get the pack
      const pack = game.packs.get(packId);
      if (!pack) {
        throw new Error(`Compendium pack "${packId}" not found`);
      }

      // Get the specific document
      const sourceDocument = await pack.getDocument(itemId);
      if (!sourceDocument) {
        throw new Error(`Document "${itemId}" not found in pack "${packId}"`);
      }

      if (sourceDocument.type !== 'npc') {
        throw new Error(`Document "${itemId}" is not an actor/NPC (type: ${sourceDocument.type})`);
      }

      const sourceActor = sourceDocument as Actor;

      // Prepare custom names
      const names = customNames.length > 0 ? customNames : [`${sourceActor.name} Copy`];
      const finalQuantity = Math.min(quantity, names.length);

      const createdActors: any[] = [];
      const errors: string[] = [];

      // Create actors
      for (let i = 0; i < finalQuantity; i++) {
        try {
          const customName = names[i] || `${sourceActor.name} ${i + 1}`;
          
          // Create actor data with full system, items, and effects
          const sourceData = sourceActor.toObject() as any;
          const actorData = {
            name: customName,
            type: sourceData.type,
            img: sourceData.img,
            system: sourceData.system || sourceData.data || {},
            items: sourceData.items || [],
            effects: sourceData.effects || [],
            folder: null, // Don't inherit folder
            prototypeToken: sourceData.prototypeToken, // Include prototype token
          };

          
          // Fix remote image URLs - normalize to local paths
          if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
            actorData.prototypeToken.texture.src = null; // Clear remote URL
          }

          // Organize created actors in a folder - use "Foundry MCP Creatures" for generic monsters
          const folderId = await this.getOrCreateFolder('Foundry MCP Creatures', 'Actor');
          if (folderId) {
            (actorData as any).folder = folderId;
          }

          // Create the actor
          const newActor = await Actor.create(actorData);
          if (!newActor) {
            throw new Error(`Failed to create actor "${customName}"`);
          }

          createdActors.push({
            id: newActor.id,
            name: newActor.name,
            originalName: sourceActor.name,
            sourcePackLabel: pack.metadata.label,
          });


        } catch (error) {
          const errorMsg = `Failed to create actor ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`[${MODULE_ID}] ${errorMsg}`, error);
        }
      }

      // Add to scene if requested
      let tokensPlaced = 0;
      if (addToScene && createdActors.length > 0) {
        try {
          const sceneResult = await this.addActorsToScene({
            actorIds: createdActors.map(a => a.id),
            placement: placement?.type || 'grid',
            hidden: false,
            ...(placement?.coordinates && { coordinates: placement.coordinates })
          });
          tokensPlaced = sceneResult.success ? sceneResult.tokensCreated : 0;
        } catch (error) {
          errors.push(`Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      const result: ActorCreationResult = {
        success: createdActors.length > 0,
        totalCreated: createdActors.length,
        totalRequested: finalQuantity,
        actors: createdActors,
        tokensPlaced,
        errors: errors.length > 0 ? errors : undefined,
      };

      this.auditLog('createActorFromCompendiumEntry', request, 'success');
      return result;

    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to create actor from compendium entry`, error);
      this.auditLog('createActorFromCompendiumEntry', request, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get full compendium document with all embedded data
   */
  async getCompendiumDocumentFull(packId: string, documentId: string): Promise<CompendiumEntryFull> {

    const pack = game.packs.get(packId);
    if (!pack) {
      throw new Error(`Compendium pack ${packId} not found`);
    }

    const document = await pack.getDocument(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found in pack ${packId}`);
    }

    // Build comprehensive data structure
    const fullEntry: CompendiumEntryFull = {
      id: document.id || '',
      name: document.name || '',
      type: (document as any).type || 'unknown',
      img: (document as any).img || undefined,
      pack: packId,
      packLabel: pack.metadata.label,
      system: this.sanitizeData((document as any).system || {}),
      fullData: this.sanitizeData(document.toObject()),
    };

    // Add items if the actor has them
    if ((document as any).items) {
      fullEntry.items = (document as any).items.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        img: item.img || undefined,
        system: this.sanitizeData(item.system || {}),
      }));
    }

    // Add effects if the actor has them
    if ((document as any).effects) {
      fullEntry.effects = (document as any).effects.map((effect: any) => ({
        id: effect.id,
        name: effect.name || effect.label || 'Unknown Effect',
        icon: effect.icon || undefined,
        disabled: effect.disabled || false,
        duration: this.sanitizeData(effect.duration || {}),
      }));
    }

    return fullEntry;
  }

  /**
   * Add actors to the current scene as tokens
   */
  async addActorsToScene(placement: SceneTokenPlacement, transactionId?: string): Promise<TokenPlacementResult> {
    this.validateFoundryState();

    // Use new permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: placement.actorIds,
    });
    
    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    // Audit the permission check
    permissionManager.auditPermissionCheck('modifyScene', permissionCheck, placement);

    const scene = (game.scenes as any).current;
    if (!scene) {
      throw new Error('No active scene found');
    }

    this.auditLog('addActorsToScene', placement, 'success');

    try {
      const tokenData: any[] = [];
      const errors: string[] = [];

      for (const actorId of placement.actorIds) {
        try {
          const actor = game.actors.get(actorId);
          if (!actor) {
            errors.push(`Actor ${actorId} not found`);
            continue;
          }

          const tokenDoc = (actor as any).prototypeToken.toObject();
          const position = this.calculateTokenPosition(placement.placement, scene, tokenData.length, placement.coordinates);
          
          // Fix token texture if it's still a remote URL (Foundry may have overridden our actor creation fix)
          if (tokenDoc.texture?.src?.startsWith('http')) {
            console.error(`[${this.moduleId}] Token texture still has remote URL, clearing: ${tokenDoc.texture.src}`);
            tokenDoc.texture.src = null; // Use Foundry's fallback
          } else {
          }
          
          tokenData.push({
            ...tokenDoc,
            x: position.x,
            y: position.y,
            actorId: actorId,
            hidden: placement.hidden,
          });
        } catch (error) {
          errors.push(`Failed to prepare token for actor ${actorId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      const createdTokens = await scene.createEmbeddedDocuments('Token', tokenData);

      // Track token creation for rollback if transaction is active
      if (transactionId && createdTokens.length > 0) {
        for (const token of createdTokens) {
          transactionManager.addAction(transactionId, 
            transactionManager.createTokenCreationAction(token.id)
          );
        }
      }

      const result: TokenPlacementResult = {
        success: createdTokens.length > 0,
        tokensCreated: createdTokens.length,
        tokenIds: createdTokens.map((token: any) => token.id),
        ...(errors.length > 0 ? { errors } : {}),
      };

      this.auditLog('addActorsToScene', placement, 'success');
      return result;

    } catch (error) {
      this.auditLog('addActorsToScene', placement, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Find best matching compendium entry for creature type
   */
  private async findBestCompendiumMatch(creatureType: string, packPreference?: string): Promise<CompendiumSearchResult | null> {
    // First try exact search
    const exactResults = await this.searchCompendium(creatureType, 'Actor');
    
    // Look for exact name match first
    const exactMatch = exactResults.find(result => 
      result.name.toLowerCase() === creatureType.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    // Look for partial matches, preferring specified pack
    if (packPreference) {
      const packMatch = exactResults.find(result => 
        result.pack === packPreference
      );
      if (packMatch) return packMatch;
    }

    // Return best fuzzy match
    return exactResults.length > 0 ? exactResults[0] : null;
  }

  /**
   * Create actor from source document with custom name
   */
  private async createActorFromSource(sourceDoc: CompendiumEntryFull, customName: string): Promise<any> {
    
    try {
      // Clone the source data
      const actorData = foundry.utils.deepClone(sourceDoc.fullData) as any;
      
      // Apply customizations
      actorData.name = customName;
      
      // Fix only token texture - leave portrait (actor.img) alone
      if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
        console.error(`[${this.moduleId}] Removing remote token texture URL: ${actorData.prototypeToken.texture.src}`);
        actorData.prototypeToken.texture.src = null; // Let Foundry use fallback
      }
      
      
      // Remove source-specific identifiers
      delete actorData._id;
      delete actorData.folder;
      delete actorData.sort;
      
      // Ensure required fields are present
      if (!actorData.name) actorData.name = customName;
      if (!actorData.type) actorData.type = sourceDoc.type || 'npc';
      
      // Organize created actors in a folder - use "Foundry MCP Creatures" for generic monsters  
      const folderId = await this.getOrCreateFolder('Foundry MCP Creatures', 'Actor');
      if (folderId) {
        (actorData as any).folder = folderId;
      }
      
      // Create the new actor
      const createdDocs = await Actor.createDocuments([actorData]);
      if (!createdDocs || createdDocs.length === 0) {
        throw new Error('Failed to create actor document');
      }

      return createdDocs[0];
    } catch (error) {
      console.error(`[${this.moduleId}] Actor creation failed:`, error);
      throw error;
    }
  }

  /**
   * Calculate token position based on placement strategy
   */
  private calculateTokenPosition(placement: 'random' | 'grid' | 'center' | 'coordinates', scene: any, index: number, coordinates?: { x: number; y: number }[]): { x: number; y: number } {
    const gridSize = scene.grid?.size || 100;
    
    switch (placement) {
      case 'coordinates':
        if (coordinates && coordinates[index]) {
          return coordinates[index];
        }
        // Fallback to grid if coordinates not provided or insufficient
        const fallbackCols = Math.ceil(Math.sqrt(index + 1));
        const fallbackRow = Math.floor(index / fallbackCols);
        const fallbackCol = index % fallbackCols;
        return {
          x: gridSize + (fallbackCol * gridSize * 2),
          y: gridSize + (fallbackRow * gridSize * 2),
        };
      
      case 'center':
        return {
          x: (scene.width / 2) + (index * gridSize),
          y: scene.height / 2,
        };
      
      case 'grid':
        const cols = Math.ceil(Math.sqrt(index + 1));
        const row = Math.floor(index / cols);
        const col = index % cols;
        return {
          x: gridSize + (col * gridSize * 2),
          y: gridSize + (row * gridSize * 2),
        };
      
      case 'random':
      default:
        return {
          x: Math.random() * (scene.width - gridSize),
          y: Math.random() * (scene.height - gridSize),
        };
    }
  }

  /**
   * Validate write operation permissions
   */
  async validateWritePermissions(operation: 'createActor' | 'modifyScene'): Promise<{ allowed: boolean; reason?: string; requiresConfirmation?: boolean; warnings?: string[] }> {
    this.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission(operation);
    
    // Audit the permission check
    permissionManager.auditPermissionCheck(operation, permissionCheck);

    return {
      allowed: permissionCheck.allowed,
      ...(permissionCheck.reason ? { reason: permissionCheck.reason } : {}),
      ...(permissionCheck.requiresConfirmation ? { requiresConfirmation: permissionCheck.requiresConfirmation } : {}),
      ...(permissionCheck.warnings ? { warnings: permissionCheck.warnings } : {}),
    };
  }

  /**
   * Request player rolls - creates interactive roll buttons in chat
   */
  async requestPlayerRolls(data: {
    rollType: string;
    rollTarget: string;
    targetPlayer: string;
    isPublic: boolean;
    rollModifier: string;
    flavor: string;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    this.validateFoundryState();

    try {
      // Resolve target player from character name or player name with enhanced error handling
      const playerInfo = this.resolveTargetPlayer(data.targetPlayer);
      if (!playerInfo.found) {
        // Provide structured error message for MCP that Claude Desktop can understand
        const errorMessage = playerInfo.errorMessage || `Could not find player or character: ${data.targetPlayer}`;
        
        return {
          success: false,
          message: '',
          error: errorMessage
        };
      }

      // Build roll formula based on type and target
      const rollFormula = this.buildRollFormula(data.rollType, data.rollTarget, data.rollModifier, playerInfo.character);
      
      // Generate roll button HTML
      const buttonId = foundry.utils.randomID();
      const buttonLabel = this.buildRollButtonLabel(data.rollType, data.rollTarget, data.isPublic);
      
      // Check if this type of roll was already performed (optional: could check for duplicate recent rolls)
      // For now, we'll just create the button and let the rendering logic handle the state restoration
      
      
      const rollButtonHtml = `
        <div class="mcp-roll-request" style="margin: 12px 0; padding: 12px; border: 1px solid #ccc; border-radius: 8px; background: #f9f9f9;">
          <p><strong>Roll Request:</strong> ${buttonLabel}</p>
          <p><strong>Target:</strong> ${playerInfo.targetName} ${playerInfo.character ? `(${playerInfo.character.name})` : ''}</p>
          ${data.flavor ? `<p><strong>Context:</strong> ${data.flavor}</p>` : ''}
          
          <div style="text-align: center; margin-top: 8px;">
            <!-- Single Roll Button (clickable by both character owner and GM) -->
            <button class="mcp-roll-button mcp-button-active" 
                    data-button-id="${buttonId}"
                    data-roll-formula="${rollFormula}"
                    data-roll-label="${buttonLabel}"
                    data-is-public="${data.isPublic}"
                    data-character-id="${playerInfo.character?.id || ''}"
                    data-target-user-id="${playerInfo.user?.id || ''}">
              🎲 ${buttonLabel}
            </button>
          </div>
        </div>
      `;

      // Create chat message with roll button
      // For PUBLIC rolls: both roll request and results visible to all players
      // For PRIVATE rolls: both roll request and results visible to target player + GM only
      const whisperTargets: string[] = [];
      
      if (!data.isPublic) {
        // Private roll request: whisper to target player + GM only
        
        // Always whisper to the character owner if they exist
        if (playerInfo.user?.id) {
          whisperTargets.push(playerInfo.user.id);
        }
        
        // Also send to GM (GMs can see all whispered messages anyway, but this ensures they see it)
        const gmUsers = game.users?.filter((u: User) => u.isGM && u.active);
        if (gmUsers) {
          for (const gm of gmUsers) {
            if (gm.id && !whisperTargets.includes(gm.id)) {
              whisperTargets.push(gm.id);
            }
          }
        }
      } else {
        // Public roll request: visible to all players (empty whisperTargets array)
      }
      
      const messageData = {
        content: rollButtonHtml,
        speaker: ChatMessage.getSpeaker({ actor: game.user }),
        style: (CONST as any).CHAT_MESSAGE_STYLES?.OTHER || 0, // Use style instead of deprecated type
        whisper: whisperTargets,
        flags: {
          [MODULE_ID]: {
            rollButtons: {
              [buttonId]: {
                rolled: false,
                rollFormula: rollFormula,
                rollLabel: buttonLabel,
                isPublic: data.isPublic,
                characterId: playerInfo.character?.id || '',
                targetUserId: playerInfo.user?.id || ''
              }
            }
          }
        }
      };

      const chatMessage = await ChatMessage.create(messageData);
      
      // Store message ID for later updates
      this.saveRollButtonMessageId(buttonId, chatMessage.id);

      // Note: Click handlers are attached globally via renderChatMessageHTML hook in main.ts
      // This ensures all users get the handlers when they see the message

      return {
        success: true,
        message: `Roll request sent to ${playerInfo.targetName}. ${data.isPublic ? 'Public roll' : 'Private roll'} button created in chat.`
      };

    } catch (error) {
      console.error(`[${MODULE_ID}] Error creating roll request:`, error);
      return {
        success: false,
        message: '',
        error: error instanceof Error ? error.message : 'Unknown error creating roll request'
      };
    }
  }

  /**
   * Enhanced player resolution with offline/non-existent player detection
   * Supports partial matching and provides structured error messages for MCP
   */
  private resolveTargetPlayer(targetPlayer: string): {
    found: boolean;
    user?: User;
    character?: Actor;
    targetName: string;
    errorType?: 'PLAYER_OFFLINE' | 'PLAYER_NOT_FOUND' | 'CHARACTER_NOT_FOUND';
    errorMessage?: string;
  } {
    const searchTerm = targetPlayer.toLowerCase().trim();
    
    
    // FIRST: Check all registered users (both active and inactive) for player name match
    const allUsers = Array.from(game.users?.values() || []);
    
    // Try exact player name match first (active and inactive users)
    let user = allUsers.find((u: User) => 
      u.name?.toLowerCase() === searchTerm
    );
    
    if (user) {
      const isActive = user.active;
      
      if (!isActive) {
        // Player exists but is offline
        return {
          found: false,
          user,
          targetName: user.name || 'Unknown Player',
          errorType: 'PLAYER_OFFLINE',
          errorMessage: `Player "${user.name}" is registered but not currently logged in. They need to be online to receive roll requests.`
        };
      }
      
      // Find the player's character for roll calculations
      const playerCharacter = game.actors?.find((actor: Actor) => {
        if (!user) return false;
        return actor.testUserPermission(user, 'OWNER') && !user.isGM;
      });
      
      return {
        found: true,
        user,
        ...(playerCharacter && { character: playerCharacter }), // Include character only if found
        targetName: user.name || 'Unknown Player'
      };
    }
    
    // Try partial player name match (active and inactive users)
    if (!user) {
      user = allUsers.find((u: User) => {
        return Boolean(u.name && u.name.toLowerCase().includes(searchTerm));
      });
      
      if (user) {
        const isActive = user.active;
        
        if (!isActive) {
          // Player exists but is offline
          return {
            found: false,
            user,
            targetName: user.name || 'Unknown Player',
            errorType: 'PLAYER_OFFLINE',
            errorMessage: `Player "${user.name}" is registered but not currently logged in. They need to be online to receive roll requests.`
          };
        }
        
        // Find the player's character for roll calculations
        const playerCharacter = game.actors?.find((actor: Actor) => {
          if (!user) return false;
          return actor.testUserPermission(user, 'OWNER') && !user.isGM;
        });
        
        return {
          found: true,
          user,
          ...(playerCharacter && { character: playerCharacter }), // Include character only if found
          targetName: user.name || 'Unknown Player'
        };
      }
    }

    // SECOND: Try to find by character name (exact match, then partial match)
    let character = game.actors?.find((actor: Actor) => 
      actor.name?.toLowerCase() === searchTerm && actor.hasPlayerOwner
    );
    
    if (character) {
    }
    
    // If no exact character match, try partial match
    if (!character) {
      character = game.actors?.find((actor: Actor) => {
        return Boolean(actor.name && actor.name.toLowerCase().includes(searchTerm) && actor.hasPlayerOwner);
      });
      
      if (character) {
      }
    }

    if (character) {
      // Find the actual player owner (not GM) of this character
      const ownerUser = allUsers.find((u: User) => 
        character.testUserPermission(u, 'OWNER') && !u.isGM
      );
      
      if (ownerUser) {
        const isOwnerActive = ownerUser.active;
        
        if (!isOwnerActive) {
          // Character owner exists but is offline
          return {
            found: false,
            user: ownerUser,
            character,
            targetName: ownerUser.name || 'Unknown Player',
            errorType: 'PLAYER_OFFLINE',
            errorMessage: `Player "${ownerUser.name}" (owner of character "${character.name}") is registered but not currently logged in. They need to be online to receive roll requests.`
          };
        }
        
        return {
          found: true,
          user: ownerUser,
          character,
          targetName: ownerUser.name || 'Unknown Player'
        };
      } else {
        // No player owner found - character is GM-only controlled
        // Still return found=true but without user, GM can still roll for it
        return {
          found: true,
          character,
          targetName: character.name || 'Unknown Character'
          // user is omitted (undefined) for GM-only characters
        };
      }
    }

    // THIRD: Check if the search term might be a character that exists but has no player owner
    const anyCharacter = game.actors?.find((actor: Actor) => {
      if (!actor.name) return false;
      return actor.name.toLowerCase() === searchTerm || 
             actor.name.toLowerCase().includes(searchTerm);
    });
    
    if (anyCharacter && !anyCharacter.hasPlayerOwner) {
      return {
        found: true,
        character: anyCharacter,
        targetName: anyCharacter.name || 'Unknown Character'
        // No user for GM-controlled characters
      };
    }

    // No player or character found at all
    
    return {
      found: false,
      targetName: targetPlayer,
      errorType: 'PLAYER_NOT_FOUND',
      errorMessage: `No player or character named "${targetPlayer}" found. Available players: ${allUsers.filter(u => !u.isGM).map(u => u.name).join(', ') || 'none'}`
    };
  }

  /**
   * Build roll formula based on roll type and target using Foundry's roll data system
   */
  private buildRollFormula(rollType: string, rollTarget: string, rollModifier: string, character?: Actor): string {
    let baseFormula = '1d20';

    if (character) {
      // Use Foundry's getRollData() to get calculated modifiers including active effects
      const rollData = character.getRollData() as any; // Type assertion for Foundry's dynamic roll data
      
      
      switch (rollType) {
        case 'ability':
          // Use calculated ability modifier from roll data
          const abilityMod = rollData.abilities?.[rollTarget]?.mod ?? 0;
          baseFormula = `1d20+${abilityMod}`;
          break;
        
        case 'skill':
          // Map skill name to skill code (D&D 5e uses 3-letter codes)
          const skillCode = this.getSkillCode(rollTarget);
          // Use calculated skill total from roll data (includes ability mod + proficiency + bonuses)
          const skillMod = rollData.skills?.[skillCode]?.total ?? 0;
          baseFormula = `1d20+${skillMod}`;
          break;
        
        case 'save':
          // Use saving throw modifier from roll data
          const saveMod = rollData.abilities?.[rollTarget]?.save ?? rollData.abilities?.[rollTarget]?.mod ?? 0;
          baseFormula = `1d20+${saveMod}`;
          break;
        
        case 'initiative':
          // Use initiative modifier from attributes or dex mod
          const initMod = rollData.attributes?.init?.mod ?? rollData.abilities?.dex?.mod ?? 0;
          baseFormula = `1d20+${initMod}`;
          break;
        
        case 'custom':
          baseFormula = rollTarget; // Use rollTarget as the formula directly
          break;
        
        default:
          baseFormula = '1d20';
      }
    } else {
      console.warn(`[${MODULE_ID}] No character provided for roll formula, using base 1d20`);
    }

    // Add modifier if provided
    if (rollModifier && rollModifier.trim()) {
      const modifier = rollModifier.startsWith('+') || rollModifier.startsWith('-') ? rollModifier : `+${rollModifier}`;
      baseFormula += modifier;
    }

    return baseFormula;
  }

  /**
   * Map skill names to D&D 5e skill codes
   */
  private getSkillCode(skillName: string): string {
    const skillMap: { [key: string]: string } = {
      'acrobatics': 'acr',
      'animal handling': 'ani', 
      'animalhandling': 'ani',
      'arcana': 'arc',
      'athletics': 'ath',
      'deception': 'dec',
      'history': 'his',
      'insight': 'ins',
      'intimidation': 'itm',
      'investigation': 'inv',
      'medicine': 'med',
      'nature': 'nat',
      'perception': 'prc',
      'performance': 'prf',
      'persuasion': 'per',
      'religion': 'rel',
      'sleight of hand': 'slt',
      'sleightofhand': 'slt',
      'stealth': 'ste',
      'survival': 'sur'
    };
    
    const normalizedName = skillName.toLowerCase().replace(/\s+/g, '');
    const skillCode = skillMap[normalizedName] || skillMap[skillName.toLowerCase()] || skillName.toLowerCase();
    
    return skillCode;
  }

  /**
   * Build roll button label
   */
  private buildRollButtonLabel(rollType: string, rollTarget: string, isPublic: boolean): string {
    const visibility = isPublic ? 'Public' : 'Private';
    
    switch (rollType) {
      case 'ability':
        return `${rollTarget.toUpperCase()} Ability Check (${visibility})`;
      case 'skill':
        return `${rollTarget.charAt(0).toUpperCase() + rollTarget.slice(1)} Skill Check (${visibility})`;
      case 'save':
        return `${rollTarget.toUpperCase()} Saving Throw (${visibility})`;
      case 'attack':
        return `${rollTarget} Attack (${visibility})`;
      case 'initiative':
        return `Initiative Roll (${visibility})`;
      case 'custom':
        return `Custom Roll (${visibility})`;
      default:
        return `Roll (${visibility})`;
    }
  }

  /**
   * Restore roll button states from persistent storage
   * Called when chat messages are rendered to maintain state across sessions
   */

  /**
   * Attach click handlers to roll buttons and handle visibility
   * Called by global renderChatMessageHTML hook in main.ts
   */
  public attachRollButtonHandlers(html: JQuery): void {
    const currentUserId = game.user?.id;
    const isGM = game.user?.isGM;
    
    // Note: Roll state restoration now handled by ChatMessage content, not DOM manipulation
    
    // Handle button visibility and styling based on permissions and public/private status
    // IMPORTANT: Skip styling for buttons that are already in rolled state
    html.find('.mcp-roll-button').each((_index, element) => {
      const button = $(element);
      const targetUserId = button.data('target-user-id');
      const isPublicRollRaw = button.data('is-public');
      const isPublicRoll = isPublicRollRaw === true || isPublicRollRaw === 'true';
      
      // Note: No need to check for rolled state - ChatMessage.update() replaces buttons with completion status
      
      // Determine if user can interact with this button
      const canClickButton = isGM || (targetUserId && targetUserId === currentUserId);
      
      
      if (isPublicRoll) {
        // Public roll: show to all players, but style differently for non-clickable users
        if (canClickButton) {
          // Can click: normal active button
          button.css({
            'background': '#4CAF50',
            'cursor': 'pointer',
            'opacity': '1'
          });
        } else {
          // Cannot click: disabled/informational style
          button.css({
            'background': '#9E9E9E',
            'cursor': 'not-allowed', 
            'opacity': '0.7'
          });
          button.prop('disabled', true);
        }
      } else {
        // Private roll: only show to target user and GM
        if (canClickButton) {
          button.show();
        } else {
          button.hide();
        }
      }
    });
    
    // Attach click handlers to roll buttons
    html.find('.mcp-roll-button').on('click', async (event) => {
      const button = $(event.currentTarget);
      
      // Ignore clicks on disabled buttons
      if (button.prop('disabled')) {
        return;
      }

      // Prevent double-clicks by immediately disabling the button
      button.prop('disabled', true);
      const originalText = button.text();
      button.text('🎲 Rolling...');
      

      // Check if this button is already being processed by another user
      const buttonId = button.data('button-id');
      if (buttonId && this.isRollButtonProcessing(buttonId)) {
        button.text('🎲 Processing...');
        return;
      }

      // Mark this button as being processed
      if (buttonId) {
        this.setRollButtonProcessing(buttonId, true);
      }

      // Validate button has required data
      if (!buttonId) {
        console.warn(`[${MODULE_ID}] Button missing button-id data attribute`);
        button.prop('disabled', false);
        button.text(originalText);
        return;
      }
      
      const rollFormula = button.data('roll-formula');
      const rollLabel = button.data('roll-label');
      const isPublicRaw = button.data('is-public');
      const isPublic = isPublicRaw === true || isPublicRaw === 'true'; // Convert to proper boolean
      const characterId = button.data('character-id');
      const targetUserId = button.data('target-user-id');
      const isGmRoll = game.user?.isGM || false; // Determine if this is a GM executing the roll


      // Check if user has permission to execute this roll
      // Allow GM to roll for any character, or allow character owner to roll for their character
      const canExecuteRoll = game.user?.isGM || (targetUserId && targetUserId === game.user?.id);
      
      if (!canExecuteRoll) {
        console.warn(`[${MODULE_ID}] Permission denied for roll execution`);
        ui.notifications?.warn('You do not have permission to execute this roll');
        return;
      }
      

      try {
        // Create and evaluate the roll
        const roll = new Roll(rollFormula);
        await roll.evaluate();


        // Get the character for speaker info
        const character = characterId ? game.actors?.get(characterId) : null;
        
        // Use the modern Foundry v13 approach with roll.toMessage()
        const rollMode = isPublic ? 'publicroll' : 'whisper';
        const whisperTargets: string[] = [];
        
        if (!isPublic) {
          // For private rolls: whisper to target + GM
          if (targetUserId) {
            whisperTargets.push(targetUserId);
          }
          // Add all active GMs
          const gmUsers = game.users?.filter((u: User) => u.isGM && u.active);
          if (gmUsers) {
            for (const gm of gmUsers) {
              if (gm.id && !whisperTargets.includes(gm.id)) {
                whisperTargets.push(gm.id);
              }
            }
          }
        }
        
        const messageData: any = {
          speaker: ChatMessage.getSpeaker({ actor: character }),
          flavor: `${rollLabel} ${isGmRoll ? '(GM Override)' : ''}`,
          ...(whisperTargets.length > 0 ? { whisper: whisperTargets } : {})
        };
        
        
        // Use roll.toMessage() with proper rollMode
        await roll.toMessage(messageData, { 
          create: true,
          rollMode: rollMode
        });

        // Update the ChatMessage to reflect rolled state
        const buttonId = button.data('button-id');
        if (buttonId && game.user?.id) {
          try {
            await this.updateRollButtonMessage(buttonId, game.user.id, rollLabel);
          } catch (updateError) {
            console.error(`[${MODULE_ID}] Failed to update chat message:`, updateError);
            console.error(`[${MODULE_ID}] Error details:`, updateError instanceof Error ? updateError.stack : updateError);
            // Fall back to DOM manipulation if message update fails
            button.prop('disabled', true).text('✓ Rolled');
          }
        } else {
          console.warn(`[${MODULE_ID}] Cannot update ChatMessage - missing buttonId or userId:`, {
            buttonId,
            userId: game.user?.id
          });
        }
        
      } catch (error) {
        console.error(`[${MODULE_ID}] Error executing roll:`, error);
        ui.notifications?.error('Failed to execute roll');
        
        // Re-enable button on error so user can try again
        button.prop('disabled', false);
        button.text(originalText);
      } finally {
        // Clear processing state
        if (buttonId) {
          this.setRollButtonProcessing(buttonId, false);
        }
      }
    });
  }

  /**
   * Get enhanced creature index for campaign analysis
   */
  async getEnhancedCreatureIndex(): Promise<any[]> {
    this.validateFoundryState();

    // Get the enhanced creature index (builds if needed)
    const enhancedCreatures = await this.persistentIndex.getEnhancedIndex();
    
    return enhancedCreatures || [];
  }

  /**
   * Save roll button state to persistent storage
   */
  async saveRollState(buttonId: string, userId: string): Promise<void> {
    // LEGACY METHOD - Redirecting to new ChatMessage.update() system
    
    try {
      // Use the new ChatMessage.update() approach instead
      const rollLabel = 'Legacy Roll'; // We don't have the label here, use generic
      await this.updateRollButtonMessage(buttonId, userId, rollLabel);
    } catch (error) {
      console.error(`[${MODULE_ID}] Legacy saveRollState redirect failed:`, error);
      // Don't throw - we don't want to break the old system completely
    }
  }

  /**
   * Get roll button state from persistent storage
   */
  getRollState(buttonId: string): { rolled: boolean; rolledBy?: string; rolledByName?: string; timestamp?: number } | null {
    this.validateFoundryState();

    try {
      const rollStates = game.settings.get(MODULE_ID, 'rollStates') || {};
      return rollStates[buttonId] || null;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting roll state:`, error);
      return null;
    }
  }

  /**
   * Save button ID to message ID mapping for ChatMessage updates
   */
  saveRollButtonMessageId(buttonId: string, messageId: string): void {
    try {
      const buttonMessageMap = game.settings.get(MODULE_ID, 'buttonMessageMap') || {};
      buttonMessageMap[buttonId] = messageId;
      game.settings.set(MODULE_ID, 'buttonMessageMap', buttonMessageMap);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error saving button-message mapping:`, error);
    }
  }

  /**
   * Get message ID for a roll button
   */
  getRollButtonMessageId(buttonId: string): string | null {
    try {
      const buttonMessageMap = game.settings.get(MODULE_ID, 'buttonMessageMap') || {};
      return buttonMessageMap[buttonId] || null;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting button-message mapping:`, error);
      return null;
    }
  }

  /**
   * Get roll button state from ChatMessage flags
   */
  getRollStateFromMessage(chatMessage: any, buttonId: string): any {
    try {
      const rollButtons = chatMessage.getFlag(MODULE_ID, 'rollButtons');
      return rollButtons?.[buttonId] || null;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting roll state from message:`, error);
      return null;
    }
  }

  /**
   * Update the ChatMessage to replace button with rolled state
   */
  async updateRollButtonMessage(buttonId: string, userId: string, rollLabel: string): Promise<void> {
    try {

      // Get the message ID for this button
      const messageId = this.getRollButtonMessageId(buttonId);
      
      if (!messageId) {
        throw new Error(`No message ID found for button ${buttonId}`);
      }

      // Get the chat message
      const chatMessage = game.messages?.get(messageId);
      
      if (!chatMessage) {
        throw new Error(`ChatMessage ${messageId} not found`);
      }

      const rolledByName = game.users?.get(userId)?.name || 'Unknown';
      const timestamp = new Date().toLocaleString();

      // Check permissions before attempting update
      const canUpdate = chatMessage.canUserModify(game.user, 'update');

      if (!canUpdate && !game.user?.isGM) {
        // Non-GM user cannot update message - request GM to do it via socket
        
        // Find online GM
        const onlineGM = game.users?.find(u => u.isGM && u.active);
        if (!onlineGM) {
          throw new Error('No Game Master is online to update the chat message');
        }

        // Send socket request to GM
        if (game.socket) {
          game.socket.emit('module.foundry-mcp-bridge', {
            type: 'requestMessageUpdate',
            buttonId: buttonId,
            userId: userId,
            rollLabel: rollLabel,
            messageId: messageId,
            fromUserId: game.user.id,
            targetGM: onlineGM.id
          });
          return; // Exit early - GM will handle the update
        } else {
          throw new Error('Socket not available for GM communication');
        }
      }

      // Update the message flags to mark button as rolled
      const currentFlags = chatMessage.flags || {};
      const moduleFlags = currentFlags[MODULE_ID] || {};
      const rollButtons = moduleFlags.rollButtons || {};
      
      rollButtons[buttonId] = {
        ...rollButtons[buttonId],
        rolled: true,
        rolledBy: userId,
        rolledByName: rolledByName,
        timestamp: Date.now()
      };

      // Create the rolled state HTML
      const rolledHtml = `
        <div class="mcp-roll-request" style="margin: 10px 0; padding: 10px; border: 1px solid #ccc; border-radius: 5px; background: #f9f9f9;">
          <p><strong>Roll Request:</strong> ${rollLabel}</p>
          <p><strong>Status:</strong> ✅ <strong>Completed by ${rolledByName}</strong> at ${timestamp}</p>
        </div>
      `;


      // Update the message content and flags
      await chatMessage.update({
        content: rolledHtml,
        flags: {
          ...currentFlags,
          [MODULE_ID]: {
            ...moduleFlags,
            rollButtons: rollButtons
          }
        }
      });


    } catch (error) {
      console.error(`[${MODULE_ID}] Error updating roll button message:`, error);
      console.error(`[${MODULE_ID}] Error stack:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Request GM to save roll state (for non-GM users who can't write to world settings)
   */
  requestRollStateSave(buttonId: string, userId: string): void {
    // LEGACY METHOD - Redirecting to new ChatMessage.update() system
    
    try {
      // Use the new ChatMessage.update() approach instead
      const rollLabel = 'Legacy Roll'; // We don't have the label here, use generic
      this.updateRollButtonMessage(buttonId, userId, rollLabel)
        .then(() => {
        })
        .catch((error) => {
          console.error(`[${MODULE_ID}] Legacy requestRollStateSave redirect failed:`, error);
          // If the new system fails, just log it - don't use the old socket system
        });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error in legacy requestRollStateSave redirect:`, error);
    }
  }

  /**
   * Broadcast roll state change to all connected users for real-time sync
   */
  broadcastRollState(_buttonId: string, _rollState: any): void {
    // LEGACY METHOD - No longer needed with ChatMessage.update() system
    // ChatMessage.update() automatically broadcasts to all clients, so this method is no longer needed
  }

  /**
   * Clean up old roll states (optional maintenance)
   * Removes roll states older than 30 days to prevent storage bloat
   */
  async cleanOldRollStates(): Promise<number> {
    this.validateFoundryState();

    try {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const rollStates = game.settings.get(MODULE_ID, 'rollStates') || {};
      let cleanedCount = 0;

      // Remove old roll states
      for (const [buttonId, rollState] of Object.entries(rollStates)) {
        if (rollState && typeof rollState === 'object' && 'timestamp' in rollState) {
          const timestamp = (rollState as any).timestamp;
          if (typeof timestamp === 'number' && timestamp < thirtyDaysAgo) {
            delete rollStates[buttonId];
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        await game.settings.set(MODULE_ID, 'rollStates', rollStates);
      }

      return cleanedCount;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error cleaning old roll states:`, error);
      return 0;
    }
  }

  /**
   * Set actor ownership permission for a user
   */
  async setActorOwnership(data: { actorId: string; userId: string; permission: number }): Promise<{ success: boolean; message: string; error?: string }> {
    this.validateFoundryState();

    try {
      const actor = game.actors?.get(data.actorId);
      if (!actor) {
        return { success: false, error: `Actor not found: ${data.actorId}`, message: '' };
      }

      const user = game.users?.get(data.userId);
      if (!user) {
        return { success: false, error: `User not found: ${data.userId}`, message: '' };
      }

      // Get current ownership
      const currentOwnership = (actor as any).ownership || {};
      const newOwnership = { ...currentOwnership };
      
      // Set the new permission level
      newOwnership[data.userId] = data.permission;

      // Update the actor
      await actor.update({ ownership: newOwnership });

      const permissionNames = { 0: 'NONE', 1: 'LIMITED', 2: 'OBSERVER', 3: 'OWNER' };
      const permissionName = permissionNames[data.permission as keyof typeof permissionNames] || data.permission.toString();

      return {
        success: true,
        message: `Set ${actor.name} ownership to ${permissionName} for ${user.name}`,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Error setting actor ownership:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: '',
      };
    }
  }

  /**
   * Get actor ownership information
   */
  async getActorOwnership(data: { actorIdentifier?: string; playerIdentifier?: string }): Promise<any> {
    this.validateFoundryState();

    try {
      const actors = data.actorIdentifier ? 
        (data.actorIdentifier === 'all' ? Array.from(game.actors || []) : [this.findActorByIdentifier(data.actorIdentifier)].filter(Boolean)) :
        Array.from(game.actors || []);

      const users = data.playerIdentifier ?
        [game.users?.getName(data.playerIdentifier) || game.users?.get(data.playerIdentifier)].filter(Boolean) :
        Array.from(game.users || []);

      const ownershipInfo = [];
      const permissionNames = { 0: 'NONE', 1: 'LIMITED', 2: 'OBSERVER', 3: 'OWNER' };

      for (const actor of actors) {
        const actorInfo: any = {
          id: actor.id,
          name: actor.name,
          type: actor.type,
          ownership: [],
        };

        for (const user of users.filter(u => u && !u.isGM)) {
          const permission = actor.testUserPermission(user, 'OWNER') ? 3 :
                            actor.testUserPermission(user, 'OBSERVER') ? 2 :
                            actor.testUserPermission(user, 'LIMITED') ? 1 : 0;
          
          actorInfo.ownership.push({
            userId: user!.id,
            userName: user!.name,
            permission: permissionNames[permission as keyof typeof permissionNames],
            numericPermission: permission,
          });
        }

        ownershipInfo.push(actorInfo);
      }

      return ownershipInfo;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting actor ownership:`, error);
      throw error;
    }
  }

  /**
   * Find actor by name or ID
   */
  private findActorByIdentifier(identifier: string): any {
    return game.actors?.get(identifier) || 
           game.actors?.getName(identifier) ||
           Array.from(game.actors || []).find(a => 
             a.name?.toLowerCase().includes(identifier.toLowerCase())
           );
  }

  /**
   * Get friendly NPCs from current scene
   */
  async getFriendlyNPCs(): Promise<Array<{id: string, name: string}>> {
    this.validateFoundryState();

    try {
      const scene = game.scenes?.find(s => s.active);
      if (!scene) {
        return [];
      }

      const friendlyTokens = scene.tokens.filter((token: any) => 
        token.disposition === 1 // FRIENDLY disposition
      );

      return friendlyTokens.map((token: any) => ({
        id: token.actor?.id || token.id || '',
        name: token.name || token.actor?.name || 'Unknown',
      })).filter(t => t.id);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting friendly NPCs:`, error);
      return [];
    }
  }

  /**
   * Get party characters (player-owned actors)
   */
  async getPartyCharacters(): Promise<Array<{id: string, name: string}>> {
    this.validateFoundryState();

    try {
      const partyCharacters = Array.from(game.actors || []).filter(actor => 
        actor.hasPlayerOwner && actor.type === 'character'
      );

      return partyCharacters.map(actor => ({
        id: actor.id || '',
        name: actor.name || 'Unknown',
      })).filter(c => c.id);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting party characters:`, error);
      return [];
    }
  }

  /**
   * Get connected players (excluding GM)
   */
  async getConnectedPlayers(): Promise<Array<{id: string, name: string}>> {
    this.validateFoundryState();

    try {
      const connectedPlayers = Array.from(game.users || []).filter(user => 
        user.active && !user.isGM
      );

      return connectedPlayers.map(user => ({
        id: user.id || '',
        name: user.name || 'Unknown',
      })).filter(u => u.id);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting connected players:`, error);
      return [];
    }
  }

  /**
   * Find players by identifier with partial matching
   */
  async findPlayers(data: { identifier: string; allowPartialMatch?: boolean; includeCharacterOwners?: boolean }): Promise<Array<{id: string, name: string}>> {
    this.validateFoundryState();

    try {
      const { identifier, allowPartialMatch = true, includeCharacterOwners = true } = data;
      const searchTerm = identifier.toLowerCase();
      const players = [];

      // Direct user name matching
      for (const user of game.users || []) {
        if (user.isGM) continue;

        const userName = user.name?.toLowerCase() || '';
        if (userName === searchTerm || (allowPartialMatch && userName.includes(searchTerm))) {
          players.push({ id: user.id || '', name: user.name || 'Unknown' });
        }
      }

      // Character name matching (find owner of character)
      if (includeCharacterOwners && players.length === 0) {
        for (const actor of game.actors || []) {
          if (actor.type !== 'character') continue;
          
          const actorName = actor.name?.toLowerCase() || '';
          if (actorName === searchTerm || (allowPartialMatch && actorName.includes(searchTerm))) {
            // Find the player owner of this character
            const owner = game.users?.find(user => 
              actor.testUserPermission(user, 'OWNER') && !user.isGM
            );
            
            if (owner && !players.some(p => p.id === owner.id)) {
              players.push({ id: owner.id || '', name: owner.name || 'Unknown' });
            }
          }
        }
      }

      return players.filter(p => p.id);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error finding players:`, error);
      return [];
    }
  }

  /**
   * Find single actor by identifier
   */
  async findActor(data: { identifier: string }): Promise<{id: string, name: string} | null> {
    this.validateFoundryState();

    try {
      const actor = this.findActorByIdentifier(data.identifier);
      return actor ? { id: actor.id, name: actor.name } : null;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error finding actor:`, error);
      return null;
    }
  }

  // Private storage for tracking roll button processing states
  private rollButtonProcessingStates: Map<string, boolean> = new Map();

  /**
   * Check if a roll button is currently being processed
   */
  private isRollButtonProcessing(buttonId: string): boolean {
    return this.rollButtonProcessingStates.get(buttonId) || false;
  }

  /**
   * Set roll button processing state
   */
  private setRollButtonProcessing(buttonId: string, processing: boolean): void {
    if (processing) {
      this.rollButtonProcessingStates.set(buttonId, true);
    } else {
      this.rollButtonProcessingStates.delete(buttonId);
    }
  }

  /**
   * Get or create a folder for organizing MCP-generated content
   */
  private async getOrCreateFolder(folderName: string, type: 'Actor' | 'JournalEntry'): Promise<string | null> {
    try {
      // Look for existing folder
      const existingFolder = game.folders?.find((f: any) => 
        f.name === folderName && f.type === type
      );
      
      if (existingFolder) {
        return existingFolder.id;
      }

      // Create appropriate descriptions
      let description = '';
      if (type === 'Actor') {
        if (folderName === 'Foundry MCP Creatures') {
          description = 'Creatures and monsters created via Foundry MCP Bridge';
        } else {
          description = `NPCs and creatures related to: ${folderName}`;
        }
      } else {
        description = `Quest and content for: ${folderName}`;
      }

      // Create new folder
      const folderData = {
        name: folderName,
        type: type,
        description: description,
        color: type === 'Actor' ? '#4a90e2' : '#f39c12', // Blue for actors, orange for journals
        sort: 0,
        parent: null,
        flags: {
          'foundry-mcp-bridge': {
            mcpGenerated: true,
            createdAt: new Date().toISOString(),
            questContext: type === 'JournalEntry' ? folderName : undefined
          }
        }
      };

      const folder = await Folder.create(folderData);
      return folder?.id || null;
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to create folder "${folderName}":`, error);
      // Return null so items are created without folders rather than failing
      return null;
    }
  }

  /**
   * List all scenes with filtering options
   */
  async listScenes(options: { filter?: string; include_active_only?: boolean } = {}): Promise<any[]> {
    this.validateFoundryState();

    try {
      let scenes = game.scenes?.contents || [];

      // Filter by active only if requested
      if (options.include_active_only) {
        scenes = scenes.filter((scene: any) => scene.active);
      }

      // Filter by name if provided
      if (options.filter) {
        const filterLower = options.filter.toLowerCase();
        scenes = scenes.filter((scene: any) =>
          scene.name.toLowerCase().includes(filterLower)
        );
      }

      // Map to consistent format
      return scenes.map((scene: any) => ({
        id: scene.id,
        name: scene.name,
        active: scene.active,
        dimensions: {
          width: scene.dimensions?.width || (scene as any).width || 0,
          height: scene.dimensions?.height || (scene as any).height || 0
        },
        gridSize: scene.grid?.size || 100,
        background: scene.background?.src || scene.img || '',
        walls: scene.walls?.size || 0,
        tokens: scene.tokens?.size || 0,
        lighting: scene.lights?.size || 0,
        sounds: scene.sounds?.size || 0,
        navigation: scene.navigation || false
      }));
    } catch (error) {
      throw new Error(`Failed to list scenes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Switch to a different scene
   */
  async switchScene(options: { scene_identifier: string; optimize_view?: boolean }): Promise<any> {
    this.validateFoundryState();

    try {
      // Find the target scene by ID or name
      const scenes = game.scenes?.contents || [];
      const targetScene = scenes.find((scene: any) =>
        scene.id === options.scene_identifier ||
        scene.name.toLowerCase() === options.scene_identifier.toLowerCase()
      );

      if (!targetScene) {
        throw new Error(`Scene not found: "${options.scene_identifier}"`);
      }

      // Activate the scene
      await targetScene.activate();

      // Optimize view if requested (default true)
      if (options.optimize_view !== false && typeof canvas !== 'undefined' && canvas?.scene) {
        const dimensions = targetScene.dimensions || {
          width: (targetScene as any).width || 0,
          height: (targetScene as any).height || 0
        };
        const width = (dimensions as any).width || 0;
        const height = (dimensions as any).height || 0;

        if (width && height) {
          // Center the view on the scene
          await canvas.pan({
            x: width / 2,
            y: height / 2,
            scale: Math.min(
              (canvas as any).screenDimensions?.[0] / width || 1,
              (canvas as any).screenDimensions?.[1] / height || 1,
              1
            )
          });
        }
      }

      return {
        success: true,
        sceneId: targetScene.id,
        sceneName: targetScene.name,
        dimensions: {
          width: (targetScene.dimensions as any)?.width || (targetScene as any).width || 0,
          height: (targetScene.dimensions as any)?.height || (targetScene as any).height || 0
        }
      };
    } catch (error) {
      throw new Error(`Failed to switch scene: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Move a token to a new position
   */
  async moveToken(tokenId: string, x: number, y: number, animate: boolean = false): Promise<any> {
    this.validateFoundryState();

    // Use permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    const scene = (game.scenes as any).current;
    if (!scene) {
      throw new Error('No active scene found');
    }

    const token = scene.tokens.get(tokenId);
    if (!token) {
      throw new Error(`Token ${tokenId} not found in current scene`);
    }

    try {
      await token.update({ x, y }, { animate });

      this.auditLog('moveToken', { tokenId, x, y, animate }, 'success');

      return {
        success: true,
        tokenId,
        newPosition: { x, y },
      };
    } catch (error) {
      this.auditLog('moveToken', { tokenId, x, y }, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Update token properties
   */
  async updateToken(tokenId: string, updates: any): Promise<any> {
    this.validateFoundryState();

    // Use permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    const scene = (game.scenes as any).current;
    if (!scene) {
      throw new Error('No active scene found');
    }

    const token = scene.tokens.get(tokenId);
    if (!token) {
      throw new Error(`Token ${tokenId} not found in current scene`);
    }

    try {
      // Filter out undefined values
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );

      await token.update(cleanUpdates);

      this.auditLog('updateToken', { tokenId, updates: cleanUpdates }, 'success');

      return {
        success: true,
        tokenId,
        updated: true,
      };
    } catch (error) {
      this.auditLog('updateToken', { tokenId, updates }, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Delete one or more tokens from the current scene
   */
  async deleteTokens(tokenIds: string[]): Promise<any> {
    this.validateFoundryState();

    // Use permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: tokenIds,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    const scene = (game.scenes as any).current;
    if (!scene) {
      throw new Error('No active scene found');
    }

    const errors: string[] = [];
    const deletedIds: string[] = [];

    try {
      for (const tokenId of tokenIds) {
        try {
          const token = scene.tokens.get(tokenId);
          if (!token) {
            errors.push(`Token ${tokenId} not found`);
            continue;
          }

          await token.delete();
          deletedIds.push(tokenId);
        } catch (error) {
          errors.push(`Failed to delete token ${tokenId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      this.auditLog('deleteTokens', { tokenIds, deletedCount: deletedIds.length }, 'success');

      return {
        success: deletedIds.length > 0,
        deletedCount: deletedIds.length,
        tokenIds: deletedIds,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      this.auditLog('deleteTokens', { tokenIds }, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get detailed information about a specific token
   */
  async getTokenDetails(tokenId: string): Promise<any> {
    this.validateFoundryState();

    const scene = (game.scenes as any).current;
    if (!scene) {
      throw new Error('No active scene found');
    }

    const token = scene.tokens.get(tokenId);
    if (!token) {
      throw new Error(`Token ${tokenId} not found in current scene`);
    }

    try {
      const tokenData: any = {
        id: token.id,
        name: token.name,
        x: token.x,
        y: token.y,
        width: token.width,
        height: token.height,
        rotation: token.rotation || 0,
        elevation: token.elevation || 0,
        lockRotation: token.lockRotation || false,
        scale: token.texture?.scaleX || 1,
        alpha: token.alpha || 1,
        hidden: token.hidden,
        disposition: token.disposition,
        img: token.texture?.src || '',
        actorId: token.actorId,
        actorLink: token.actorLink || false,
      };

      // Include actor data if linked to an actor
      if (token.actorId) {
        const actor = game.actors.get(token.actorId);
        if (actor) {
          tokenData.actorData = {
            name: actor.name,
            type: actor.type,
            img: actor.img,
          };

          // Include active conditions/effects
          const activeConditions: any[] = [];
          const statusEffects = (CONFIG as any).statusEffects as any[];

          for (const effect of actor.effects) {
            // Check if this is a status effect
            const effectData: any = {
              id: effect.id,
              name: (effect as any).name || (effect as any).label,
              icon: (effect as any).icon,
              disabled: (effect as any).disabled,
            };

            // Try to match with known status effects
            if ((effect as any).statuses) {
              for (const statusId of (effect as any).statuses) {
                const matchedEffect = statusEffects.find(se => se.id === statusId);
                if (matchedEffect) {
                  effectData.statusId = statusId;
                  effectData.isStatusEffect = true;
                  break;
                }
              }
            }

            activeConditions.push(effectData);
          }

          tokenData.conditions = activeConditions;
        }
      }

      this.auditLog('getTokenDetails', { tokenId }, 'success');

      return tokenData;
    } catch (error) {
      this.auditLog('getTokenDetails', { tokenId }, 'failure', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Toggle a status effect/condition on a token
   */
  async toggleTokenCondition(tokenId: string, conditionId: string, active?: boolean): Promise<any> {
    this.validateFoundryState();

    // Use permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    const scene = (game.scenes as any).current;
    if (!scene) {
      throw new Error('No active scene found');
    }

    const token = scene.tokens.get(tokenId);
    if (!token) {
      throw new Error(`Token ${tokenId} not found in current scene`);
    }

    try {
      // Get the actor associated with the token
      const actor = token.actor;
      if (!actor) {
        throw new Error(`No actor associated with token ${tokenId}`);
      }

      // Find the status effect by ID
      const statusEffects = (CONFIG as any).statusEffects as any[];
      const effect = statusEffects.find(e => e.id === conditionId || e._id === conditionId);

      if (!effect) {
        throw new Error(`Status effect '${conditionId}' not found. Use get-available-conditions to see available effects.`);
      }

      // Check current state
      const hasEffect = actor.effects.some((e: any) => {
        return e.statuses?.has(conditionId) ||
               e.flags?.core?.statusId === conditionId ||
               (e.icon === effect.icon && e.name === effect.name);
      });

      let newState: boolean;

      if (active !== undefined) {
        // Explicit state requested
        if (active && !hasEffect) {
          // Add the effect
          await actor.toggleStatusEffect(conditionId, { active: true });
          newState = true;
        } else if (!active && hasEffect) {
          // Remove the effect
          await actor.toggleStatusEffect(conditionId, { active: false });
          newState = false;
        } else {
          // Already in desired state
          newState = active;
        }
      } else {
        // Toggle current state
        await actor.toggleStatusEffect(conditionId);
        newState = !hasEffect;
      }

      this.auditLog('toggleTokenCondition', { tokenId, conditionId, active, newState }, 'success');

      return {
        success: true,
        tokenId,
        conditionId,
        isActive: newState,
        conditionName: effect.name || effect.label || conditionId,
      };

    } catch (error) {
      this.auditLog('toggleTokenCondition', { tokenId, conditionId, active }, 'failure',
        error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get available status effects/conditions for the current game system
   */
  async getAvailableConditions(): Promise<any> {
    this.validateFoundryState();

    try {
      const statusEffects = (CONFIG as any).statusEffects as any[];

      const conditions = statusEffects.map(effect => ({
        id: effect.id || effect._id,
        name: effect.name || effect.label || effect.id,
        icon: effect.icon || effect.img,
        description: effect.description || '',
      }));

      const gameSystem = (game.system as any).id;

      this.auditLog('getAvailableConditions', {}, 'success');

      return {
        success: true,
        conditions,
        gameSystem,
      };

    } catch (error) {
      this.auditLog('getAvailableConditions', {}, 'failure',
        error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

}