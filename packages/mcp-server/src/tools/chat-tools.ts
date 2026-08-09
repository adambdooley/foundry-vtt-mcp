import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface ChatToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * GM narration and dice output, behind a single manage-chat action switch. All
 * three actions post to Foundry chat and are GM-gated in the bridge.
 */
export class ChatTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: ChatToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'ChatTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-chat',
        description:
          'Post to Foundry chat: narration, dice, or table draws.\n' +
          '- "post": Send a message. Optionally speak AS a token or actor, choose a style\n' +
          '  (ic, ooc, emote, whisper), and whisper to named players (an empty whisper list\n' +
          '  goes to all GMs).\n' +
          '- "roll": Evaluate a dice formula and post the styled roll card, e.g. "2d6+3",\n' +
          '  "1d20+5", "4d6kh3". Returns the total, formatted result, and per-die breakdown.\n' +
          '  This rolls immediately as the GM; to ask a player to roll, use request-player-rolls.\n' +
          '- "draw-table": Draw one or more results from a RollTable and post them, for loot\n' +
          '  drops or random encounters.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['post', 'roll', 'draw-table'],
              description: 'Operation to perform.',
            },
            // ── post ────────────────────────────────────────────────────────
            content: {
              type: 'string',
              description: 'Required for "post". The message body (HTML or plain text).',
            },
            style: {
              type: 'string',
              enum: ['ic', 'ooc', 'emote', 'whisper'],
              description:
                'For "post": ic (in character), ooc (out of character, default), emote, or whisper.',
            },
            // ── post / roll ─────────────────────────────────────────────────
            speaker: {
              type: 'string',
              description:
                'For "post" and "roll": token or actor to speak AS (ID or name). Defaults to the GM speaker.',
            },
            whisperTo: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Player names to whisper to; unmatched names are skipped. For "post" this ONLY applies when style is "whisper" — without it the message is public, so set both together to keep something secret. For "roll" a non-empty list makes the roll private on its own. An empty list with style "whisper" goes to all GMs.',
            },
            flavor: {
              type: 'string',
              description:
                'For "post" and "roll": flavor/subtitle text shown above the message or roll card.',
            },
            // ── roll ────────────────────────────────────────────────────────
            formula: {
              type: 'string',
              description: 'Required for "roll". Dice formula, e.g. "2d6+3", "1d20+5", "4d6kh3".',
            },
            // ── draw-table ──────────────────────────────────────────────────
            table: {
              type: 'string',
              description: 'Required for "draw-table". RollTable name (case-insensitive) or ID.',
            },
            rolls: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              description: 'For "draw-table": how many times to draw (default 1, max 20).',
            },
            displayChat: {
              type: 'boolean',
              description: 'For "draw-table": post the draw result to chat (default true).',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManageChat(args: any) {
    const { action } = z
      .object({ action: z.enum(['post', 'roll', 'draw-table']) })
      .parse(args ?? {});

    switch (action) {
      case 'post':
        return this.query(
          'post-chat-message',
          z.object({
            content: z.string().min(1),
            speaker: z.string().min(1).optional(),
            style: z.enum(['ic', 'ooc', 'emote', 'whisper']).default('ooc'),
            whisperTo: z.array(z.string().min(1)).optional(),
            flavor: z.string().min(1).optional(),
          }),
          args
        );
      case 'roll':
        return this.query(
          'roll-dice',
          z.object({
            formula: z.string().min(1),
            flavor: z.string().min(1).optional(),
            speaker: z.string().min(1).optional(),
            whisperTo: z.array(z.string().min(1)).optional(),
          }),
          args
        );
      case 'draw-table':
        return this.query(
          'draw-roll-table',
          z.object({
            table: z.string().min(1),
            rolls: z.number().int().min(1).max(20).default(1),
            displayChat: z.boolean().default(true),
          }),
          args
        );
    }
  }

  /** Parse args against the action's schema, then forward only those fields to the bridge. */
  private async query(method: string, schema: z.ZodTypeAny, args: unknown) {
    const parsed = schema.parse(args ?? {});
    this.logger.info(`Chat action: ${method}`);
    try {
      return await this.foundryClient.query(`foundry-mcp-bridge.${method}`, parsed);
    } catch (error) {
      this.logger.error(`Failed: ${method}`, error);
      throw new Error(
        `Failed to ${method.replace(/-/g, ' ')}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
