import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface WorldToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * World clock control: read and advance world time behind a single manage-time
 * action switch.
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
        name: 'manage-time',
        description:
          'Read or advance the in-world clock.\n' +
          '- "get": Return the current world time in seconds plus a human-readable\n' +
          '  days/hours/minutes/seconds breakdown. Call this to know where the clock stands\n' +
          '  before advancing it, or to report elapsed in-game time to the table.\n' +
          '- "advance": Move the clock forward by a positive amount — for rests, travel legs,\n' +
          '  or downtime. Returns the seconds advanced, the new world time, and a formatted string.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['get', 'advance'],
              description:
                'Operation to perform: "get" to read the clock, "advance" to move it forward.',
            },
            // ── advance ─────────────────────────────────────────────────────
            amount: {
              type: 'number',
              description: 'Required for "advance". How much time to add (must be positive).',
            },
            unit: {
              type: 'string',
              enum: ['seconds', 'rounds', 'minutes', 'hours', 'days'],
              description: 'Required for "advance". Unit of the amount (rounds = 6 seconds each).',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManageTime(args: any) {
    const { action } = z.object({ action: z.enum(['get', 'advance']) }).parse(args ?? {});

    switch (action) {
      case 'get':
        return this.handleGetGameTime();
      case 'advance':
        return this.handleAdvanceGameTime(args);
    }
  }

  private async handleAdvanceGameTime(args: any) {
    const schema = z.object({
      amount: z.number().positive(),
      unit: z.enum(['seconds', 'rounds', 'minutes', 'hours', 'days']),
    });
    const parsed = schema.parse(args);
    this.logger.info('Advancing game time', { amount: parsed.amount, unit: parsed.unit });
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.advance-game-time', {
        amount: parsed.amount,
        unit: parsed.unit,
      });
    } catch (error) {
      this.logger.error('Failed to advance game time', error);
      throw new Error(
        `Failed to advance game time: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async handleGetGameTime() {
    this.logger.info('Getting game time');
    try {
      return await this.foundryClient.query('foundry-mcp-bridge.get-game-time', {});
    } catch (error) {
      this.logger.error('Failed to get game time', error);
      throw new Error(
        `Failed to get game time: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
