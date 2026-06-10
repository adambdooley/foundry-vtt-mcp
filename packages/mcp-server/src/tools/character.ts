import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import { SystemRegistry } from '../systems/system-registry.js';
import { detectGameSystem, getCachedSystemId, type GameSystem } from '../utils/system-detection.js';
import type { SystemAdapter } from '../systems/types.js';

export interface CharacterToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry?: SystemRegistry;
}

export class CharacterTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private systemRegistry: SystemRegistry | null;
  private cachedGameSystem: GameSystem | null = null;

  constructor({ foundryClient, logger, systemRegistry }: CharacterToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CharacterTools' });
    this.systemRegistry = systemRegistry || null;
  }

  /**
   * Get or detect the game system (cached)
   */
  private async getGameSystem(): Promise<GameSystem> {
    if (!this.cachedGameSystem) {
      this.cachedGameSystem = await detectGameSystem(this.foundryClient, this.logger);
    }
    return this.cachedGameSystem;
  }

  /**
   * Resolve the active SystemAdapter, if any. Looks up by the raw
   * Foundry system id first (so adapters whose id isn't part of the
   * narrow `GameSystem` enum — e.g. 'dsa5', 'cosmere-rpg' — still
   * resolve), then falls back to the normalised GameSystem.
   */
  private async getAdapter(): Promise<SystemAdapter | null> {
    if (!this.systemRegistry) return null;
    // Ensure detection has populated the cached id (it's set as a side
    // effect of detectGameSystem, which getGameSystem wraps).
    await this.getGameSystem();
    const rawId = getCachedSystemId();
    if (rawId) {
      const byRaw = this.systemRegistry.getAdapter(rawId);
      if (byRaw) return byRaw;
    }
    return this.systemRegistry.getAdapter(this.cachedGameSystem ?? 'other');
  }

  /**
   * Tool: get-character
   * Retrieve detailed information about a specific character
   */
  getToolDefinitions() {
    return [
      {
        name: 'get-character',
        description:
          'Retrieve character information optimized for minimal token usage. Returns: full stats (abilities, skills, saves, AC, HP), action names, active effects/conditions (name only), and ALL items with minimal metadata (name, type, equipped status) without descriptions. PF2e-specific: includes traits arrays for items/actions, action costs, rarity, and level. D&D 5e-specific: includes attunement status. Perfect for filtering (e.g., "deviant" trait feats, "fire" trait spells in PF2e), checking equipment, or identifying what to investigate further. Use get-character-entity to fetch full details for specific items, actions, spells, or effects.',
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              description: 'Character name or ID to look up',
            },
          },
          required: ['identifier'],
        },
      },
      {
        name: 'get-character-entity',
        description:
          'Retrieve full details for a specific entity from a character. Works for items (feats, equipment, spells), actions (strikes, special abilities), or effects/conditions. Returns complete description and all system data. Use this after get-character when you need detailed information about a specific entity.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            entityIdentifier: {
              type: 'string',
              description:
                'Entity name or ID (can be item ID, action name, spell name, or effect name)',
            },
          },
          required: ['characterIdentifier', 'entityIdentifier'],
        },
      },
      {
        name: 'list-characters',
        description: 'List all available characters with basic information',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Optional filter by character type (e.g., "character", "npc")',
            },
          },
        },
      },
      {
        name: 'use-item',
        description:
          'Use an item on a character (cast spell, use ability, activate feature, consume item). Opens the item dialog in Foundry VTT for the GM to configure options and confirm. Optionally specify targets by name. Returns immediately with status "initiated" - tell the user to check Foundry for any dialogs. Works across systems: D&D 5e, PF2e, DSA5. Use get-character or search-character-items first to see available items/spells.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character using the item (name or ID)',
            },
            itemIdentifier: {
              type: 'string',
              description: 'Item name or ID (spell, feat, equipment, consumable, etc.)',
            },
            targets: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Target character/token names or IDs. Use ["self"] to target the caster. If omitted, GM selects targets in Foundry.',
            },
            consume: {
              type: 'boolean',
              description: 'Whether to consume charges/uses (default: true)',
            },
            spellLevel: {
              type: 'number',
              description: 'For spells: cast at a higher level than base (D&D 5e upcasting)',
            },
          },
          required: ['actorIdentifier', 'itemIdentifier'],
        },
      },
      {
        name: 'manage-world-items',
        description:
          'Manage Item documents in Foundry VTT. Specify the operation with "action":\n' +
          '- "create": Create world-level Items in the sidebar (not actor-attached). Good for reusable libraries. GM-only.\n' +
          '- "list": List world-level Items with optional type/folder/name filters.\n' +
          '- "update": Update existing world-level Items by ID. GM-only.\n' +
          '- "add-to-actor": Create and attach Items directly to an existing actor. GM-only.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'list', 'update', 'add-to-actor'],
              description:
                'Operation to perform: "create" world items, "list" world items, "update" world items by id, or "add-to-actor" to attach items to an actor.',
            },
            items: {
              type: 'array',
              minItems: 1,
              description:
                'Required for "create" and "add-to-actor". One or more items to create. Each item requires a name and a type valid for the active game system (e.g. "action", "talent", "weapon"). For Cosmere RPG add-to-actor, pass system-specific data via the "system" field.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Display name of the item' },
                  type: {
                    type: 'string',
                    description: 'Item type valid for the active system (e.g. "action", "talent", "weapon")',
                  },
                  img: {
                    type: 'string',
                    description: 'Optional icon path (e.g. "icons/svg/explosion.svg")',
                  },
                  system: {
                    type: 'object',
                    description: 'System-specific data (free-form). Passed through to Foundry\'s DataModel layer.',
                    additionalProperties: true,
                  },
                },
                required: ['name', 'type'],
              },
            },
            updates: {
              type: 'array',
              minItems: 1,
              description:
                'Required for "update". One or more item patches. Each entry must include "id" plus at least one field to change (name, img, system, folder).',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'ID of the world Item to update' },
                  name: { type: 'string', description: 'New display name' },
                  img: { type: 'string', description: 'New icon path' },
                  system: {
                    type: 'object',
                    description: 'System-specific fields to update (merged into existing system data)',
                    additionalProperties: true,
                  },
                  folder: {
                    type: 'string',
                    description: 'Move item into this folder (name or ID). Created if absent.',
                  },
                },
                required: ['id'],
              },
            },
            folder: {
              type: 'string',
              description:
                'For "create": folder name/ID to place items in (created if absent). For "list": filter to items inside this folder.',
            },
            type: {
              type: 'string',
              description: 'For "list": filter by item type (e.g. "action", "talent"). Omit to return all types.',
            },
            nameFilter: {
              type: 'string',
              description: 'For "list": case-insensitive substring match on item name.',
            },
            actorIdentifier: {
              type: 'string',
              description: 'For "add-to-actor": actor name or ID to receive the items.',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'search-character-items',
        description:
          "Search within a character's items, spells, actions, and effects. More token-efficient than get-character when you need specific items. Supports text search (name/description) and type filtering. Returns matching items with full details including targeting info for spells. Use this to find specific spells, equipment, feats, or abilities without loading the entire character.",
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID to search within',
            },
            query: {
              type: 'string',
              description:
                'Text to search for in item names and descriptions (case-insensitive). Leave empty to return all items of specified type.',
            },
            type: {
              type: 'string',
              description:
                'Filter by item type: "spell", "weapon", "armor", "equipment", "consumable", "feat", "feature", "action", "effect", or system-specific types. Leave empty to search all types.',
            },
            category: {
              type: 'string',
              description:
                'Additional category filter. For spells: "cantrip", "prepared", "innate", "focus". For items: "equipped", "carried", "invested".',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 20)',
            },
          },
          required: ['characterIdentifier'],
        },
      },
    ];
  }

  async handleGetCharacter(args: any): Promise<any> {
    const schema = z.object({
      identifier: z.string().min(1, 'Character identifier cannot be empty'),
    });

    const { identifier } = schema.parse(args);

    this.logger.info('Getting character information', { identifier });

    try {
      const characterData = await this.foundryClient.query('foundry-mcp-bridge.getCharacterInfo', {
        characterName: identifier,
      });

      this.logger.debug('Successfully retrieved character data', {
        characterId: characterData.id,
        characterName: characterData.name,
      });

      // Format the response for Claude
      return await this.formatCharacterResponse(characterData);
    } catch (error) {
      this.logger.error('Failed to get character information', error);
      throw new Error(
        `Failed to retrieve character "${identifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetCharacterEntity(args: any): Promise<any> {
    const schema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      entityIdentifier: z.string().min(1, 'Entity identifier cannot be empty'),
    });

    const { characterIdentifier, entityIdentifier } = schema.parse(args);

    this.logger.info('Getting character entity', { characterIdentifier, entityIdentifier });

    try {
      // First get the character
      const characterData = await this.foundryClient.query('foundry-mcp-bridge.getCharacterInfo', {
        characterName: characterIdentifier,
      });

      // Try to find the entity in different collections
      let entity = null;
      let entityType = null;

      // 1. Try to find as an item (by ID or name)
      entity = characterData.items?.find(
        (i: any) =>
          i.id === entityIdentifier || i.name.toLowerCase() === entityIdentifier.toLowerCase()
      );
      if (entity) {
        entityType = 'item';
      }

      // 2. Try to find as an action (by name)
      if (!entity && characterData.actions) {
        entity = characterData.actions.find(
          (a: any) => a.name.toLowerCase() === entityIdentifier.toLowerCase()
        );
        if (entity) {
          entityType = 'action';
        }
      }

      // 3. Try to find as an effect (by name)
      if (!entity && characterData.effects) {
        entity = characterData.effects.find(
          (e: any) => e.name.toLowerCase() === entityIdentifier.toLowerCase()
        );
        if (entity) {
          entityType = 'effect';
        }
      }

      if (!entity) {
        throw new Error(
          `Entity "${entityIdentifier}" not found on character "${characterIdentifier}". Tried items, actions, and effects.`
        );
      }

      this.logger.debug('Successfully retrieved entity', {
        entityType,
        entityName: entity.name,
      });

      // Return full entity details based on type
      if (entityType === 'item') {
        return {
          entityType: 'item',
          id: entity.id,
          name: entity.name,
          type: entity.type,
          description: entity.system?.description?.value || entity.system?.description || '',
          traits: entity.system?.traits?.value || [],
          rarity: entity.system?.traits?.rarity || 'common',
          level: entity.system?.level?.value ?? entity.system?.level,
          actionType: entity.system?.actionType?.value,
          actions: entity.system?.actions?.value,
          quantity: entity.system?.quantity || 1,
          equipped: entity.system?.equipped,
          attunement: entity.system?.attunement,
          hasImage: !!entity.img,
          // Include full system data for advanced use cases
          system: entity.system,
        };
      } else if (entityType === 'action') {
        return {
          entityType: 'action',
          name: entity.name,
          type: entity.type,
          itemId: entity.itemId,
          traits: entity.traits || [],
          variants: entity.variants || [],
          ready: entity.ready,
          description: entity.description || 'Action from character strikes/abilities',
        };
      } else if (entityType === 'effect') {
        return {
          entityType: 'effect',
          id: entity.id,
          name: entity.name,
          description: entity.description || entity.name,
          traits: entity.traits || [],
          duration: entity.duration,
          // Include full effect data
          ...entity,
        };
      }

      return entity;
    } catch (error) {
      this.logger.error('Failed to get character entity', error);
      throw new Error(
        `Failed to retrieve entity "${entityIdentifier}" from character "${characterIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListCharacters(args: any): Promise<any> {
    const schema = z.object({
      type: z.string().optional(),
    });

    const { type } = schema.parse(args);

    this.logger.info('Listing characters', { type });

    try {
      const actors = await this.foundryClient.query('foundry-mcp-bridge.listActors', { type });

      this.logger.debug('Successfully retrieved character list', { count: actors.length });

      // Format the response for Claude
      return {
        characters: actors.map((actor: any) => ({
          id: actor.id,
          name: actor.name,
          type: actor.type,
          hasImage: !!actor.img,
        })),
        total: actors.length,
        filtered: type ? `Filtered by type: ${type}` : 'All characters',
      };
    } catch (error) {
      this.logger.error('Failed to list characters', error);
      throw new Error(
        `Failed to list characters: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUseItem(args: any): Promise<any> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      itemIdentifier: z.string().min(1, 'Item identifier cannot be empty'),
      targets: z.array(z.string()).optional(),
      consume: z.boolean().optional(),
      spellLevel: z.number().optional(),
      skipDialog: z.boolean().optional(),
    });

    const { actorIdentifier, itemIdentifier, targets, consume, spellLevel, skipDialog } =
      schema.parse(args);

    this.logger.info('Using item', {
      actorIdentifier,
      itemIdentifier,
      targets,
      consume,
      spellLevel,
      skipDialog,
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.useItem', {
        actorIdentifier,
        itemIdentifier,
        targets,
        options: {
          consume: consume ?? true,
          spellLevel,
          skipDialog: skipDialog ?? true, // Default to skipping dialogs for MCP automation
        },
      });

      this.logger.debug('Successfully used item', {
        actorName: result.actorName,
        itemName: result.itemName,
        targets: result.targets,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to use item', error);
      throw new Error(
        `Failed to use item "${itemIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleAddActorItems(args: any): Promise<any> {
    const itemSchema = z.object({
      name: z.string().min(1, 'Item name cannot be empty'),
      type: z.string().min(1, 'Item type cannot be empty'),
      img: z.string().optional(),
      system: z.record(z.any()).optional(),
    });

    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      items: z.array(itemSchema).min(1, 'At least one item is required'),
    });

    const { actorIdentifier, items } = schema.parse(args);

    this.logger.info('Adding items to actor', {
      actorIdentifier,
      count: items.length,
      types: items.map(i => i.type),
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.addActorItems', {
        actorIdentifier,
        items,
      });

      this.logger.debug('Successfully added actor items', {
        actorName: result.actorName,
        created: result.created?.length ?? 0,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to add actor items', error);
      throw new Error(
        `Failed to add items to "${actorIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateWorldItems(args: any): Promise<any> {
    const updateEntrySchema = z.object({
      id: z.string().min(1, 'Item id cannot be empty'),
      name: z.string().optional(),
      img: z.string().optional(),
      system: z.record(z.any()).optional(),
      folder: z.string().optional(),
    });

    const schema = z.object({
      updates: z.array(updateEntrySchema).min(1, 'At least one update entry is required'),
    });

    const { updates } = schema.parse(args);

    this.logger.info('Updating world items', {
      count: updates.length,
      ids: updates.map(u => u.id),
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.updateWorldItems', { updates });

      this.logger.debug('Successfully updated world items', { count: result.updated?.length ?? 0 });

      return result;

    } catch (error) {
      this.logger.error('Failed to update world items', error);
      throw new Error(`Failed to update world items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleListWorldItems(args: any): Promise<any> {
    const schema = z.object({
      type: z.string().optional(),
      folder: z.string().optional(),
      nameFilter: z.string().optional(),
    });

    const { type, folder, nameFilter } = schema.parse(args);

    this.logger.info('Listing world items', { type: type ?? null, folder: folder ?? null, nameFilter: nameFilter ?? null });

    try {
      const items = await this.foundryClient.query('foundry-mcp-bridge.listWorldItems', {
        ...(type !== undefined ? { type } : {}),
        ...(folder !== undefined ? { folder } : {}),
        ...(nameFilter !== undefined ? { nameFilter } : {}),
      });

      this.logger.debug('Successfully listed world items', { count: items?.length ?? 0 });

      return {
        items: items ?? [],
        total: items?.length ?? 0,
      };

    } catch (error) {
      this.logger.error('Failed to list world items', error);
      throw new Error(`Failed to list world items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleCreateWorldItems(args: any): Promise<any> {
    const itemSchema = z.object({
      name: z.string().min(1, 'Item name cannot be empty'),
      type: z.string().min(1, 'Item type cannot be empty'),
      img: z.string().optional(),
      system: z.record(z.any()).optional(),
      effects: z.array(z.record(z.any())).optional(),
      flags: z.record(z.any()).optional(),
    });

    const schema = z.object({
      items: z.array(itemSchema).min(1, 'At least one item is required'),
      folder: z.string().optional(),
    });

    const { items, folder } = schema.parse(args);

    this.logger.info('Creating world items', {
      count: items.length,
      folder: folder ?? null,
      types: items.map(i => i.type),
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.createWorldItems', {
        items,
        folder,
      });

      this.logger.debug('Successfully created world items', {
        folderId: result.folderId,
        created: result.created?.length ?? 0,
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to create world items', error);
      throw new Error(`Failed to create world items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleManageWorldItems(args: any): Promise<any> {
    const { action } = z.object({ action: z.enum(['create', 'list', 'update', 'add-to-actor']) }).parse(args);

    switch (action) {
      case 'create':
        return this.handleCreateWorldItems(args);
      case 'list':
        return this.handleListWorldItems(args);
      case 'update':
        return this.handleUpdateWorldItems(args);
      case 'add-to-actor':
        return this.handleAddActorItems(args);
    }
  }

  async handleSearchCharacterItems(args: any): Promise<any> {
    const schema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      query: z.string().optional(),
      type: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().optional(),
    });

    const { characterIdentifier, query, type, category, limit } = schema.parse(args);

    this.logger.info('Searching character items', {
      characterIdentifier,
      query,
      type,
      category,
      limit,
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.searchCharacterItems', {
        characterIdentifier,
        query,
        type,
        category,
        limit: limit ?? 20,
      });

      this.logger.debug('Successfully searched character items', {
        characterName: result.characterName,
        matchCount: result.matches?.length || 0,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to search character items', error);
      throw new Error(
        `Failed to search items for "${characterIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async formatCharacterResponse(characterData: any): Promise<any> {
    const response: any = {
      id: characterData.id,
      name: characterData.name,
      type: characterData.type,
      basicInfo: await this.extractBasicInfo(characterData),
      stats: await this.extractStats(characterData),
      items: this.formatItems(characterData.items || []),
      effects: this.formatEffects(characterData.effects || []),
      hasImage: !!characterData.img,
    };

    // Add actions with minimal data (name, traits, action cost only - no variants)
    if (characterData.actions && characterData.actions.length > 0) {
      response.actions = this.formatActions(characterData.actions);
    }

    // Add spellcasting data with spell lists
    if (characterData.spellcasting && characterData.spellcasting.length > 0) {
      response.spellcasting = this.formatSpellcasting(characterData.spellcasting);
    }

    // Exclude itemVariants and itemToggles - these are verbose and can be fetched via get-character-entity if needed

    return response;
  }

  private formatSpellcasting(spellcastingEntries: any[]): any[] {
    return spellcastingEntries.map(entry => {
      const formatted: any = {
        name: entry.name,
        type: entry.type,
      };

      // Include tradition for PF2e (arcane, divine, primal, occult)
      if (entry.tradition) {
        formatted.tradition = entry.tradition;
      }

      // Include spellcasting ability
      if (entry.ability) {
        formatted.ability = entry.ability;
      }

      // Include DC and attack bonus
      if (entry.dc) {
        formatted.dc = entry.dc;
      }
      if (entry.attack) {
        formatted.attack = entry.attack;
      }

      // Include spell slots if available
      if (entry.slots && Object.keys(entry.slots).length > 0) {
        formatted.slots = entry.slots;
      }

      // Format spells - minimal data for browsing, use get-character-entity for full details
      if (entry.spells && entry.spells.length > 0) {
        formatted.spells = entry.spells.map((spell: any) => {
          const spellData: any = {
            id: spell.id,
            name: spell.name,
            level: spell.level,
          };

          // Only include prepared status if it's false (assumed prepared by default)
          if (spell.prepared === false) {
            spellData.prepared = false;
          }

          // Include expended status if spell slot has been used
          if (spell.expended) {
            spellData.expended = true;
          }

          // Include traits for PF2e spells (for filtering by damage type, etc.)
          if (spell.traits && spell.traits.length > 0) {
            spellData.traits = spell.traits;
          }

          // Include action cost
          if (spell.actionCost) {
            spellData.actionCost = spell.actionCost;
          }

          // Include targeting info - helps Claude decide whether to specify targets
          if (spell.range) {
            spellData.range = spell.range;
          }
          if (spell.target) {
            spellData.target = spell.target;
          }
          if (spell.area) {
            spellData.area = spell.area;
          }

          return spellData;
        });

        formatted.spellCount = entry.spells.length;
      }

      return formatted;
    });
  }

  private formatActions(actions: any[]): any[] {
    // Return minimal action data - just enough to identify and filter
    return actions.map(action => {
      const formatted: any = {
        name: action.name,
        type: action.type,
      };

      // Include traits if present (for filtering, e.g., "fire" attacks, "concentrate" actions)
      if (action.traits && action.traits.length > 0) {
        formatted.traits = action.traits;
      }

      // Include action cost (e.g., 1, 2, 3 actions, reaction, free)
      if (action.actions !== undefined) {
        formatted.actionCost = action.actions;
      }

      // Include itemId for cross-referencing with items
      if (action.itemId) {
        formatted.itemId = action.itemId;
      }

      return formatted;
    });
  }

  private async extractBasicInfo(characterData: any): Promise<any> {
    // Extract common fields that exist across different game systems
    const basicInfo: any = {};

    // Let the active SystemAdapter (if it exposes extractBasicInfo) seed
    // system-specific fields first. Anything it returns wins; the legacy
    // cross-system extractor below only fills gaps.
    try {
      const adapter = await this.getAdapter();
      if (adapter && typeof adapter.extractBasicInfo === 'function') {
        const fromAdapter = adapter.extractBasicInfo(characterData);
        if (fromAdapter && typeof fromAdapter === 'object') {
          Object.assign(basicInfo, fromAdapter);
        }
      }
    } catch (error) {
      this.logger.warn('System adapter extractBasicInfo failed; falling back to legacy', { error });
    }

    const system = characterData.system || {};

    // D&D 5e / PF2e common fields (only fill if adapter didn't already)
    if (system.attributes) {
      if (system.attributes.hp && basicInfo.hitPoints === undefined) {
        basicInfo.hitPoints = {
          current: system.attributes.hp.value,
          max: system.attributes.hp.max,
          temp: system.attributes.hp.temp || 0,
        };
      }
      if (system.attributes.ac && basicInfo.armorClass === undefined) {
        basicInfo.armorClass = system.attributes.ac.value;
      }
    }

    // Level information (only if adapter didn't set it)
    if (basicInfo.level === undefined) {
      if (system.details?.level?.value) {
        basicInfo.level = system.details.level.value;
      } else if (typeof system.level === 'number') {
        basicInfo.level = system.level;
      }
    }

    // Class information
    if (system.details?.class) {
      basicInfo.class = system.details.class;
    }

    // Race/ancestry information
    // dnd5e 4.x+ stores race as an embedded item document; collapse to just the
    // identifying name to avoid dumping the full item (HTML description, advancement,
    // circular refs). Older data may store a plain string, which we pass through.
    if (system.details?.race) {
      const race = system.details.race;
      basicInfo.race =
        typeof race === 'string' ? race : race.name || race.identifier || race._id || 'Unknown';
    } else if (system.details?.ancestry) {
      const ancestry = system.details.ancestry;
      basicInfo.ancestry =
        typeof ancestry === 'string'
          ? ancestry
          : ancestry.name || ancestry.identifier || ancestry._id || 'Unknown';
    }

    return basicInfo;
  }

  private async extractStats(characterData: any): Promise<any> {
    // Try using system adapter if available. Lookup uses the raw Foundry
    // system id first so adapters whose id isn't part of the narrow
    // GameSystem enum (e.g. 'dsa5', 'cosmere-rpg') resolve correctly.
    try {
      const adapter = await this.getAdapter();
      if (adapter) {
        this.logger.debug('Using system adapter for character stats extraction', {
          system: adapter.getMetadata().id,
        });
        return adapter.extractCharacterStats(characterData);
      }
    } catch (error) {
      this.logger.warn('Failed to use system adapter, falling back to legacy extraction', {
        error,
      });
    }

    // Legacy extraction (backwards compatibility)
    const system = characterData.system || {};
    const stats: any = {};

    // Ability scores (D&D 5e style)
    if (system.abilities) {
      stats.abilities = {};
      for (const [key, ability] of Object.entries(system.abilities)) {
        if (typeof ability === 'object' && ability !== null) {
          stats.abilities[key] = {
            score: (ability as any).value || 10,
            modifier: (ability as any).mod || 0,
          };
        }
      }
    }

    // Skills
    if (system.skills) {
      stats.skills = {};
      for (const [key, skill] of Object.entries(system.skills)) {
        if (typeof skill === 'object' && skill !== null) {
          stats.skills[key] = {
            value: (skill as any).value || 0,
            proficient: (skill as any).proficient || false,
            ability: (skill as any).ability || '',
          };
        }
      }
    }

    // Saves
    if (system.saves) {
      stats.saves = {};
      for (const [key, save] of Object.entries(system.saves)) {
        if (typeof save === 'object' && save !== null) {
          stats.saves[key] = {
            value: (save as any).value || 0,
            proficient: (save as any).proficient || false,
          };
        }
      }
    }

    return stats;
  }

  private formatItems(items: any[]): any[] {
    // Return ALL items with minimal data
    return items.map(item => {
      // Return minimal data - just enough to identify and filter items
      const formattedItem: any = {
        id: item.id,
        name: item.name,
        type: item.type,
      };

      // Include quantity if present
      if (item.system?.quantity !== undefined && item.system.quantity !== 1) {
        formattedItem.quantity = item.system.quantity;
      }

      // Include traits for PF2e items (feats, equipment, spells, etc.)
      if (item.system?.traits?.value) {
        formattedItem.traits = Array.isArray(item.system.traits.value)
          ? item.system.traits.value
          : [];
      }

      // Include rarity for PF2e items
      if (item.system?.traits?.rarity) {
        formattedItem.rarity = item.system.traits.rarity;
      }

      // Include level for PF2e items (feats, spells, etc.)
      if (item.system?.level?.value !== undefined) {
        formattedItem.level = item.system.level.value;
      } else if (item.system?.level !== undefined) {
        formattedItem.level = item.system.level;
      }

      // Include action cost for PF2e feats/actions
      if (item.system?.actionType?.value) {
        formattedItem.actionType = item.system.actionType.value;
      }

      // Include equipped status for equippable items
      if (item.system?.equipped !== undefined) {
        formattedItem.equipped = item.system.equipped;
      }

      // Include attuned status for D&D 5e magic items
      if (item.system?.attunement !== undefined) {
        formattedItem.attunement = item.system.attunement;
      }

      return formattedItem;
    });
  }

  private formatEffects(effects: any[]): any[] {
    return effects.map(effect => ({
      id: effect.id,
      name: effect.name,
      disabled: effect.disabled,
      duration: effect.duration
        ? {
            type: effect.duration.type,
            remaining: effect.duration.remaining,
          }
        : null,
      hasIcon: !!effect.icon,
    }));
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }
}
