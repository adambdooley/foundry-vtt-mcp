import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface DiceRollToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class DiceRollTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: DiceRollToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger;
  }

  getToolDefinitions() {
    return [
      {
        name: 'roll-dice',
        description:
          'Execute a dice formula directly in Foundry VTT, persist the result as a Foundry chat roll, and return the exact total and chat message ID. Use for GM-controlled rolls or when the player has already declared the action. Visibility must be explicitly determined before calling.',
        inputSchema: {
          type: 'object',
          properties: {
            formula: {
              type: 'string',
              description: 'Foundry roll formula, for example "1d20 + 5" or "2d6 + 3".',
              minLength: 1,
              maxLength: 200,
            },
            flavor: {
              type: 'string',
              description: 'Optional player-facing description stored with the roll.',
              default: '',
              maxLength: 500,
            },
            actorIdentifier: {
              type: 'string',
              description: 'Optional actor name or ID to use as the roll speaker.',
            },
            visibility: {
              type: 'string',
              enum: ['public', 'gm', 'blind', 'self'],
              description:
                'Roll visibility: public to everyone, gm to active GMs, blind to GMs without exposing the result to players, or self to the executing GM only.',
            },
            userConfirmedVisibility: {
              type: 'boolean',
              const: true,
              description: 'Confirms that roll visibility was explicitly supplied or established.',
            },
          },
          required: ['formula', 'visibility', 'userConfirmedVisibility'],
        },
      },
      {
        name: 'get-recent-rolls',
        description:
          'Read recent persisted Foundry chat rolls visible to the connected GM. Returns chat message IDs, speakers, formulas, totals, dice, flavor, visibility, and timestamps.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
              description: 'Maximum number of recent rolls to return.',
            },
            actorIdentifier: {
              type: 'string',
              description: 'Optional actor name or ID filter.',
            },
          },
        },
      },
      {
        name: 'get-roll-result',
        description:
          'Read one persisted Foundry roll by its chat message ID and return its exact formula, total, dice, speaker, flavor, visibility, and timestamp.',
        inputSchema: {
          type: 'object',
          properties: {
            chatMessageId: {
              type: 'string',
              description: 'Foundry ChatMessage ID returned by roll-dice or get-recent-rolls.',
            },
          },
          required: ['chatMessageId'],
        },
      },
      {
        name: 'request-player-rolls',
        description:
          'Request dice rolls from players with interactive buttons. Creates roll buttons in Foundry chat that players can click. VISIBILITY WORKFLOW: Before calling this function, ensure the user has specified whether they want a public or private roll. If they have already specified "public" or "private" in their request (e.g., "public performance check", "private stealth roll"), you can proceed directly. If the visibility is ambiguous or unspecified, ask: "Do you want this to be a PUBLIC roll (visible to all players) or PRIVATE roll (visible to player and GM only)?" and wait for their answer. Supports character-to-player resolution and GM fallback.',
        inputSchema: {
          type: 'object',
          properties: {
            rollType: {
              type: 'string',
              description:
                'Type of roll to request (ability, skill, save, attack, initiative, custom)',
              enum: ['ability', 'skill', 'save', 'attack', 'initiative', 'custom'],
            },
            rollTarget: {
              type: 'string',
              description:
                'Target for the roll - can be ability name (str, dex, con, int, wis, cha), skill name (perception, insight, stealth, etc.), or custom roll formula',
            },
            targetPlayer: {
              type: 'string',
              description: 'Player name or character name to request the roll from',
            },
            isPublic: {
              type: 'boolean',
              description:
                'Whether the roll should be public (true = visible to all players) or private (false = visible only to target player and GM).',
            },
            userConfirmedVisibility: {
              type: 'boolean',
              const: true,
              description:
                'REQUIRED: Must be set to true to confirm the roll visibility has been determined. This can happen in two ways: 1) User explicitly specified "public" or "private" in their original request (e.g., "public stealth check"), or 2) You asked the clarifying question and received their answer. Only set this to true when you are confident about the visibility preference, either from their original request or from a direct answer to your question.',
            },
            rollModifier: {
              type: 'string',
              description: 'Optional modifier to add to the roll (e.g., "+2", "-1", "+1d4")',
              default: '',
            },
            flavor: {
              type: 'string',
              description: 'Optional flavor text to describe the roll context',
              default: '',
            },
          },
          required: [
            'rollType',
            'rollTarget',
            'targetPlayer',
            'isPublic',
            'userConfirmedVisibility',
          ],
        },
      },
    ];
  }

  async handleRollDice(args: any) {
    const schema = z.object({
      formula: z.string().trim().min(1).max(200),
      flavor: z.string().max(500).default(''),
      actorIdentifier: z.string().trim().min(1).optional(),
      visibility: z.enum(['public', 'gm', 'blind', 'self']),
      userConfirmedVisibility: z.literal(true),
    });

    try {
      const params = schema.parse(args);
      const response = await this.foundryClient.query('foundry-mcp-bridge.roll-dice', params);
      if (!response?.success) throw new Error(response?.error || 'Failed to execute roll');
      return response;
    } catch (error) {
      this.logger.error('Error executing Foundry roll', error);
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Parameter error: ${error.errors.map(e => e.message).join(', ')}`,
        };
      }
      throw error;
    }
  }

  async handleGetRecentRolls(args: any) {
    const schema = z.object({
      limit: z.number().int().min(1).max(100).default(20),
      actorIdentifier: z.string().trim().min(1).optional(),
    });

    try {
      const params = schema.parse(args ?? {});
      const response = await this.foundryClient.query(
        'foundry-mcp-bridge.get-recent-rolls',
        params
      );
      if (!response?.success) throw new Error(response?.error || 'Failed to read recent rolls');
      return response;
    } catch (error) {
      this.logger.error('Error reading recent Foundry rolls', error);
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Parameter error: ${error.errors.map(e => e.message).join(', ')}`,
        };
      }
      throw error;
    }
  }

  async handleGetRollResult(args: any) {
    const schema = z.object({ chatMessageId: z.string().trim().min(1) });

    try {
      const params = schema.parse(args);
      const response = await this.foundryClient.query('foundry-mcp-bridge.get-roll-result', params);
      if (!response?.success) throw new Error(response?.error || 'Failed to read roll result');
      return response;
    } catch (error) {
      this.logger.error('Error reading Foundry roll result', error);
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Parameter error: ${error.errors.map(e => e.message).join(', ')}`,
        };
      }
      throw error;
    }
  }

  async handleRequestPlayerRolls(args: any) {
    const schema = z.object({
      rollType: z.enum(['ability', 'skill', 'save', 'attack', 'initiative', 'custom']),
      rollTarget: z.string(),
      targetPlayer: z.string(),
      isPublic: z.boolean(),
      userConfirmedVisibility: z.literal(true),
      rollModifier: z.string().default(''),
      flavor: z.string().default(''),
    });

    try {
      const params = schema.parse(args);

      // Validation should be handled by schema, but add extra safety checks
      if (typeof params.isPublic !== 'boolean') {
        return 'Please specify whether you want this to be a PUBLIC roll (visible to all players) or PRIVATE roll (visible only to the target player and GM). You must provide either "true" for public or "false" for private.';
      }

      if (params.userConfirmedVisibility !== true) {
        return 'You must determine the roll visibility before calling this function. Either: 1) The user already specified "public" or "private" in their request, or 2) You need to ask: "Do you want this to be a PUBLIC roll or PRIVATE roll?" Set userConfirmedVisibility to true only when you are confident about the visibility preference.';
      }

      const response = await this.foundryClient.query(
        'foundry-mcp-bridge.request-player-rolls',
        params
      );

      if (response.success) {
        return `Roll request sent successfully! ${response.message}`;
      } else {
        throw new Error(response.error || 'Failed to request player rolls');
      }
    } catch (error) {
      this.logger.error('Error requesting player rolls', error);
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => {
          if (e.path.includes('isPublic')) {
            return 'You must specify whether the roll should be PUBLIC (visible to all players) or PRIVATE (visible only to target player and GM). Check if the user already specified this in their request, or ask them to clarify.';
          }
          return e.message;
        });
        return `Parameter error: ${messages.join(', ')}`;
      }
      throw error;
    }
  }
}
