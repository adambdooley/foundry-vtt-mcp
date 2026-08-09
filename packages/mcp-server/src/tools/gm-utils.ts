import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface GmUtilsToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * Table-facing GM utilities that change no game state: ping a spot on the canvas
 * and play a sound. Both are cosmetic/atmospheric — failures never block game
 * state — and are grouped behind a single gm-utils action switch.
 */
export class GmUtilsTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: GmUtilsToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'GmUtilsTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'gm-utils',
        description:
          'Cosmetic table-facing effects that change no game state.\n' +
          '- "ping": Ping a spot on the canvas to direct player attention — the animated ripple\n' +
          '  every player sees. Target it with exact pixel coordinates (x + y) OR a token reference\n' +
          "  (pings the token's center) — provide exactly one of the two. Set pull: true to also\n" +
          "  drag every player's camera to the pinged spot.\n" +
          '- "play-sound": Play an audio file — sound effect or music sting — for the table.\n' +
          '  By default everyone hears it; set forEveryone: false for a GM-only preview.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['ping', 'play-sound'],
              description:
                'Operation to perform: "ping" to mark a canvas location, "play-sound" to play audio.',
            },
            // ── ping ────────────────────────────────────────────────────────
            x: {
              type: 'number',
              description:
                'For "ping": X pixel coordinate. Must be provided together with "y". Mutually exclusive with "token".',
            },
            y: {
              type: 'number',
              description:
                'For "ping": Y pixel coordinate. Must be provided together with "x". Mutually exclusive with "token".',
            },
            token: {
              type: 'string',
              description:
                'For "ping": token reference (ID or name) — pings the token\'s center. Mutually exclusive with "x"/"y".',
            },
            pull: {
              type: 'boolean',
              description:
                'For "ping": if true, pull every player\'s view to the pinged location (default: false).',
            },
            // ── play-sound ──────────────────────────────────────────────────
            file: {
              type: 'string',
              description:
                'Required for "play-sound". Audio file path (e.g. "sounds/cannon-blast.ogg").',
            },
            volume: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'For "play-sound": playback volume from 0 to 1 (default: 0.8).',
            },
            forEveryone: {
              type: 'boolean',
              description:
                'For "play-sound": if true, play for all connected players; if false, only for the GM (default: true).',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleGmUtils(args: any) {
    const { action } = z.object({ action: z.enum(['ping', 'play-sound']) }).parse(args ?? {});

    switch (action) {
      case 'ping':
        return this.handlePingLocation(args);
      case 'play-sound':
        return this.handlePlaySound(args);
    }
  }

  private async handlePingLocation(args: any) {
    const schema = z
      .object({
        x: z.number().optional(),
        y: z.number().optional(),
        token: z.string().min(1).optional(),
        pull: z.boolean().optional(),
      })
      .refine(
        data => {
          const hasCoords = data.x !== undefined && data.y !== undefined;
          const anyCoord = data.x !== undefined || data.y !== undefined;
          const hasToken = data.token !== undefined;
          // exactly one targeting mode; partial coords are never valid
          if (anyCoord && hasToken) return false;
          if (anyCoord && !hasCoords) return false;
          return hasCoords !== hasToken;
        },
        {
          message: 'Provide exactly one of: both "x" and "y", or "token" (not a partial mix)',
        }
      );
    const parsed = schema.parse(args);
    this.logger.info('Pinging location', {
      x: parsed.x,
      y: parsed.y,
      token: parsed.token,
      pull: parsed.pull,
    });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.ping-location', {
        x: parsed.x,
        y: parsed.y,
        token: parsed.token,
        pull: parsed.pull,
      });
    } catch (error) {
      this.logger.error('Failed to ping location', error);
      throw new Error(
        `Failed to ping location: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handlePlaySound(args: any) {
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
      return await this.foundryClient.query('foundry-mcp-bridge.play-sound', {
        file: parsed.file,
        volume: parsed.volume,
        forEveryone: parsed.forEveryone,
      });
    } catch (error) {
      this.logger.error('Failed to play sound', error);
      throw new Error(
        `Failed to play sound: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
