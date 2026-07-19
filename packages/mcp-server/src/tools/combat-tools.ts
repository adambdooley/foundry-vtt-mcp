import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface CombatToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * Combat tools: damage/healing, turn and initiative control, active-effect
 * management, and combatant status. Mutating tools are GM-gated in the bridge;
 * get-combatant-status is read-only.
 */
export class CombatTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: CombatToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'CombatTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'apply-damage',
        description:
          'Apply a flat amount of damage to one or more targets, respecting resistances, immunities, and vulnerabilities via the game system when available. Use for environmental damage, traps, narrative damage, or manual adjustments. Returns HP before/after per target.',
        inputSchema: {
          type: 'object',
          properties: {
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Target token/actor references (IDs or names)',
            },
            amount: {
              type: 'number',
              description: 'Damage amount before resistances (positive number)',
            },
            damageType: {
              type: 'string',
              description:
                'Damage type for resistance/immunity calculation, e.g. "fire", "slashing", "necrotic" (default: "bludgeoning")',
            },
            half: {
              type: 'boolean',
              description:
                'If true, apply half damage rounded down (e.g. a successful save against a breath weapon)',
            },
          },
          required: ['targets', 'amount'],
        },
      },
      {
        name: 'apply-healing',
        description:
          'Apply healing to one or more targets, clamped to their HP maximum. Returns HP before/after per target. Use for potions, spells resolved narratively, short-rest recovery, or manual corrections.',
        inputSchema: {
          type: 'object',
          properties: {
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Target token/actor references (IDs or names)',
            },
            amount: {
              type: 'number',
              description: 'Healing amount (positive number)',
            },
          },
          required: ['targets', 'amount'],
        },
      },
      {
        name: 'advance-turn',
        description:
          'Advance the active combat encounter to the next turn, next round, or back to the previous turn. Turn-based effect durations tick automatically. Returns the new round, turn index, and the now-active combatant. Errors if no combat is active.',
        inputSchema: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['next-turn', 'next-round', 'previous-turn'],
              description: 'Which way to advance (default: "next-turn")',
            },
          },
        },
      },
      {
        name: 'set-initiative',
        description:
          "Set or roll initiative for a combatant in the active combat. Provide a value to set it directly; omit the value to roll initiative using the combatant's own modifiers. Returns the resulting initiative score.",
        inputSchema: {
          type: 'object',
          properties: {
            combatant: {
              type: 'string',
              description: 'Combatant reference: combatant name, combatant ID, or actor name',
            },
            value: {
              type: 'number',
              description: 'Initiative score to set. Omit to roll initiative automatically.',
            },
          },
          required: ['combatant'],
        },
      },
      {
        name: 'apply-active-effect',
        description:
          'Apply a condition or custom active effect to an actor. Provide exactly one of "condition" or "effect". Conditions (e.g. "prone", "poisoned", "restrained") are system status effects. Custom effects support attribute changes (via active-effect change keys) and round/turn/second durations that expire with combat tracking.',
        inputSchema: {
          type: 'object',
          properties: {
            actor: {
              type: 'string',
              description: 'Target actor: token ID, token name, actor ID, or actor name',
            },
            condition: {
              type: 'string',
              description:
                'Status effect ID to apply (e.g. "prone", "poisoned", "restrained"). Mutually exclusive with "effect". Invalid ids return an error listing the valid ones.',
            },
            effect: {
              type: 'object',
              description: 'Custom active effect definition. Mutually exclusive with "condition".',
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
          },
          required: ['actor'],
        },
      },
      {
        name: 'remove-active-effect',
        description:
          'Remove a condition or active effect from an actor by effect name (case-insensitive) or status effect ID (e.g. "prone"). Returns what was removed.',
        inputSchema: {
          type: 'object',
          properties: {
            actor: {
              type: 'string',
              description: 'Target actor: token ID, token name, actor ID, or actor name',
            },
            effect: {
              type: 'string',
              description: 'Effect label (case-insensitive) or status effect ID to remove',
            },
          },
          required: ['actor', 'effect'],
        },
      },
      {
        name: 'get-combatant-status',
        description:
          'The sensor tool: read the full tactical state of one actor or every combatant before deciding an action. Returns HP (value/max/temp), AC, movement, active conditions and effects (with remaining durations), spell slots, consumable items, initiative, and whose turn it is. Provide exactly one of "actor" (any actor, combat not required) or "all: true" (requires an active combat; also returns round and turn).',
        inputSchema: {
          type: 'object',
          properties: {
            actor: {
              type: 'string',
              description:
                'Single actor to inspect: token ID, token name, actor ID, or actor name. Mutually exclusive with "all".',
            },
            all: {
              type: 'boolean',
              description:
                'If true, return status for every combatant in the active combat plus round/turn info. Mutually exclusive with "actor".',
            },
          },
        },
      },
    ];
  }

  async handleApplyDamage(args: any) {
    const schema = z.object({
      targets: z.array(z.string().min(1)).min(1),
      amount: z.number().positive('amount must be a positive number'),
      damageType: z.string().optional(),
      half: z.boolean().optional(),
    });
    const parsed = schema.parse(args);
    this.logger.info('Applying damage', {
      targetCount: parsed.targets.length,
      amount: parsed.amount,
      damageType: parsed.damageType,
      half: parsed.half,
    });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.apply-damage', parsed);
    } catch (error) {
      this.logger.error('Failed to apply damage', error);
      throw new Error(
        `Failed to apply damage: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleApplyHealing(args: any) {
    const schema = z.object({
      targets: z.array(z.string().min(1)).min(1),
      amount: z.number().positive('amount must be a positive number'),
    });
    const parsed = schema.parse(args);
    this.logger.info('Applying healing', {
      targetCount: parsed.targets.length,
      amount: parsed.amount,
    });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.apply-healing', parsed);
    } catch (error) {
      this.logger.error('Failed to apply healing', error);
      throw new Error(
        `Failed to apply healing: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleAdvanceTurn(args: any) {
    const schema = z.object({
      direction: z.enum(['next-turn', 'next-round', 'previous-turn']).optional(),
    });
    const { direction } = schema.parse(args ?? {});
    this.logger.info('Advancing turn', { direction: direction || 'next-turn' });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.advance-turn', { direction });
    } catch (error) {
      this.logger.error('Failed to advance turn', error);
      throw new Error(
        `Failed to advance turn: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleSetInitiative(args: any) {
    const schema = z.object({
      combatant: z.string().min(1),
      value: z.number().optional(),
    });
    const parsed = schema.parse(args);
    this.logger.info('Setting initiative', { combatant: parsed.combatant, value: parsed.value });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.set-initiative', parsed);
    } catch (error) {
      this.logger.error('Failed to set initiative', error);
      throw new Error(
        `Failed to set initiative for "${parsed.combatant}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleApplyActiveEffect(args: any) {
    const schema = z
      .object({
        actor: z.string().min(1),
        condition: z.string().min(1).optional(),
        effect: z
          .object({
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
          })
          .optional(),
      })
      .refine(data => (data.condition !== undefined) !== (data.effect !== undefined), {
        message: 'Provide exactly one of "condition" or "effect"',
      });
    const parsed = schema.parse(args);
    this.logger.info('Applying active effect', {
      actor: parsed.actor,
      condition: parsed.condition,
      effectLabel: parsed.effect?.label,
    });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.apply-active-effect', parsed);
    } catch (error) {
      this.logger.error('Failed to apply active effect', error);
      throw new Error(
        `Failed to apply active effect to "${parsed.actor}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleRemoveActiveEffect(args: any) {
    const schema = z.object({
      actor: z.string().min(1),
      effect: z.string().min(1),
    });
    const parsed = schema.parse(args);
    this.logger.info('Removing active effect', { actor: parsed.actor, effect: parsed.effect });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.remove-active-effect', parsed);
    } catch (error) {
      this.logger.error('Failed to remove active effect', error);
      throw new Error(
        `Failed to remove effect "${parsed.effect}" from "${parsed.actor}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetCombatantStatus(args: any) {
    const schema = z
      .object({
        actor: z.string().min(1).optional(),
        all: z.boolean().optional(),
      })
      .refine(data => (data.actor !== undefined) !== (data.all === true), {
        message: 'Provide exactly one of "actor" or "all: true"',
      });
    const parsed = schema.parse(args ?? {});
    this.logger.info('Getting combatant status', { actor: parsed.actor, all: parsed.all });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.get-combatant-status', parsed);
    } catch (error) {
      this.logger.error('Failed to get combatant status', error);
      throw new Error(
        `Failed to get combatant status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
