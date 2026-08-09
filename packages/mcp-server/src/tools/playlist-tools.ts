import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface PlaylistToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * Playlist control over core Foundry `game.playlists`, behind a single
 * manage-playlists action switch. Every action is GM-gated in the bridge,
 * including "list" — a playlist listing exposes world content, and the gate
 * matches every other handler in queries.ts.
 */
export class PlaylistTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: PlaylistToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'PlaylistTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-playlists',
        description:
          'Control Foundry audio playlists for the table.\n' +
          '- "list": List playlists with their sounds and playing state (read-only).\n' +
          '- "play" / "stop": Start or stop a playlist by name or ID.\n' +
          '- "play-sound": Play one named track from a playlist, e.g. a single battle theme.\n' +
          '- "stop-all": Stop every currently playing playlist. Takes no other arguments.\n' +
          '- "set-mode": Set playback order to sequential, shuffle, or simultaneous.\n' +
          '- "create": Create a playlist, optionally with its sounds in one call.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'play', 'stop', 'play-sound', 'stop-all', 'set-mode', 'create'],
              description: 'Operation to perform.',
            },
            // ── list ────────────────────────────────────────────────────────
            playingOnly: {
              type: 'boolean',
              description: 'For "list": return only playlists that are currently playing.',
            },
            // ── play / stop / play-sound / set-mode ─────────────────────────
            playlist: {
              type: 'string',
              description:
                'Required for "play", "stop", "play-sound", and "set-mode". Playlist name (case-insensitive) or ID.',
            },
            sound: {
              type: 'string',
              description: 'Required for "play-sound". Name of the track within the playlist.',
            },
            // ── set-mode / create ───────────────────────────────────────────
            mode: {
              type: 'string',
              enum: ['sequential', 'shuffle', 'simultaneous'],
              description:
                'Required for "set-mode", optional for "create". Playback order for the playlist.',
            },
            // ── create ──────────────────────────────────────────────────────
            name: {
              type: 'string',
              description: 'Required for "create". Display name of the new playlist.',
            },
            sounds: {
              type: 'array',
              description: 'For "create": tracks to add to the new playlist.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Track name' },
                  path: { type: 'string', description: 'Audio file path' },
                  repeat: { type: 'boolean', description: 'Whether the track loops' },
                  volume: { type: 'number', minimum: 0, maximum: 1, description: 'Volume 0 to 1' },
                },
                required: ['name', 'path'],
              },
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManagePlaylists(args: any) {
    const { action } = z
      .object({
        action: z.enum(['list', 'play', 'stop', 'play-sound', 'stop-all', 'set-mode', 'create']),
      })
      .parse(args ?? {});

    switch (action) {
      case 'list':
        return this.query(
          'list-playlists',
          z.object({ playingOnly: z.boolean().optional() }),
          args
        );
      case 'play':
        return this.query('play-playlist', z.object({ playlist: z.string().min(1) }), args);
      case 'stop':
        return this.query('stop-playlist', z.object({ playlist: z.string().min(1) }), args);
      case 'play-sound':
        return this.query(
          'play-playlist-sound',
          z.object({ playlist: z.string().min(1), sound: z.string().min(1) }),
          args
        );
      case 'stop-all':
        return this.query('stop-all-playlists', z.object({}), {});
      case 'set-mode':
        return this.query(
          'set-playlist-mode',
          z.object({
            playlist: z.string().min(1),
            mode: z.enum(['sequential', 'shuffle', 'simultaneous']),
          }),
          args
        );
      case 'create':
        return this.query(
          'create-playlist',
          z.object({
            name: z.string().min(1),
            mode: z.enum(['sequential', 'shuffle', 'simultaneous']).optional(),
            sounds: z
              .array(
                z.object({
                  name: z.string().min(1),
                  path: z.string().min(1),
                  repeat: z.boolean().optional(),
                  volume: z.number().min(0).max(1).optional(),
                })
              )
              .optional(),
          }),
          args
        );
    }
  }

  /** Parse args against the action's schema, then forward only those fields to the bridge. */
  private async query(method: string, schema: z.ZodTypeAny, args: unknown) {
    const parsed = schema.parse(args ?? {});
    this.logger.info(`Playlist action: ${method}`, parsed as Record<string, unknown>);
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
