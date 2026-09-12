import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface CombatToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const visibilitySchema = z.enum(['public', 'gm', 'blind', 'self']);

export class CombatTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: CombatToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger;
  }

  getToolDefinitions() {
    return [
      {
        name: 'get-combat-state',
        description:
          'Read the active Foundry combat tracker or a specified combat. Returns scene, round, turn, current combatant, and the ordered combatant list with initiative, actor, token, hidden, and defeated state.',
        inputSchema: {
          type: 'object',
          properties: {
            combatId: {
              type: 'string',
              description: 'Optional Combat document ID. Defaults to the active combat.',
            },
          },
        },
      },
      {
        name: 'manage-combat',
        description:
          'Manage the Foundry combat tracker. Supports creating or activating combat, adding/removing scene tokens, rolling initiative, setting initiative or combatant status, advancing or rewinding turns/rounds, setting an exact round/turn, ending combat, and confirmed deletion. Read get-combat-state before and after consequential changes.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'create',
                'activate',
                'add-combatants',
                'remove-combatants',
                'roll-initiative',
                'set-initiative',
                'update-combatant',
                'start',
                'next-turn',
                'previous-turn',
                'next-round',
                'set-turn',
                'end',
                'delete',
              ],
            },
            combatId: { type: 'string', description: 'Combat ID. Defaults to active combat.' },
            sceneId: {
              type: 'string',
              description: 'Scene ID for create. Defaults to active scene.',
            },
            activate: { type: 'boolean', default: true },
            tokenIdentifiers: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 100,
              description: 'Token IDs or exact token/actor names for add-combatants.',
            },
            combatantIds: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 100,
              description:
                'Combatant IDs for removal or initiative rolling. Omit when rolling all.',
            },
            combatantId: { type: 'string', description: 'Combatant ID for a single update.' },
            initiative: { type: 'number', description: 'Initiative value for set-initiative.' },
            hidden: { type: 'boolean', description: 'Hidden state for update-combatant.' },
            defeated: { type: 'boolean', description: 'Defeated state for update-combatant.' },
            round: { type: 'integer', minimum: 0, description: 'Round for set-turn.' },
            turn: { type: 'integer', minimum: 0, description: 'Turn index for set-turn.' },
            visibility: {
              type: 'string',
              enum: ['public', 'gm', 'blind', 'self'],
              default: 'public',
              description: 'Visibility for initiative roll chat messages.',
            },
            confirmDelete: {
              type: 'boolean',
              const: true,
              description: 'Required only for permanent deletion of the Combat document.',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleGetCombatState(args: any) {
    const schema = z.object({ combatId: z.string().trim().min(1).optional() });
    try {
      const params = schema.parse(args ?? {});
      const response = await this.foundryClient.query(
        'foundry-mcp-bridge.get-combat-state',
        params
      );
      if (!response?.success) throw new Error(response?.error || 'Failed to read combat state');
      return response;
    } catch (error) {
      this.logger.error('Error reading Foundry combat state', error);
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Parameter error: ${error.errors.map(e => e.message).join(', ')}`,
        };
      }
      throw error;
    }
  }

  async handleManageCombat(args: any) {
    const schema = z
      .object({
        action: z.enum([
          'create',
          'activate',
          'add-combatants',
          'remove-combatants',
          'roll-initiative',
          'set-initiative',
          'update-combatant',
          'start',
          'next-turn',
          'previous-turn',
          'next-round',
          'set-turn',
          'end',
          'delete',
        ]),
        combatId: z.string().trim().min(1).optional(),
        sceneId: z.string().trim().min(1).optional(),
        activate: z.boolean().default(true),
        tokenIdentifiers: z.array(z.string().trim().min(1)).max(100).optional(),
        combatantIds: z.array(z.string().trim().min(1)).max(100).optional(),
        combatantId: z.string().trim().min(1).optional(),
        initiative: z.number().finite().optional(),
        hidden: z.boolean().optional(),
        defeated: z.boolean().optional(),
        round: z.number().int().min(0).optional(),
        turn: z.number().int().min(0).optional(),
        visibility: visibilitySchema.default('public'),
        confirmDelete: z.literal(true).optional(),
      })
      .superRefine((value, ctx) => {
        const requireField = (condition: boolean, field: string, message: string) => {
          if (!condition) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
        };
        if (value.action === 'add-combatants') {
          requireField(
            Boolean(value.tokenIdentifiers?.length),
            'tokenIdentifiers',
            'tokenIdentifiers are required'
          );
        }
        if (value.action === 'remove-combatants') {
          requireField(
            Boolean(value.combatantIds?.length),
            'combatantIds',
            'combatantIds are required'
          );
        }
        if (value.action === 'set-initiative') {
          requireField(Boolean(value.combatantId), 'combatantId', 'combatantId is required');
          requireField(value.initiative !== undefined, 'initiative', 'initiative is required');
        }
        if (value.action === 'update-combatant') {
          requireField(Boolean(value.combatantId), 'combatantId', 'combatantId is required');
          requireField(
            value.hidden !== undefined || value.defeated !== undefined,
            'combatantId',
            'hidden or defeated is required'
          );
        }
        if (value.action === 'set-turn') {
          requireField(value.round !== undefined, 'round', 'round is required');
          requireField(value.turn !== undefined, 'turn', 'turn is required');
        }
        if (value.action === 'delete') {
          requireField(
            value.confirmDelete === true,
            'confirmDelete',
            'confirmDelete=true is required'
          );
        }
      });

    try {
      const params = schema.parse(args);
      const response = await this.foundryClient.query('foundry-mcp-bridge.manage-combat', params);
      if (!response?.success) throw new Error(response?.error || 'Failed to manage combat');
      return response;
    } catch (error) {
      this.logger.error('Error managing Foundry combat', error);
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Parameter error: ${error.errors.map(e => e.message).join(', ')}`,
        };
      }
      throw error;
    }
  }
}
