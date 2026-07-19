import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface AudioToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * Audio tool: play a sound file to the GM or all clients via Foundry's AudioHelper.
 */
export class AudioTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: AudioToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'AudioTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'play-sound',
        description:
          'Play an audio file — sound effect or music sting — for the table. By default everyone hears it; set forEveryone: false for a GM-only preview. Cosmetic/atmospheric only; failures never block game state.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Audio file path (e.g. "sounds/cannon-blast.ogg")',
            },
            volume: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Playback volume from 0 to 1 (default: 0.8)',
            },
            forEveryone: {
              type: 'boolean',
              description:
                'If true, play for all connected players; if false, only for the GM (default: true)',
            },
          },
          required: ['file'],
        },
      },
    ];
  }

  async handlePlaySound(args: any) {
    const schema = z.object({
      file: z.string().min(1),
      volume: z.number().min(0).max(1).optional(),
      forEveryone: z.boolean().optional(),
    });
    const parsed = schema.parse(args);
    this.logger.info('Playing sound', {
      file: parsed.file,
      volume: parsed.volume,
      forEveryone: parsed.forEveryone,
    });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.play-sound', parsed);
    } catch (error) {
      this.logger.error('Failed to play sound', error);
      throw new Error(
        `Failed to play sound: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
