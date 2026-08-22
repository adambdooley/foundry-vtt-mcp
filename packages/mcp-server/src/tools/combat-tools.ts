import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface CombatToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * Combat flow control: turn advancement and initiative, behind a single
 * manage-combat action switch. GM-gated in the bridge.
 *
 * Damage/healing live on manage-actors, effects and conditions on
 * toggle-token-condition, and combatant status on get-token-details — they are
 * folded into those existing tools rather than adding top-level tools here.
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
        name: 'manage-combat',
        description:
          'Control the flow of the active combat encounter. Errors if no combat is active.\n' +
          '- "advance-turn": Move to the next turn, next round, or back to the previous turn.\n' +
          '  Turn-based effect durations tick automatically. Returns the new round, turn index,\n' +
          '  and the now-active combatant.\n' +
          '- "set-initiative": Set or roll initiative for one combatant. Provide "value" to set it\n' +
          "  directly; omit it to roll using the combatant's own modifiers. Returns the resulting score.",
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['advance-turn', 'set-initiative'],
              description:
                'Operation to perform: "advance-turn" to move the tracker, "set-initiative" to set or roll a combatant\'s initiative.',
            },
            // ── advance-turn ────────────────────────────────────────────────
            direction: {
              type: 'string',
              enum: ['next-turn', 'next-round', 'previous-turn'],
              description: 'For "advance-turn": which way to move (default: "next-turn").',
            },
            // ── set-initiative ──────────────────────────────────────────────
            combatant: {
              type: 'string',
              description:
                'Required for "set-initiative". Combatant name, combatant ID, or actor name.',
            },
            value: {
              type: 'number',
              description:
                'For "set-initiative": the score to set. Omit to roll initiative automatically.',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManageCombat(args: any) {
    const { action } = z
      .object({ action: z.enum(['advance-turn', 'set-initiative']) })
      .parse(args ?? {});

    switch (action) {
      case 'advance-turn':
        return this.handleAdvanceTurn(args);
      case 'set-initiative':
        return this.handleSetInitiative(args);
    }
  }

  private async handleAdvanceTurn(args: any) {
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

  private async handleSetInitiative(args: any) {
    const schema = z.object({
      combatant: z.string().min(1),
      value: z.number().optional(),
    });
    const parsed = schema.parse(args);
    this.logger.info('Setting initiative', { combatant: parsed.combatant, value: parsed.value });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.set-initiative', {
        combatant: parsed.combatant,
        value: parsed.value,
      });
    } catch (error) {
      this.logger.error('Failed to set initiative', error);
      throw new Error(
        `Failed to set initiative for "${parsed.combatant}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
