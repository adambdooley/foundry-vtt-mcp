import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface TokenManipulationToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class TokenManipulationTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: TokenManipulationToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'TokenManipulationTools' });
  }

  /**
   * Tool definitions for token manipulation operations
   */
  getToolDefinitions() {
    return [
      {
        name: 'move-token',
        description: 'Move a token to a new position on the current scene. Can optionally animate the movement.',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The ID of the token to move',
            },
            x: {
              type: 'number',
              description: 'The new X coordinate (in pixels)',
            },
            y: {
              type: 'number',
              description: 'The new Y coordinate (in pixels)',
            },
            animate: {
              type: 'boolean',
              description: 'Whether to animate the movement (default: false)',
              default: false,
            },
          },
          required: ['tokenId', 'x', 'y'],
        },
      },
      {
        name: 'update-token',
        description: 'Update various properties of a token such as visibility, disposition, size, rotation, elevation, or name',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The ID of the token to update',
            },
            updates: {
              type: 'object',
              description: 'Object containing the properties to update',
              properties: {
                x: {
                  type: 'number',
                  description: 'New X coordinate',
                },
                y: {
                  type: 'number',
                  description: 'New Y coordinate',
                },
                width: {
                  type: 'number',
                  description: 'New width in grid units',
                },
                height: {
                  type: 'number',
                  description: 'New height in grid units',
                },
                rotation: {
                  type: 'number',
                  description: 'New rotation in degrees (0-360)',
                },
                hidden: {
                  type: 'boolean',
                  description: 'Whether the token is hidden from players',
                },
                disposition: {
                  type: 'number',
                  description: 'Token disposition: -1 (hostile), 0 (neutral), 1 (friendly)',
                  enum: [-1, 0, 1],
                },
                name: {
                  type: 'string',
                  description: 'New display name for the token',
                },
                elevation: {
                  type: 'number',
                  description: 'Elevation in distance units',
                },
                lockRotation: {
                  type: 'boolean',
                  description: 'Whether to lock the rotation',
                },
              },
            },
          },
          required: ['tokenId', 'updates'],
        },
      },
      {
        name: 'delete-tokens',
        description: 'Delete one or more tokens from the current scene',
        inputSchema: {
          type: 'object',
          properties: {
            tokenIds: {
              type: 'array',
              description: 'Array of token IDs to delete',
              items: {
                type: 'string',
              },
              minItems: 1,
            },
          },
          required: ['tokenIds'],
        },
      },
      {
        name: 'get-token-details',
        description: 'Get detailed information about a specific token including all properties and linked actor data',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The ID of the token to get details for',
            },
          },
          required: ['tokenId'],
        },
      },
      {
        name: 'toggle-token-condition',
        description: 'Toggle a status effect/condition on or off for a token. Use this to apply or remove conditions like Prone, Poisoned, Blinded, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The ID of the token to modify',
            },
            conditionId: {
              type: 'string',
              description: 'The ID of the condition/status effect to toggle (e.g., "prone", "poisoned", "blinded")',
            },
            active: {
              type: 'boolean',
              description: 'Optional: true to add the condition, false to remove it. If not specified, will toggle the current state.',
            },
          },
          required: ['tokenId', 'conditionId'],
        },
      },
      {
        name: 'get-available-conditions',
        description: 'Get a list of all available status effects/conditions that can be applied to tokens in the current game system',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  async handleMoveToken(args: any): Promise<any> {
    const schema = z.object({
      tokenId: z.string(),
      x: z.number(),
      y: z.number(),
      animate: z.boolean().optional().default(false),
    });

    const { tokenId, x, y, animate } = schema.parse(args);

    this.logger.info('Moving token', { tokenId, x, y, animate });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.moveToken', {
        tokenId,
        x,
        y,
        animate,
      });

      this.logger.debug('Token moved successfully', { tokenId });

      return {
        success: true,
        tokenId,
        newPosition: { x, y },
        animated: animate,
      };

    } catch (error) {
      this.logger.error('Failed to move token', error);
      throw new Error(`Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleUpdateToken(args: any): Promise<any> {
    const schema = z.object({
      tokenId: z.string(),
      updates: z.object({
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        rotation: z.number().min(0).max(360).optional(),
        hidden: z.boolean().optional(),
        disposition: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
        name: z.string().optional(),
        elevation: z.number().optional(),
        lockRotation: z.boolean().optional(),
      }),
    });

    const { tokenId, updates } = schema.parse(args);

    this.logger.info('Updating token', { tokenId, updates });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.updateToken', {
        tokenId,
        updates,
      });

      this.logger.debug('Token updated successfully', { tokenId, result });

      return {
        success: true,
        tokenId,
        updated: true,
        appliedUpdates: updates,
      };

    } catch (error) {
      this.logger.error('Failed to update token', error);
      throw new Error(`Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleDeleteTokens(args: any): Promise<any> {
    const schema = z.object({
      tokenIds: z.array(z.string()).min(1),
    });

    const { tokenIds } = schema.parse(args);

    this.logger.info('Deleting tokens', { count: tokenIds.length, tokenIds });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.deleteTokens', {
        tokenIds,
      });

      this.logger.debug('Tokens deleted successfully', {
        deleted: result.deletedCount,
        requested: tokenIds.length,
      });

      return {
        success: result.success,
        deletedCount: result.deletedCount,
        tokenIds: result.tokenIds,
        errors: result.errors,
      };

    } catch (error) {
      this.logger.error('Failed to delete tokens', error);
      throw new Error(`Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleGetTokenDetails(args: any): Promise<any> {
    const schema = z.object({
      tokenId: z.string(),
    });

    const { tokenId } = schema.parse(args);

    this.logger.info('Getting token details', { tokenId });

    try {
      const tokenData = await this.foundryClient.query('foundry-mcp-bridge.getTokenDetails', {
        tokenId,
      });

      this.logger.debug('Retrieved token details', { tokenId, hasActorData: !!tokenData.actorData });

      return this.formatTokenDetails(tokenData);

    } catch (error) {
      this.logger.error('Failed to get token details', error);
      throw new Error(`Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private formatTokenDetails(tokenData: any): any {
    return {
      id: tokenData.id,
      name: tokenData.name,
      position: {
        x: tokenData.x,
        y: tokenData.y,
      },
      size: {
        width: tokenData.width,
        height: tokenData.height,
      },
      appearance: {
        rotation: tokenData.rotation,
        scale: tokenData.scale,
        alpha: tokenData.alpha,
        hidden: tokenData.hidden,
        img: tokenData.img,
      },
      behavior: {
        disposition: this.getDispositionName(tokenData.disposition),
        elevation: tokenData.elevation,
        lockRotation: tokenData.lockRotation,
      },
      actor: tokenData.actorData ? {
        id: tokenData.actorId,
        name: tokenData.actorData.name,
        type: tokenData.actorData.type,
        img: tokenData.actorData.img,
        isLinked: tokenData.actorLink,
      } : null,
    };
  }

  private getDispositionName(disposition: number): string {
    switch (disposition) {
      case -1:
        return 'hostile';
      case 0:
        return 'neutral';
      case 1:
        return 'friendly';
      default:
        return 'unknown';
    }
  }

  async handleToggleTokenCondition(args: any): Promise<any> {
    const schema = z.object({
      tokenId: z.string(),
      conditionId: z.string(),
      active: z.boolean().optional(),
    });

    const { tokenId, conditionId, active } = schema.parse(args);

    this.logger.info('Toggling token condition', { tokenId, conditionId, active });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.toggleTokenCondition', {
        tokenId,
        conditionId,
        active,
      });

      this.logger.debug('Token condition toggled successfully', { tokenId, conditionId, result });

      return {
        success: true,
        tokenId,
        conditionId,
        isActive: result.isActive,
        conditionName: result.conditionName,
      };

    } catch (error) {
      this.logger.error('Failed to toggle token condition', error);
      throw new Error(`Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleGetAvailableConditions(args: any): Promise<any> {
    this.logger.info('Getting available conditions');

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.getAvailableConditions', {});

      this.logger.debug('Retrieved available conditions', { count: result.conditions?.length });

      return {
        success: true,
        conditions: result.conditions,
        gameSystem: result.gameSystem,
      };

    } catch (error) {
      this.logger.error('Failed to get available conditions', error);
      throw new Error(`Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
