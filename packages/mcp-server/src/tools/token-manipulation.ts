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
        description:
          'Move a token to a new position on the current scene. Can optionally animate the movement.',
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
        description:
          'Update various properties of a token such as visibility, disposition, size, rotation, elevation, or name',
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
        description:
          'Inspect a token, an actor, or the whole combat. Provide exactly one of "tokenId", "actor", or "all".\n' +
          '- "tokenId": Token document detail — position, size, appearance, disposition, and linked actor data.\n' +
          '- "actor": Tactical state of one actor (combat not required) — HP, active conditions and effects\n' +
          '  with remaining durations, initiative, and whose turn it is; plus AC, movement, spell slots,\n' +
          '  and consumables where the game system exposes them.\n' +
          '- "all": The same tactical state for every combatant in the active combat, plus round and turn.\n' +
          '  Requires an active combat. Use this as the sensor read before deciding an action.',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description:
                'The ID of the token to get document details for. Mutually exclusive with "actor" and "all".',
            },
            actor: {
              type: 'string',
              description:
                'Single actor to inspect for tactical state: token ID, token name, actor ID, or actor name. Mutually exclusive with "tokenId" and "all".',
            },
            all: {
              type: 'boolean',
              description:
                'If true, return tactical state for every combatant in the active combat plus round/turn info. Mutually exclusive with "tokenId" and "actor".',
            },
          },
        },
      },
      {
        name: 'toggle-token-condition',
        description:
          'Apply or remove conditions and active effects on a token or actor.\n' +
          '- "toggle" (default): Turn a system status effect on or off — Prone, Poisoned, Blinded, etc.\n' +
          '  Omit "active" to flip the current state.\n' +
          '- "apply-effect": Apply a custom active effect with attribute changes (via active-effect change\n' +
          '  keys) and round/turn/second durations that expire with combat tracking.\n' +
          '- "remove-effect": Remove a condition or effect by effect label (case-insensitive) or status\n' +
          '  effect ID. Returns what was removed.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['toggle', 'apply-effect', 'remove-effect'],
              description:
                'Operation to perform (default: "toggle"). Use "apply-effect" / "remove-effect" for custom active effects.',
            },
            tokenId: {
              type: 'string',
              description:
                'The token or actor to modify: token ID, token name, actor ID, or actor name. (Plain token IDs are required for "toggle".)',
            },
            conditionId: {
              type: 'string',
              description:
                'Required for "toggle". The ID of the condition/status effect to toggle (e.g., "prone", "poisoned", "blinded")',
            },
            active: {
              type: 'boolean',
              description:
                'For "toggle": true to add the condition, false to remove it. If not specified, will toggle the current state.',
            },
            effect: {
              type: 'object',
              description:
                'Required for "apply-effect". Custom active effect definition. For "remove-effect", pass "effectName" instead.',
              properties: {
                label: { type: 'string', description: 'Display name of the effect' },
                icon: {
                  type: 'string',
                  description: 'Icon image path (default: "icons/svg/aura.svg")',
                },
                changes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      key: {
                        type: 'string',
                        description: 'Attribute key to modify, e.g. "system.attributes.ac.bonus"',
                      },
                      mode: {
                        type: 'number',
                        description: 'Active effect mode (default: 2 = ADD)',
                      },
                      value: { description: 'Change value (string or number)' },
                    },
                    required: ['key', 'value'],
                  },
                  description: 'Attribute changes applied while the effect is active',
                },
                duration: {
                  type: 'object',
                  properties: {
                    rounds: { type: 'number', description: 'Duration in combat rounds' },
                    turns: { type: 'number', description: 'Duration in combat turns' },
                    seconds: { type: 'number', description: 'Duration in world-time seconds' },
                  },
                  description: 'Effect duration; omit for indefinite',
                },
              },
              required: ['label'],
            },
            effectName: {
              type: 'string',
              description:
                'Required for "remove-effect". Effect label (case-insensitive) or status effect ID to remove.',
            },
          },
          required: ['tokenId'],
        },
      },
      {
        name: 'get-available-conditions',
        description:
          'Get a list of all available status effects/conditions that can be applied to tokens in the current game system',
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
      const result = await this.foundryClient.query('foundry-mcp-bridge.move-token', {
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
      throw new Error(
        `Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      const result = await this.foundryClient.query('foundry-mcp-bridge.update-token', {
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
      throw new Error(
        `Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleDeleteTokens(args: any): Promise<any> {
    const schema = z.object({
      tokenIds: z.array(z.string()).min(1),
    });

    const { tokenIds } = schema.parse(args);

    this.logger.info('Deleting tokens', { count: tokenIds.length, tokenIds });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.delete-tokens', {
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
      throw new Error(
        `Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetTokenDetails(args: any): Promise<any> {
    const schema = z
      .object({
        tokenId: z.string().min(1).optional(),
        actor: z.string().min(1).optional(),
        all: z.boolean().optional(),
      })
      .refine(
        data =>
          [data.tokenId !== undefined, data.actor !== undefined, data.all === true].filter(Boolean)
            .length === 1,
        { message: 'Provide exactly one of "tokenId", "actor", or "all: true"' }
      );

    const parsed = schema.parse(args ?? {});

    // "actor" / "all" read tactical combat state; "tokenId" reads the token document.
    if (parsed.tokenId === undefined) {
      return this.handleGetCombatantStatus(parsed);
    }

    const tokenId = parsed.tokenId;

    this.logger.info('Getting token details', { tokenId });

    try {
      const tokenData = await this.foundryClient.query('foundry-mcp-bridge.get-token-details', {
        tokenId,
      });

      this.logger.debug('Retrieved token details', {
        tokenId,
        hasActorData: !!tokenData.actorData,
      });

      return this.formatTokenDetails(tokenData);
    } catch (error) {
      this.logger.error('Failed to get token details', error);
      throw new Error(
        `Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      actor: tokenData.actorData
        ? {
            id: tokenData.actorId,
            name: tokenData.actorData.name,
            type: tokenData.actorData.type,
            img: tokenData.actorData.img,
            isLinked: tokenData.actorLink,
          }
        : null,
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

  private async handleGetCombatantStatus(args: {
    actor?: string | undefined;
    all?: boolean | undefined;
  }): Promise<any> {
    this.logger.info('Getting combatant status', { actor: args.actor, all: args.all });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.get-combatant-status', {
        actor: args.actor,
        all: args.all,
      });
    } catch (error) {
      this.logger.error('Failed to get combatant status', error);
      throw new Error(
        `Failed to get combatant status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleToggleTokenCondition(args: any): Promise<any> {
    const { action } = z
      .object({ action: z.enum(['toggle', 'apply-effect', 'remove-effect']).default('toggle') })
      .parse(args ?? {});

    if (action === 'apply-effect') return this.handleApplyActiveEffect(args);
    if (action === 'remove-effect') return this.handleRemoveActiveEffect(args);

    const schema = z.object({
      tokenId: z.string(),
      conditionId: z.string(),
      active: z.boolean().optional(),
    });

    const { tokenId, conditionId, active } = schema.parse(args);

    this.logger.info('Toggling token condition', { tokenId, conditionId, active });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.toggle-token-condition', {
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
      throw new Error(
        `Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Custom active effects. Status effects go through the "toggle" action above,
  // which already applies and clears them by condition ID.

  private async handleApplyActiveEffect(args: any): Promise<any> {
    const schema = z.object({
      tokenId: z.string().min(1),
      effect: z.object({
        label: z.string().min(1),
        icon: z.string().optional(),
        changes: z
          .array(
            z.object({
              key: z.string().min(1),
              mode: z.number().optional(),
              value: z.union([z.string(), z.number()]),
            })
          )
          .optional(),
        duration: z
          .object({
            rounds: z.number().optional(),
            turns: z.number().optional(),
            seconds: z.number().optional(),
          })
          .optional(),
      }),
    });

    const parsed = schema.parse(args);

    this.logger.info('Applying active effect', {
      actor: parsed.tokenId,
      effectLabel: parsed.effect.label,
    });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.apply-active-effect', {
        actor: parsed.tokenId,
        effect: parsed.effect,
      });
    } catch (error) {
      this.logger.error('Failed to apply active effect', error);
      throw new Error(
        `Failed to apply active effect to "${parsed.tokenId}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleRemoveActiveEffect(args: any): Promise<any> {
    const schema = z.object({
      tokenId: z.string().min(1),
      effectName: z.string().min(1),
    });

    const parsed = schema.parse(args);

    this.logger.info('Removing active effect', {
      actor: parsed.tokenId,
      effect: parsed.effectName,
    });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.remove-active-effect', {
        actor: parsed.tokenId,
        effect: parsed.effectName,
      });
    } catch (error) {
      this.logger.error('Failed to remove active effect', error);
      throw new Error(
        `Failed to remove effect "${parsed.effectName}" from "${parsed.tokenId}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetAvailableConditions(args: any): Promise<any> {
    this.logger.info('Getting available conditions');

    try {
      const result = await this.foundryClient.query(
        'foundry-mcp-bridge.get-available-conditions',
        {}
      );

      this.logger.debug('Retrieved available conditions', { count: result.conditions?.length });

      return {
        success: true,
        conditions: result.conditions,
        gameSystem: result.gameSystem,
      };
    } catch (error) {
      this.logger.error('Failed to get available conditions', error);
      throw new Error(
        `Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
