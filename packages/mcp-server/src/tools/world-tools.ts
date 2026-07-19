import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface WorldToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * World tools: game-clock control (advance and read world time) and canvas pings.
 */
export class WorldTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: WorldToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'WorldTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'advance-game-time',
        description:
          'Advance the world clock by a positive amount of seconds, rounds (6s each), minutes, hours, or days — for rests, travel legs, or downtime. Returns the seconds advanced, the new world time, and a human-readable formatted string.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: {
              type: 'number',
              description: 'How much time to advance (must be positive)',
            },
            unit: {
              type: 'string',
              enum: ['seconds', 'rounds', 'minutes', 'hours', 'days'],
              description: 'Unit of the amount (rounds = 6 seconds each)',
            },
          },
          required: ['amount', 'unit'],
        },
      },
      {
        name: 'get-game-time',
        description:
          'Read the current world clock: raw world time in seconds plus a human-readable days/hours/minutes/seconds breakdown. Use before advance-game-time to know where the clock stands, or to report in-game elapsed time to the table.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'ping-location',
        description:
          "Ping a spot on the canvas to direct player attention — the animated ripple every player sees. Target it with exact pixel coordinates (x + y) OR a token reference (pings the token's center) — provide exactly one of the two. Set pull: true to also drag every player's camera to the pinged spot.",
        inputSchema: {
          type: 'object',
          properties: {
            x: {
              type: 'number',
              description:
                'X pixel coordinate to ping. Must be provided together with "y". Mutually exclusive with "token".',
            },
            y: {
              type: 'number',
              description:
                'Y pixel coordinate to ping. Must be provided together with "x". Mutually exclusive with "token".',
            },
            token: {
              type: 'string',
              description:
                'Token reference (ID or name) — pings the token\'s center. Mutually exclusive with "x"/"y".',
            },
            pull: {
              type: 'boolean',
              description:
                "If true, pull every player's view to the pinged location (default: false)",
            },
          },
        },
      },
    ];
  }

  async handleAdvanceGameTime(args: any) {
    const schema = z.object({
      amount: z.number().positive(),
      unit: z.enum(['seconds', 'rounds', 'minutes', 'hours', 'days']),
    });
    const parsed = schema.parse(args);
    this.logger.info('Advancing game time', { amount: parsed.amount, unit: parsed.unit });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.advance-game-time', parsed);
    } catch (error) {
      this.logger.error('Failed to advance game time', error);
      throw new Error(
        `Failed to advance game time: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetGameTime(args: any) {
    const schema = z.object({});
    const parsed = schema.parse(args ?? {});
    this.logger.info('Getting game time');
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.get-game-time', parsed);
    } catch (error) {
      this.logger.error('Failed to get game time', error);
      throw new Error(
        `Failed to get game time: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handlePingLocation(args: any) {
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
      return await this.foundryClient.query('foundry-mcp-bridge.ping-location', parsed);
    } catch (error) {
      this.logger.error('Failed to ping location', error);
      throw new Error(
        `Failed to ping location: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
