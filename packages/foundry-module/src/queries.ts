import { MODULE_ID } from './constants.js';
import { FoundryDataAccess } from './data-access.js';
import { ComfyUIManager } from './comfyui-manager.js';

export class QueryHandlers {
  public dataAccess: FoundryDataAccess;
  private comfyuiManager: ComfyUIManager;

  constructor() {
    this.dataAccess = new FoundryDataAccess();
    this.comfyuiManager = new ComfyUIManager();
  }

  /**
   * SECURITY: Validate GM access - returns silent failure for non-GM users
   */
  private validateGMAccess(): { allowed: boolean; error?: any } {
    if (!game.user?.isGM) {
      // Silent failure - no error message for non-GM users
      return { allowed: false };
    }
    return { allowed: true };
  }

  /**
   * Register all query handlers in CONFIG.queries
   */
  registerHandlers(): void {
    const modulePrefix = MODULE_ID;

    // Character/Actor queries
    CONFIG.queries[`${modulePrefix}.getCharacterInfo`] = this.handleGetCharacterInfo.bind(this);
    CONFIG.queries[`${modulePrefix}.listActors`] = this.handleListActors.bind(this);

    // Compendium queries
    CONFIG.queries[`${modulePrefix}.searchCompendium`] = this.handleSearchCompendium.bind(this);
    CONFIG.queries[`${modulePrefix}.listCreaturesByCriteria`] =
      this.handleListCreaturesByCriteria.bind(this);
    CONFIG.queries[`${modulePrefix}.getAvailablePacks`] = this.handleGetAvailablePacks.bind(this);
    CONFIG.queries[`${modulePrefix}.getPackIndex`] = this.handleGetPackIndex.bind(this);

    // Scene queries
    CONFIG.queries[`${modulePrefix}.getActiveScene`] = this.handleGetActiveScene.bind(this);
    CONFIG.queries[`${modulePrefix}.list-scenes`] = this.handleListScenes.bind(this);
    CONFIG.queries[`${modulePrefix}.switch-scene`] = this.handleSwitchScene.bind(this);
    CONFIG.queries[`${modulePrefix}.get-scene-music`] = this.handleGetSceneMusic.bind(this);
    CONFIG.queries[`${modulePrefix}.update-scene-music`] = this.handleUpdateSceneMusic.bind(this);
    CONFIG.queries[`${modulePrefix}.list-playlists`] = this.handleListPlaylists.bind(this);
    CONFIG.queries[`${modulePrefix}.manage-playlists`] = this.handleManagePlaylists.bind(this);
    CONFIG.queries[`${modulePrefix}.control-playlist`] = this.handleControlPlaylist.bind(this);

    // World queries
    CONFIG.queries[`${modulePrefix}.getWorldInfo`] = this.handleGetWorldInfo.bind(this);

    // Utility queries
    CONFIG.queries[`${modulePrefix}.ping`] = this.handlePing.bind(this);

    // Phase 2 & 3: Write operation queries
    CONFIG.queries[`${modulePrefix}.createActorFromCompendium`] =
      this.handleCreateActorFromCompendium.bind(this);
    CONFIG.queries[`${modulePrefix}.getCompendiumDocumentFull`] =
      this.handleGetCompendiumDocumentFull.bind(this);
    CONFIG.queries[`${modulePrefix}.addActorsToScene`] = this.handleAddActorsToScene.bind(this);
    CONFIG.queries[`${modulePrefix}.validateWritePermissions`] =
      this.handleValidateWritePermissions.bind(this);
    CONFIG.queries[`${modulePrefix}.createJournalEntry`] = this.handleCreateJournalEntry.bind(this);
    CONFIG.queries[`${modulePrefix}.listJournals`] = this.handleListJournals.bind(this);
    CONFIG.queries[`${modulePrefix}.getJournalContent`] = this.handleGetJournalContent.bind(this);
    CONFIG.queries[`${modulePrefix}.getJournalPageContent`] =
      this.handleGetJournalPageContent.bind(this);
    CONFIG.queries[`${modulePrefix}.updateJournalContent`] =
      this.handleUpdateJournalContent.bind(this);

    // Phase 4: Dice roll queries
    CONFIG.queries[`${modulePrefix}.request-player-rolls`] =
      this.handleRequestPlayerRolls.bind(this);

    // Enhanced creature index for campaign analysis
    CONFIG.queries[`${modulePrefix}.getEnhancedCreatureIndex`] =
      this.handleGetEnhancedCreatureIndex.bind(this);

    // Campaign management queries
    CONFIG.queries[`${modulePrefix}.updateCampaignProgress`] =
      this.handleUpdateCampaignProgress.bind(this);

    // Phase 6: Actor ownership management
    CONFIG.queries[`${modulePrefix}.setActorOwnership`] = this.handleSetActorOwnership.bind(this);
    CONFIG.queries[`${modulePrefix}.getActorOwnership`] = this.handleGetActorOwnership.bind(this);
    CONFIG.queries[`${modulePrefix}.getFriendlyNPCs`] = this.handleGetFriendlyNPCs.bind(this);
    CONFIG.queries[`${modulePrefix}.getPartyCharacters`] = this.handleGetPartyCharacters.bind(this);
    CONFIG.queries[`${modulePrefix}.getConnectedPlayers`] =
      this.handleGetConnectedPlayers.bind(this);
    CONFIG.queries[`${modulePrefix}.findPlayers`] = this.handleFindPlayers.bind(this);
    CONFIG.queries[`${modulePrefix}.findActor`] = this.handleFindActor.bind(this);

    // WFRP4e actor stat-block update
    CONFIG.queries[`${modulePrefix}.updateWfrp4eActor`] = this.handleUpdateWfrp4eActor.bind(this);
    CONFIG.queries[`${modulePrefix}.addWfrp4eItems`] = this.handleAddWfrp4eItems.bind(this);

    // Token manipulation queries
    CONFIG.queries[`${modulePrefix}.moveToken`] = this.handleMoveToken.bind(this);
    CONFIG.queries[`${modulePrefix}.updateToken`] = this.handleUpdateToken.bind(this);
    CONFIG.queries[`${modulePrefix}.deleteTokens`] = this.handleDeleteTokens.bind(this);
    CONFIG.queries[`${modulePrefix}.getTokenDetails`] = this.handleGetTokenDetails.bind(this);
    CONFIG.queries[`${modulePrefix}.toggleTokenCondition`] =
      this.handleToggleTokenCondition.bind(this);
    CONFIG.queries[`${modulePrefix}.getAvailableConditions`] =
      this.handleGetAvailableConditions.bind(this);

    // Map generation queries (hybrid architecture)
    CONFIG.queries[`${modulePrefix}.generate-map`] = this.handleGenerateMap.bind(this);
    CONFIG.queries[`${modulePrefix}.check-map-status`] = this.handleCheckMapStatus.bind(this);
    CONFIG.queries[`${modulePrefix}.cancel-map-job`] = this.handleCancelMapJob.bind(this);
    CONFIG.queries[`${modulePrefix}.upload-generated-map`] =
      this.handleUploadGeneratedMap.bind(this);

    // Item usage queries
    CONFIG.queries[`${modulePrefix}.useItem`] = this.handleUseItem.bind(this);

    // Character search queries
    CONFIG.queries[`${modulePrefix}.searchCharacterItems`] =
      this.handleSearchCharacterItems.bind(this);

    // Item authoring on actor sheets
    CONFIG.queries[`${modulePrefix}.addActorItems`] = this.handleAddActorItems.bind(this);
    CONFIG.queries[`${modulePrefix}.removeActorItems`] = this.handleRemoveActorItems.bind(this);

    // World-level item CRUD
    CONFIG.queries[`${modulePrefix}.createWorldItems`] = this.handleCreateWorldItems.bind(this);
    CONFIG.queries[`${modulePrefix}.listWorldItems`] = this.handleListWorldItems.bind(this);
    CONFIG.queries[`${modulePrefix}.updateWorldItems`] = this.handleUpdateWorldItems.bind(this);
    CONFIG.queries[`${modulePrefix}.getSystemSchema`] = this.handleGetSystemSchema.bind(this);

    // Generic actor CRUD (any system, any type)
    CONFIG.queries[`${modulePrefix}.createActors`] = this.handleCreateActors.bind(this);
    CONFIG.queries[`${modulePrefix}.updateActors`] = this.handleUpdateActors.bind(this);
    CONFIG.queries[`${modulePrefix}.deleteActors`] = this.handleDeleteActors.bind(this);
    CONFIG.queries[`${modulePrefix}.updateActorItems`] = this.handleUpdateActorItems.bind(this);
    CONFIG.queries[`${modulePrefix}.deleteActorItems`] = this.handleDeleteActorItems.bind(this);

    // Phase 7: Token manipulation queries
    CONFIG.queries[`${modulePrefix}.move-token`] = this.handleMoveToken.bind(this);
    CONFIG.queries[`${modulePrefix}.update-token`] = this.handleUpdateToken.bind(this);
    CONFIG.queries[`${modulePrefix}.delete-tokens`] = this.handleDeleteTokens.bind(this);
    CONFIG.queries[`${modulePrefix}.get-token-details`] = this.handleGetTokenDetails.bind(this);
    CONFIG.queries[`${modulePrefix}.toggle-token-condition`] =
      this.handleToggleTokenCondition.bind(this);
    CONFIG.queries[`${modulePrefix}.get-available-conditions`] =
      this.handleGetAvailableConditions.bind(this);

    // D&D 5e queries
    CONFIG.queries[`${modulePrefix}.addSaveFeatureToActor`] =
      this.handleAddSaveFeatureToActor.bind(this);
    CONFIG.queries[`${modulePrefix}.createNpcActor`] = this.handleCreateNpcActor.bind(this);
    CONFIG.queries[`${modulePrefix}.addAttackToActor`] = this.handleAddAttackToActor.bind(this);
    CONFIG.queries[`${modulePrefix}.addAuraToActor`] = this.handleAddAuraToActor.bind(this);
    CONFIG.queries[`${modulePrefix}.addPassiveFeatureToActor`] =
      this.handleAddPassiveFeatureToActor.bind(this);
    CONFIG.queries[`${modulePrefix}.addAttackWithSaveToActor`] =
      this.handleAddAttackWithSaveToActor.bind(this);
    CONFIG.queries[`${modulePrefix}.setActorSpellcasting`] =
      this.handleSetActorSpellcasting.bind(this);
    CONFIG.queries[`${modulePrefix}.addSpellsToActor`] = this.handleAddSpellsToActor.bind(this);
    CONFIG.queries[`${modulePrefix}.addFeaturesFromCompendium`] =
      this.handleAddFeaturesFromCompendium.bind(this);
  }

