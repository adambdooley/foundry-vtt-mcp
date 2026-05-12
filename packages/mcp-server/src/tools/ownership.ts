import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface OwnershipToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

// Foundry ownership permission levels
const OwnershipLevels = {
  NONE: 0,
  LIMITED: 1,
  OBSERVER: 2,
  OWNER: 3,
} as const;

const ownershipLevelSchema = z.enum(['NONE', 'LIMITED', 'OBSERVER', 'OWNER']);

export class OwnershipTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: OwnershipToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'OwnershipTools' });
  }

  /**
   * Get tool definitions for ownership management
   */
  getToolDefinitions() {
    return [
      {
        name: 'assign-actor-ownership',
        description:
          'Assign ownership permissions for actors to players. Supports individual assignments like "Assign Aragorn to John as owner" and bulk operations like "Give party observer access to all friendly NPCs".',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description:
                'Actor name, ID, or "all friendly NPCs" for bulk operations. Use "party characters" for all player-owned actors.',
            },
            playerIdentifier: {
              type: 'string',
              description:
                'Player name, character name, or "party" for all connected players. Supports partial matching.',
            },
            permissionLevel: {
              type: 'string',
              enum: ['NONE', 'LIMITED', 'OBSERVER', 'OWNER'],
              description:
                'Permission level to assign: NONE (no access), LIMITED (basic view), OBSERVER (full view, no control), OWNER (full control)',
            },
            confirmBulkOperation: {
              type: 'boolean',
              description:
                'Required confirmation for bulk operations affecting multiple actors/players',
              default: false,
            },
          },
          required: ['actorIdentifier', 'playerIdentifier', 'permissionLevel'],
        },
      },
      {
        name: 'remove-actor-ownership',
        description:
          'Remove ownership permissions (set to NONE) for specific actors and players. Equivalent to "Remove ownership of Aragorn from John".',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Actor name or ID to remove ownership from',
            },
            playerIdentifier: {
              type: 'string',
              description:
                'Player name or character name to remove ownership for. Supports partial matching.',
            },
            confirmRemoval: {
              type: 'boolean',
              description: 'Confirmation required for ownership removal',
              default: false,
            },
          },
          required: ['actorIdentifier', 'playerIdentifier'],
        },
      },
      {
        name: 'list-actor-ownership',
        description:
          'List current ownership permissions for actors, showing which players have what access levels.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Optional: specific actor name/ID to check, or "all" for all actors',
            },
            playerIdentifier: {
              type: 'string',
              description: 'Optional: specific player name to check ownership for',
            },
          },
        },
      },
    ];
  }

  /**
   * Handle tool execution
   */
  async handleToolCall(name: string, args: any) {
    try {
      switch (name) {
        case 'assign-actor-ownership':
          return await this.assignActorOwnership(args);
        case 'remove-actor-ownership':
          return await this.removeActorOwnership(args);
        case 'list-actor-ownership':
          return await this.listActorOwnership(args);
        default:
          throw new Error(`Unknown ownership tool: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Error in ownership tool ${name}:`, error);
      throw error;
    }
  }

  /**
   * Assign actor ownership permissions
   */
  private async assignActorOwnership(args: any) {
    const {
      actorIdentifier,
      playerIdentifier,
      permissionLevel,
      confirmBulkOperation = false,
    } = args;

    this.logger.info(
      `Assigning ${permissionLevel} ownership of "${actorIdentifier}" to "${playerIdentifier}"`
    );

    // Validate permission level
    const validatedLevel = ownershipLevelSchema.parse(permissionLevel);
    const numericLevel = OwnershipLevels[validatedLevel];

    // Resolve actors and players
    const actors = await this.resolveActors(actorIdentifier);
    const players = await this.resolvePlayers(playerIdentifier);

    // Check for bulk operations
    const isBulkOperation = actors.length > 1 || players.length > 1;
    if (isBulkOperation && !confirmBulkOperation) {
      return {
        success: false,
        error: `Bulk operation detected: ${actors.length} actors × ${players.length} players = ${actors.length * players.length} ownership changes. Please set confirmBulkOperation to true to proceed.`,
        actorsFound: actors.length,
        playersFound: players.length,
        totalChanges: actors.length * players.length,
      };
    }

    // Apply ownership changes
    const results = [];
    for (const actor of actors) {
      for (const player of players) {
        try {
          const result = await this.foundryClient.query('foundry-mcp-bridge.setActorOwnership', {
            actorId: actor.id,
            userId: player.id,
            permission: numericLevel,
          });

          results.push({
            actor: actor.name,
            player: player.name,
            permission: validatedLevel,
            success: result.success,
            message: result.message,
            error: result.error,
          });
        } catch (error) {
          results.push({
            actor: actor.name,
            player: player.name,
            permission: validatedLevel,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return {
      success: successCount > 0,
      message: `${successCount} ownership assignments completed${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
      results,
    };
  }

  /**
   * Remove actor ownership (set to NONE)
   */
  private async removeActorOwnership(args: any) {
    const { actorIdentifier, playerIdentifier, confirmRemoval = false } = args;

    if (!confirmRemoval) {
      return {
        success: false,
        error: 'Please set confirmRemoval to true to confirm ownership removal',
      };
    }

    // Use assign with NONE permission level
    return await this.assignActorOwnership({
      actorIdentifier,
      playerIdentifier,
      permissionLevel: 'NONE',
      confirmBulkOperation: true, // Auto-confirm since user already confirmed removal
    });
  }

  /**
   * List actor ownership permissions
   */
  private async listActorOwnership(args: any) {
    const { actorIdentifier, playerIdentifier } = args;

    this.logger.info(
      `Listing actor ownership for actor: "${actorIdentifier || 'all'}", player: "${playerIdentifier || 'all'}"`
    );

    try {
      const ownershipData = await this.foundryClient.query('foundry-mcp-bridge.getActorOwnership', {
        actorIdentifier,
        playerIdentifier,
      });

      return {
        success: true,
        ownership: ownershipData,
      };
    } catch (error) {
      this.logger.error('Failed to list actor ownership:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resolve actors from identifier (supports bulk operations)
   */
  private async resolveActors(identifier: string): Promise<Array<{ id: string; name: string }>> {
    this.logger.debug(`Resolving actors for identifier: ${identifier}`);

    try {
      if (identifier.toLowerCase().includes('all friendly npcs')) {
        // Get all tokens in current scene with friendly disposition
        const actors = await this.foundryClient.query('foundry-mcp-bridge.getFriendlyNPCs', {});
        this.logger.debug(`Found ${actors.length} friendly NPCs`);
        return actors;
      } else if (identifier.toLowerCase().includes('party characters')) {
        // Get all player-owned characters
        const actors = await this.foundryClient.query('foundry-mcp-bridge.getPartyCharacters', {});
        this.logger.debug(`Found ${actors.length} party characters`);
        return actors;
      } else {
        // Single actor lookup
        this.logger.debug(`Looking for single actor: ${identifier}`);
        const actor = await this.foundryClient.query('foundry-mcp-bridge.findActor', {
          identifier,
        });
        this.logger.debug(`Single actor lookup result:`, actor);
        return actor ? [actor] : [];
      }
    } catch (error) {
      this.logger.error(`Failed to resolve actors for "${identifier}":`, error);
      return [];
    }
  }

  /**
   * Resolve players from identifier (supports partial matching)
   */
  private async resolvePlayers(identifier: string): Promise<Array<{ id: string; name: string }>> {
    this.logger.debug(`Resolving players for identifier: ${identifier}`);

    try {
      if (identifier.toLowerCase() === 'party') {
        // Get all connected players (excluding GM)
        const players = await this.foundryClient.query(
          'foundry-mcp-bridge.getConnectedPlayers',
          {}
        );
        this.logger.debug(`Found ${players.length} connected players`);
        return players;
      } else {
        // Single player lookup with partial matching
        this.logger.debug(`Looking for single player: ${identifier}`);
        const players = await this.foundryClient.query('foundry-mcp-bridge.findPlayers', {
          identifier,
          allowPartialMatch: true,
          includeCharacterOwners: true, // Also match by character names they own
        });
        this.logger.debug(`Player lookup result:`, players);
        return players;
      }
    } catch (error) {
      this.logger.error(`Failed to resolve players for "${identifier}":`, error);
      return [];
    }
  }
}
