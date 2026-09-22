import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface ChatToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

export class ChatTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: ChatToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ChatTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'create-chat-message',
        description:
          'Speak an in-character line as an actor or a specific token: a floating speech ' +
          'bubble over the token (the default), a real chat-log message, or a whisper to ' +
          'named players. Pass a language to have Polyglot scramble a chat-log message for ' +
          "viewers who don't know it. One call posts one line.",
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description:
                'Name or ID of the actor speaking (resolves world actors and scene tokens). ' +
                'Give this or tokenId.',
            },
            tokenId: {
              type: 'string',
              description:
                'ID of a specific token on the current scene. Prefer this over actorIdentifier ' +
                'when several tokens share one actor (guards, bandits), since a name lookup ' +
                'cannot tell them apart.',
            },
            content: {
              type: 'string',
              description:
                'The message text, in the language actually being spoken (not translated or ' +
                'bracketed).',
            },
            language: {
              type: 'string',
              description:
                'Optional language key matching the game system\'s language list (e.g. "common", ' +
                '"necril"). With Polyglot active the line is tagged so it scrambles for viewers ' +
                "who don't know that language, on bubbles as well as chat-log messages. Without " +
                'Polyglot, Foundry has no notion of a spoken language, so the line plays as written ' +
                'and the result reports polyglotApplied: false.',
            },
            chatLog: {
              type: 'boolean',
              description:
                'Post a real chat-log message (which also shows its own bubble) instead of the ' +
                'default bubble-only delivery. Bubble-only requires the speaker to have a token ' +
                'on the current scene.',
            },
            whisperTo: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional player names or user IDs to whisper this line to. A whisper is always ' +
                'delivered as a chat-log message, since a bubble would be visible to everyone, so ' +
                'passing this implies chatLog: true.',
            },
          },
          required: ['content'],
        },
      },
    ];
  }

  async handleCreateChatMessage(args: any): Promise<any> {
    const schema = z
      .object({
        actorIdentifier: z.string().optional(),
        tokenId: z.string().optional(),
        content: z.string().min(1),
        language: z.string().optional(),
        chatLog: z.boolean().optional(),
        whisperTo: z.array(z.string()).optional(),
      })
      .refine(v => v.actorIdentifier || v.tokenId, {
        message: 'Either actorIdentifier or tokenId is required',
      });

    const parsed = schema.parse(args);

    this.logger.info('Creating chat message', {
      speaker: parsed.tokenId ?? parsed.actorIdentifier,
      whispered: !!parsed.whisperTo?.length,
    });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.createChatMessage', parsed);
      this.logger.debug('Chat message created', { result });
      return result;
    } catch (error) {
      this.logger.error('Failed to create chat message', { error });
      throw new Error(
        `Failed to create chat message for "${parsed.tokenId ?? parsed.actorIdentifier}": ` +
          `${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