  /**
   * Unregister all query handlers
   */
  unregisterHandlers(): void {
    const modulePrefix = MODULE_ID;
    const keysToRemove = Object.keys(CONFIG.queries).filter(key => key.startsWith(modulePrefix));

    for (const key of keysToRemove) {
      delete CONFIG.queries[key];
    }
  }

  /**
   * Handle query requests from other parts of the module
   */
  async handleQuery(queryName: string, data: any): Promise<any> {
    try {
      const handler = CONFIG.queries[queryName];
      if (!handler || typeof handler !== 'function') {
        throw new Error(`Query handler not found: ${queryName}`);
      }

      return await handler(data);
    } catch (error) {
      console.error(`[${MODULE_ID}] Query failed: ${queryName}`, error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      };
    }
  }

  /**
   * Handle character information request
   */
  private async handleGetCharacterInfo(data: {
    characterName?: string;
    characterId?: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const identifier = data.characterName || data.characterId;
      if (!identifier) {
        throw new Error('characterName or characterId is required');
      }

      return await this.dataAccess.getCharacterInfo(identifier);
    } catch (error) {
      throw new Error(
        `Failed to get character info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle list actors request
   */
  private async handleListActors(data: { type?: string }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const actors = await this.dataAccess.listActors();

      // Filter by type if specified
      if (data.type) {
        return actors.filter(actor => actor.type === data.type);
      }

      return actors;
    } catch (error) {
      throw new Error(
        `Failed to list actors: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle compendium search request
   */
  private async handleSearchCompendium(data: {
    query: string;
    packType?: string;
    filters?: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      alignment?: string;
      hasLegendaryActions?: boolean;
      spellcaster?: boolean;
    };
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      // Add better parameter validation
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data parameter structure');
      }

      if (!data.query || typeof data.query !== 'string') {
        throw new Error('query parameter is required and must be a string');
      }

      return await this.dataAccess.searchCompendium(data.query, data.packType, data.filters);
    } catch (error) {
      throw new Error(
        `Failed to search compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle list creatures by criteria request
   */
  private async handleListCreaturesByCriteria(data: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
    limit?: number;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const result = await this.dataAccess.listCreaturesByCriteria(data);

      // Handle the new format with search summary
      return {
        response: result,
      };
    } catch (error) {
      throw new Error(
        `Failed to list creatures by criteria: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get available packs request
   */
  private async handleGetAvailablePacks(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.getAvailablePacks();
    } catch (error) {
      throw new Error(
        `Failed to get available packs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get pack index request. Returns a compendium pack's index entries,
   * optionally including extra system fields (e.g. dsa5 species/career) so callers
   * can filter without loading every full document. Used by list-dsa5-archetypes.
   */
  private async handleGetPackIndex(data: { packId: string; fields?: string[] }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      if (!data?.packId) {
        throw new Error('packId is required');
      }
      return await this.dataAccess.getPackIndex(data.packId, data.fields);
    } catch (error) {
      throw new Error(
        `Failed to get pack index: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get active scene request
   */
  private async handleGetActiveScene(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.getActiveScene();
    } catch (error) {
      throw new Error(
        `Failed to get active scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get world info request
   */
  private async handleGetWorldInfo(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.getWorldInfo();
    } catch (error) {
      throw new Error(
        `Failed to get world info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle ping request
   */
  private async handlePing(): Promise<any> {
    return {
      status: 'ok',
      timestamp: Date.now(),
      module: MODULE_ID,
      foundryVersion: game.version,
      worldId: game.world?.id,
      userId: game.user?.id,
    };
  }

  /**
   * Get list of all registered query methods
   */
  getRegisteredMethods(): string[] {
    const modulePrefix = MODULE_ID;
    return Object.keys(CONFIG.queries)
      .filter(key => key.startsWith(modulePrefix))
      .map(key => key.replace(`${modulePrefix}.`, ''));
  }

  /**
   * Test if a specific query handler is registered
   */
  isMethodRegistered(method: string): boolean {
    const queryKey = `${MODULE_ID}.${method}`;
    return queryKey in CONFIG.queries && typeof CONFIG.queries[queryKey] === 'function';
  }

  // ===== PHASE 2: WRITE OPERATION HANDLERS =====

  /**
   * Handle actor creation from specific compendium entry
   */
  private async handleCreateActorFromCompendium(data: {
    packId: string;
    itemId: string;
    customNames?: string[] | undefined;
    quantity?: number | undefined;
    addToScene?: boolean | undefined;
    placement?:
      | {
          type: 'random' | 'grid' | 'center' | 'coordinates';
          coordinates?: { x: number; y: number }[];
        }
      | undefined;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      // Clean interface - direct pack/item reference only
      const requestData: any = {
        packId: data.packId,
        itemId: data.itemId,
        customNames: data.customNames || [],
        quantity: data.quantity || 1,
        addToScene: data.addToScene || false,
      };

      if (data.placement) {
        requestData.placement = data.placement;
      }

      return await this.dataAccess.createActorFromCompendiumEntry(requestData);
    } catch (error) {
      throw new Error(
        `Failed to create actor from compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get compendium document full request
   */
  private async handleGetCompendiumDocumentFull(data: {
    packId: string;
    documentId: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.packId) {
        throw new Error('packId is required');
      }

      if (!data.documentId) {
        throw new Error('documentId is required');
      }

      return await this.dataAccess.getCompendiumDocumentFull(data.packId, data.documentId);
    } catch (error) {
      throw new Error(
        `Failed to get compendium document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add actors to scene request
   */
  private async handleAddActorsToScene(data: {
    actorIds: string[];
    placement?: 'random' | 'grid' | 'center';
    hidden?: boolean;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIds || !Array.isArray(data.actorIds) || data.actorIds.length === 0) {
        throw new Error('actorIds array is required and must not be empty');
      }

      return await this.dataAccess.addActorsToScene({
        actorIds: data.actorIds,
        placement: data.placement || 'random',
        hidden: data.hidden || false,
      });
    } catch (error) {
      throw new Error(
        `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle validate write permissions request
   */
  private async handleValidateWritePermissions(data: {
    operation: 'createActor' | 'modifyScene';
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.operation) {
        throw new Error('operation is required');
      }

      return await this.dataAccess.validateWritePermissions(data.operation);
    } catch (error) {
      throw new Error(
        `Failed to validate write permissions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle journal entry creation
   */
  async handleCreateJournalEntry(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.name) {
        throw new Error('name is required');
      }
      if (!data.content) {
        throw new Error('content is required');
      }

      return await this.dataAccess.createJournalEntry({
        name: data.name,
        content: data.content,
        additionalPages: data.additionalPages,
        folderName: data.folderName,
      });
    } catch (error) {
      throw new Error(
        `Failed to create journal entry: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle list journals request
   */
  async handleListJournals(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.listJournals();
    } catch (error) {
      throw new Error(
        `Failed to list journals: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get journal content request
   */
  async handleGetJournalContent(data: { journalId: string }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.journalId) {
        throw new Error('journalId is required');
      }

      return await this.dataAccess.getJournalContent(data.journalId);
    } catch (error) {
      throw new Error(
        `Failed to get journal content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get specific journal page content request
   */
  async handleGetJournalPageContent(data: { journalId: string; pageId: string }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.journalId) {
        throw new Error('journalId is required');
      }
      if (!data.pageId) {
        throw new Error('pageId is required');
      }

      return await this.dataAccess.getJournalPageContent(data.journalId, data.pageId);
    } catch (error) {
      throw new Error(
        `Failed to get journal page content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle update journal content request
   */
  async handleUpdateJournalContent(data: {
    journalId: string;
    content: string;
    pageId?: string;
    newPageName?: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.journalId) {
        throw new Error('journalId is required');
      }
      if (!data.content) {
        throw new Error('content is required');
      }

      const updateRequest: {
        journalId: string;
        content: string;
        pageId?: string | undefined;
        newPageName?: string | undefined;
      } = {
        journalId: data.journalId,
        content: data.content,
      };
      if (data.pageId) updateRequest.pageId = data.pageId;
      if (data.newPageName) updateRequest.newPageName = data.newPageName;

      return await this.dataAccess.updateJournalContent(updateRequest);
    } catch (error) {
      throw new Error(
        `Failed to update journal content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle request player rolls - creates interactive roll buttons in chat
   */
  async handleRequestPlayerRolls(data: {
    rollType: string;
    rollTarget: string;
    targetPlayer: string;
    isPublic: boolean;
    rollModifier: string;
    flavor: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.rollType || !data.rollTarget || !data.targetPlayer) {
        throw new Error('rollType, rollTarget, and targetPlayer are required');
      }

      return await this.dataAccess.requestPlayerRolls(data);
    } catch (error) {
      throw new Error(
        `Failed to request player rolls: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get enhanced creature index request
   */
  async handleGetEnhancedCreatureIndex(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getEnhancedCreatureIndex();
    } catch (error) {
      throw new Error(
        `Failed to get enhanced creature index: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle campaign progress update request
   */
  async handleUpdateCampaignProgress(data: {
    campaignId: string;
    partId: string;
    newStatus: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      // For now, this is a pass-through to the MCP server
      // In the future, campaign data might be stored in Foundry world flags
      // Currently, the campaign dashboard regeneration happens server-side

      return {
        success: true,
        message: `Campaign progress updated: ${data.partId} is now ${data.newStatus}`,
        campaignId: data.campaignId,
        partId: data.partId,
        newStatus: data.newStatus,
      };
    } catch (error) {
      throw new Error(
        `Failed to update campaign progress: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle set actor ownership request
   */
  async handleSetActorOwnership(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorId || !data.userId || data.permission === undefined) {
        throw new Error('actorId, userId, and permission are required');
      }

      return await this.dataAccess.setActorOwnership(data);
    } catch (error) {
      throw new Error(
        `Failed to set actor ownership: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle WFRP4e actor stat-block update request
   */
  async handleUpdateWfrp4eActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actor) {
        throw new Error('actor (name or id) is required');
      }

      return await this.dataAccess.updateWfrp4eActor(data);
    } catch (error) {
      throw new Error(
        `Failed to update WFRP4e actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Add items (skills, talents, careers, trappings, …) to a WFRP4e actor,
   * resolved from the installed compendiums. GM-only.
   */
  async handleAddWfrp4eItems(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actor) {
        throw new Error('actor (name or id) is required');
      }
      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error('items array is required and must contain at least one entry');
      }

      return await this.dataAccess.addWfrp4eItems(data);
    } catch (error) {
      throw new Error(
        `Failed to add WFRP4e items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get actor ownership request
   */
  async handleGetActorOwnership(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getActorOwnership(data);
    } catch (error) {
      throw new Error(
        `Failed to get actor ownership: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get friendly NPCs request
   */
  async handleGetFriendlyNPCs(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getFriendlyNPCs();
    } catch (error) {
      throw new Error(
        `Failed to get friendly NPCs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get party characters request
   */
  async handleGetPartyCharacters(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getPartyCharacters();
    } catch (error) {
      throw new Error(
        `Failed to get party characters: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get connected players request
   */
  async handleGetConnectedPlayers(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getConnectedPlayers();
    } catch (error) {
      throw new Error(
        `Failed to get connected players: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle find players request
   */
  async handleFindPlayers(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.identifier) {
        throw new Error('identifier is required');
      }

      return await this.dataAccess.findPlayers(data);
    } catch (error) {
      throw new Error(
        `Failed to find players: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle find actor request
   */
  async handleFindActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.identifier) {
        throw new Error('identifier is required');
      }

      return await this.dataAccess.findActor(data);
    } catch (error) {
      throw new Error(
        `Failed to find actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle list scenes request
   */
  private async handleListScenes(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.listScenes(data);
    } catch (error) {
      throw new Error(
        `Failed to list scenes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle switch scene request
   */
  private async handleSwitchScene(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.scene_identifier) {
        throw new Error('scene_identifier is required');
      }

      return await this.dataAccess.switchScene(data);
    } catch (error) {
      throw new Error(
        `Failed to switch scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleGetSceneMusic(data: any): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }
      if (!data?.scene_identifier) {
        throw new Error('scene_identifier is required');
      }
      return await this.dataAccess.getSceneMusic(data);
    } catch (error) {
      throw new Error(
        `Failed to get scene music: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleUpdateSceneMusic(data: any): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }
      if (!data?.scene_identifier) {
        throw new Error('scene_identifier is required');
      }
      return await this.dataAccess.updateSceneMusic(data);
    } catch (error) {
      throw new Error(
        `Failed to update scene music: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleListPlaylists(data: any): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }
      return await this.dataAccess.listPlaylists(data || {});
    } catch (error) {
      throw new Error(
        `Failed to list playlists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleManagePlaylists(data: any): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }
      if (!data?.action) {
        throw new Error('action is required (create | update | delete | describe)');
      }
      return await this.dataAccess.managePlaylists(data);
    } catch (error) {
      throw new Error(
        `Failed to manage playlists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleControlPlaylist(data: any): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }
      if (!data?.playlist || !data?.command) {
        throw new Error('playlist and command are required');
      }
      return await this.dataAccess.controlPlaylist(data);
    } catch (error) {
      throw new Error(
        `Failed to control playlist: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle map generation request - uses hybrid architecture
   */
  private async handleGenerateMap(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.prompt || typeof data.prompt !== 'string') {
        throw new Error('Prompt is required and must be a string');
      }

      if (!data.scene_name || typeof data.scene_name !== 'string') {
        throw new Error('Scene name is required and must be a string');
      }

      // Get quality setting from module settings
      const quality = game.settings.get(MODULE_ID, 'mapGenQuality') || 'low';

      const params = {
        prompt: data.prompt.trim(),
        scene_name: data.scene_name.trim(),
        size: data.size || 'medium',
        grid_size: data.grid_size || 70,
        quality,
      };

      // Use ComfyUIManager to communicate with backend via WebSocket
      const response = await this.comfyuiManager.generateMap(params);
      const isSuccess =
        typeof response?.success === 'boolean' ? response.success : response?.status === 'success';

      if (!isSuccess) {
        const errorMessage = response?.error || response?.message || 'Map generation failed';
        return {
          error: errorMessage,
          success: false,
          status: response?.status ?? 'error',
        };
      }

      return {
        success: true,
        status: response?.status ?? 'success',
        jobId: response.jobId,
        message: response.message || 'Map generation started',
        estimatedTime: response.estimatedTime || '30-90 seconds',
      };
    } catch (error: any) {
      return {
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Handle map status check request - uses hybrid architecture
   */
  private async handleCheckMapStatus(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.job_id) {
        throw new Error('Job ID is required');
      }

      // Use ComfyUIManager to communicate with backend via WebSocket
      const response = await this.comfyuiManager.checkMapStatus(data);
      const isSuccess =
        typeof response?.success === 'boolean' ? response.success : response?.status === 'success';

      if (!isSuccess) {
        const errorMessage = response?.error || response?.message || 'Status check failed';
        return {
          error: errorMessage,
          success: false,
          status: response?.status ?? 'error',
        };
      }

      return {
        success: true,
        status: response?.status ?? 'success',
        job: response.job,
      };
    } catch (error: any) {
      return {
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Handle map job cancellation request - uses hybrid architecture
   */
  private async handleCancelMapJob(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.job_id) {
        throw new Error('Job ID is required');
      }

      // Use ComfyUIManager to communicate with backend via WebSocket
      const response = await this.comfyuiManager.cancelMapJob(data);
      const isSuccess =
        typeof response?.success === 'boolean' ? response.success : response?.status === 'success';

      if (!isSuccess) {
        const errorMessage = response?.error || response?.message || 'Job cancellation failed';
        return {
          error: errorMessage,
          success: false,
          status: response?.status ?? 'error',
        };
      }

      return {
        success: true,
        status: response?.status ?? 'success',
        message: response.message || 'Job cancelled successfully',
      };
    } catch (error: any) {
      return {
        error: error.message,
        success: false,
      };
    }
  }

  /**
   * Handle upload of generated map image (for remote Foundry instances)
   * Receives base64-encoded image data and saves it to generated-maps folder
   */
  private async handleUploadGeneratedMap(data: any): Promise<any> {
    console.log(`[${MODULE_ID}] Upload generated map request received`, {
      hasFilename: !!data.filename,
      hasImageData: !!data.imageData,
      imageDataLength: data.imageData?.length,
    });

    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        console.error(`[${MODULE_ID}] Upload denied - not GM`);
        return { error: 'Access denied', success: false };
      }

      if (!data.filename || typeof data.filename !== 'string') {
        console.error(`[${MODULE_ID}] Upload failed - invalid filename`);
        throw new Error('Filename is required and must be a string');
      }

      if (!data.imageData || typeof data.imageData !== 'string') {
        console.error(`[${MODULE_ID}] Upload failed - invalid image data`);
        throw new Error('Image data is required and must be a base64 string');
      }

      console.log(`[${MODULE_ID}] Validating filename...`);
      // Validate filename for security (prevent path traversal)
      const safeFilename = data.filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      if (
        !safeFilename.endsWith('.png') &&
        !safeFilename.endsWith('.jpg') &&
        !safeFilename.endsWith('.jpeg')
      ) {
        throw new Error('Only PNG and JPEG images are supported');
      }

      console.log(`[${MODULE_ID}] Converting base64 to blob...`, {
        base64Length: data.imageData.length,
        estimatedSizeMB: (data.imageData.length / 1024 / 1024).toFixed(2),
      });

      // Convert base64 to Blob
      const byteCharacters = atob(data.imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      console.log(`[${MODULE_ID}] Creating file object...`, {
        filename: safeFilename,
        blobSize: blob.size,
      });

      // Create a File object from the Blob
      const file = new File([blob], safeFilename, { type: 'image/png' });

      console.log(`[${MODULE_ID}] Ensuring upload directory exists...`);

      // Upload to world-specific folder so maps persist even if module is deleted
      // This also keeps maps organized per world
      const worldId = (game as any).world?.id || 'unknown-world';
      const uploadPath = `worlds/${worldId}/ai-generated-maps`;
      try {
        // Use the modern Foundry API (v13+) with fallback for older versions
        const FilePickerAPI =
          (globalThis as any).foundry?.applications?.apps?.FilePicker?.implementation ||
          (globalThis as any).FilePicker;

        await FilePickerAPI.createDirectory('data', uploadPath, { bucket: null });
        console.log(`[${MODULE_ID}] Directory created/verified: ${uploadPath}`);
      } catch (dirError: any) {
        // Directory might already exist, that's okay
        if (
          !dirError.message?.includes('EEXIST') &&
          !dirError.message?.includes('already exists')
        ) {
          console.warn(`[${MODULE_ID}] Directory creation warning:`, dirError.message);
        }
      }

      console.log(`[${MODULE_ID}] Uploading to FilePicker...`);
      // Upload using Foundry's FilePicker.upload method with modern API
      const FilePickerAPI =
        (globalThis as any).foundry?.applications?.apps?.FilePicker?.implementation ||
        (globalThis as any).FilePicker;
      const response = await FilePickerAPI.upload('data', uploadPath, file, {}, { notify: false });

      console.log(`[${MODULE_ID}] FilePicker.upload response:`, JSON.stringify(response, null, 2));
      console.log(`[${MODULE_ID}] Response keys:`, Object.keys(response || {}));
      console.log(`[${MODULE_ID}] Uploaded generated map to:`, response.path);

      return {
        success: true,
        path: response.path,
        filename: safeFilename,
        message: `Map uploaded successfully to ${response.path}`,
      };
    } catch (error: any) {
      console.error(`[${MODULE_ID}] Failed to upload generated map:`, error);
      return {
        error: error.message || 'Failed to upload generated map',
        success: false,
      };
    }
  }

  // ===== PHASE 7: TOKEN MANIPULATION HANDLERS =====

  /**
   * Handle move token request
   */
  private async handleMoveToken(data: {
    tokenId: string;
    x: number;
    y: number;
    animate?: boolean;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (typeof data.x !== 'number' || typeof data.y !== 'number') {
        throw new Error('x and y coordinates are required and must be numbers');
      }

      return await this.dataAccess.moveToken(data);
    } catch (error) {
      throw new Error(
        `Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle update token request
   */
  private async handleUpdateToken(data: {
    tokenId: string;
    updates: Record<string, any>;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (!data.updates || typeof data.updates !== 'object') {
        throw new Error('updates object is required');
      }

      return await this.dataAccess.updateToken(data);
    } catch (error) {
      throw new Error(
        `Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle delete tokens request
   */
  private async handleDeleteTokens(data: { tokenIds: string[] }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenIds || !Array.isArray(data.tokenIds) || data.tokenIds.length === 0) {
        throw new Error('tokenIds array is required and must not be empty');
      }

      return await this.dataAccess.deleteTokens(data);
    } catch (error) {
      throw new Error(
        `Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get token details request
   */
  private async handleGetTokenDetails(data: { tokenId: string }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }

      return await this.dataAccess.getTokenDetails(data);
    } catch (error) {
      throw new Error(
        `Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle toggle token condition request
   */
  private async handleToggleTokenCondition(data: {
    tokenId: string;
    conditionId: string;
    active: boolean;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (!data.conditionId) {
        throw new Error('conditionId is required');
      }
      if (typeof data.active !== 'boolean') {
        throw new Error('active must be a boolean');
      }

      return await this.dataAccess.toggleTokenCondition(data);
    } catch (error) {
      throw new Error(
        `Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get available conditions request
   */
  private async handleGetAvailableConditions(): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getAvailableConditions();
    } catch (error) {
      throw new Error(
        `Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle use item request (cast spell, use ability, consume item, etc.)
   */
  private async handleUseItem(data: {
    actorIdentifier: string;
    itemIdentifier: string;
    targets?: string[];
    options?: {
      consume?: boolean;
      configureDialog?: boolean;
      spellLevel?: number;
      versatile?: boolean;
    };
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.itemIdentifier) {
        throw new Error('itemIdentifier is required');
      }

      return await this.dataAccess.useItem({
        actorIdentifier: data.actorIdentifier,
        itemIdentifier: data.itemIdentifier,
        targets: data.targets,
        options: data.options,
      });
    } catch (error) {
      throw new Error(
        `Failed to use item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle search character items request
   */
  private async handleSearchCharacterItems(data: {
    characterIdentifier: string;
    query?: string;
    type?: string;
    category?: string;
    limit?: number;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.characterIdentifier) {
        throw new Error('characterIdentifier is required');
      }

      return await this.dataAccess.searchCharacterItems({
        characterIdentifier: data.characterIdentifier,
        query: data.query,
        type: data.type,
        category: data.category,
        limit: data.limit,
      });
    } catch (error) {
      throw new Error(
        `Failed to search character items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleAddActorItems(data: {
    actorIdentifier: string;
    items: Array<{
      name: string;
      type: string;
      img?: string;
      system?: Record<string, any>;
    }>;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation - writes to actor sheets are GM-only
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data?.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!Array.isArray(data?.items) || data.items.length === 0) {
        throw new Error('items array is required and must contain at least one entry');
      }

      return await this.dataAccess.addActorItems({
        actorIdentifier: data.actorIdentifier,
        items: data.items,
      });
    } catch (error) {
      throw new Error(
        `Failed to add actor items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleRemoveActorItems(data: {
    actorIdentifier: string;
    itemIds?: string[];
    itemNames?: string[];
    type?: string;
  }): Promise<any> {
    try {
      // SECURITY: Silent GM validation - writes to actor sheets are GM-only
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data?.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      const hasIds = Array.isArray(data?.itemIds) && data.itemIds.length > 0;
      const hasNames = Array.isArray(data?.itemNames) && data.itemNames.length > 0;
      if (!hasIds && !hasNames) {
        throw new Error('Provide itemIds and/or itemNames identifying the items to remove');
      }

      return await this.dataAccess.removeActorItems({
        actorIdentifier: data.actorIdentifier,
        ...(data.itemIds !== undefined ? { itemIds: data.itemIds } : {}),
        ...(data.itemNames !== undefined ? { itemNames: data.itemNames } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
      });
    } catch (error) {
      throw new Error(
        `Failed to remove actor items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleUpdateWorldItems(data: {
    updates: Array<{
      id: string;
      name?: string;
      img?: string;
      system?: Record<string, any>;
      folder?: string;
    }>;
  }): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!Array.isArray(data?.updates) || data.updates.length === 0) {
        throw new Error('updates array is required and must contain at least one entry');
      }

      return await this.dataAccess.updateWorldItems({ updates: data.updates });
    } catch (error) {
      throw new Error(
        `Failed to update world items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleListWorldItems(data: {
    type?: string;
    folder?: string;
    nameFilter?: string;
  }): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.listWorldItems({
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.folder !== undefined ? { folder: data.folder } : {}),
        ...(data.nameFilter !== undefined ? { nameFilter: data.nameFilter } : {}),
      });
    } catch (error) {
      throw new Error(
        `Failed to list world items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleCreateWorldItems(data: {
    items: Array<{
      name: string;
      type: string;
      img?: string;
      system?: Record<string, any>;
    }>;
    folder?: string;
  }): Promise<any> {
    try {
      // SECURITY: World item creation is GM-only
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!Array.isArray(data?.items) || data.items.length === 0) {
        throw new Error('items array is required and must contain at least one entry');
      }

      return await this.dataAccess.createWorldItems({
        items: data.items,
        ...(data.folder !== undefined ? { folder: data.folder } : {}),
      });
    } catch (error) {
      throw new Error(
        `Failed to create world items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ===== D&D 5E HANDLERS =====

  /**
   * Handle add save feature to actor request (D&D 5e only)
   */
  private async handleAddSaveFeatureToActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.featureName) {
        throw new Error('featureName is required');
      }

      return await this.dataAccess.addSaveFeatureToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add save feature to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle create NPC actor request (D&D 5e only)
   */
  private async handleCreateNpcActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.name) {
        throw new Error('name is required');
      }
      if (data.cr === undefined || data.cr === null) {
        throw new Error('cr is required');
      }
      if (!data.creatureType) {
        throw new Error('creatureType is required');
      }
      if (!data.size) {
        throw new Error('size is required');
      }
      if (!data.abilities || typeof data.abilities !== 'object') {
        throw new Error('abilities is required and must be an object');
      }
      if (data.hpAverage === undefined || data.hpAverage === null) {
        throw new Error('hpAverage is required');
      }
      if (!data.hpFormula) {
        throw new Error('hpFormula is required');
      }
      if (!data.acMode) {
        throw new Error('acMode is required');
      }

      return await this.dataAccess.createNpcActor(data);
    } catch (error) {
      throw new Error(
        `Failed to create NPC actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add attack feature to actor request (D&D 5e only)
   */
  private async handleAddAttackToActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.featureName) {
        throw new Error('featureName is required');
      }
      if (!data.attackType) {
        throw new Error('attackType is required');
      }
      if (!Array.isArray(data.damageParts) || data.damageParts.length === 0) {
        throw new Error('damageParts is required and must contain at least one element');
      }

      return await this.dataAccess.addAttackToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add attack to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add aura feature to actor request (D&D 5e only)
   */
  private async handleAddAuraToActor(data: any): Promise<any> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.featureName) {
        throw new Error('featureName is required');
      }
      if (!Array.isArray(data.damageParts) || data.damageParts.length === 0) {
        throw new Error('damageParts is required and must contain at least one element');
      }
      if (!data.areaType) {
        throw new Error('areaType is required');
      }
      if (data.areaSize === undefined || data.areaSize === null) {
        throw new Error('areaSize is required');
      }

      return await this.dataAccess.addAuraToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add aura to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add passive feature to actor request (D&D 5e only)
   */
  private async handleAddPassiveFeatureToActor(data: any): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.featureName) {
        throw new Error('featureName is required');
      }

      return await this.dataAccess.addPassiveFeatureToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add passive feature to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle add attack+save feature to actor request (D&D 5e only)
   */
  private async handleAddAttackWithSaveToActor(data: any): Promise<any> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) throw new Error('actorIdentifier is required');
      if (!data.featureName) throw new Error('featureName is required');
      if (!data.attackType) throw new Error('attackType is required');
      if (!Array.isArray(data.damageParts) || data.damageParts.length === 0) {
        throw new Error('damageParts is required and must contain at least one element');
      }
      if (!data.saveAbility) throw new Error('saveAbility is required');
      if (!data.saveDC) throw new Error('saveDC is required');
      if (!Array.isArray(data.saveDamageParts) || data.saveDamageParts.length === 0) {
        throw new Error('saveDamageParts is required and must contain at least one element');
      }

      return await this.dataAccess.addAttackWithSaveToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add attack+save to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleSetActorSpellcasting(data: any): Promise<any> {
    try {
      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.spellcastingClass) {
        throw new Error('spellcastingClass is required');
      }
      if (
        typeof data.spellcastingLevel !== 'number' ||
        data.spellcastingLevel < 1 ||
        data.spellcastingLevel > 20
      ) {
        throw new Error('spellcastingLevel must be a number between 1 and 20');
      }
      if (!data.effectiveAbility) {
        throw new Error('effectiveAbility is required');
      }

      return await this.dataAccess.setActorSpellcasting(data);
    } catch (error) {
      throw new Error(
        `Failed to set actor spellcasting: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleAddSpellsToActor(data: any): Promise<any> {
    try {
      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!Array.isArray(data.spellNames) || data.spellNames.length === 0) {
        throw new Error('spellNames is required and must contain at least one element');
      }
      if (data.spellNames.length > 50) {
        throw new Error('spellNames cannot contain more than 50 elements');
      }

      return await this.dataAccess.addSpellsToActor(data);
    } catch (error) {
      throw new Error(
        `Failed to add spells to actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleAddFeaturesFromCompendium(data: any): Promise<any> {
    try {
      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!Array.isArray(data.featureNames) || data.featureNames.length === 0) {
        throw new Error('featureNames is required and must contain at least one element');
      }
      if (data.featureNames.length > 50) {
        throw new Error('featureNames cannot contain more than 50 elements');
      }

      return await this.dataAccess.addFeaturesFromCompendium(data);
    } catch (error) {
      throw new Error(
        `Failed to add features from compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleGetSystemSchema(_data: any): Promise<any> {
    try {
      return this.dataAccess.getSystemSchema();
    } catch (error) {
      throw new Error(
        `Failed to get system schema: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ─── Generic actor CRUD ─────────────────────────────────────────────────────

  private async handleCreateActors(data: {
    actors: Array<{
      name: string;
      type: string;
      img?: string;
      system?: Record<string, any>;
    }>;
    folder?: string;
  }): Promise<any> {
    const gmCheck = this.validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    this.dataAccess.validateFoundryState();
    if (!Array.isArray(data?.actors) || data.actors.length === 0) {
      throw new Error('actors array is required and must contain at least one entry');
    }
    return this.dataAccess.createActors(data);
  }

  private async handleUpdateActors(data: {
    updates: Array<{
      id: string;
      name?: string;
      img?: string;
      system?: Record<string, any>;
    }>;
  }): Promise<any> {
    const gmCheck = this.validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    this.dataAccess.validateFoundryState();
    if (!Array.isArray(data?.updates) || data.updates.length === 0) {
      throw new Error('updates array is required');
    }
    return this.dataAccess.updateActors(data.updates);
  }

  private async handleDeleteActors(data: { ids: string[] }): Promise<any> {
    const gmCheck = this.validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    this.dataAccess.validateFoundryState();
    if (!Array.isArray(data?.ids) || data.ids.length === 0) {
      throw new Error('ids array is required');
    }
    return this.dataAccess.deleteActors(data.ids);
  }

  private async handleUpdateActorItems(data: {
    actorIdentifier: string;
    itemUpdates: Array<{ id: string; name?: string; img?: string; system?: Record<string, any> }>;
  }): Promise<any> {
    const gmCheck = this.validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    this.dataAccess.validateFoundryState();
    return this.dataAccess.updateActorItems(data.actorIdentifier, data.itemUpdates);
  }

  private async handleDeleteActorItems(data: {
    actorIdentifier: string;
    itemIds: string[];
  }): Promise<any> {
    const gmCheck = this.validateGMAccess();
    if (!gmCheck.allowed) return { error: 'Access denied', success: false };
    this.dataAccess.validateFoundryState();
    return this.dataAccess.deleteActorItems(data.actorIdentifier, data.itemIds);
  }
}
