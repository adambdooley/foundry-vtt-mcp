import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface PlaylistToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const soundEntrySchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    path: z.string().optional(),
    volume: z.number().min(0).max(1).optional(),
    repeat: z.boolean().optional(),
    fade: z.number().optional(),
  })
  .refine(s => s.id || s.path || s.name, {
    message: 'sound entry needs at least one of id, name, path',
  });

export class PlaylistTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: PlaylistToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'PlaylistTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-playlists',
        description:
          'Create, update, delete, or describe playlists. create: name (+mode/fade/description/sorting/folder/color) and optional sounds [{path, name?, volume?, repeat?, fade?}]. update: playlist identifier + fields and/or sounds to patch (matched by exact id or unique path/name within the playlist). delete: playlist identifier. describe: no identifier lists all playlists; with identifier returns the full playlist with all sounds.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'update', 'delete', 'describe'],
              description: 'Operation to perform',
            },
            playlist: {
              type: ['string', 'null'],
              description:
                'Playlist id or unique name (update/delete/describe); null with describe lists all',
            },
            name: { type: 'string', description: 'Playlist name (create) or new name (update)' },
            mode: {
              type: 'number',
              description: 'Playback mode: 0 sequential, 1 shuffle, 2 soundboard',
            },
            fade: { type: 'number', description: 'Crossfade duration in ms' },
            description: { type: 'string', description: 'Playlist description' },
            sorting: {
              type: 'string',
              enum: ['a', 'm'],
              description: 'Alphabetical or manual sound ordering',
            },
            folder: {
              type: ['string', 'null'],
              description: 'Playlist folder id (null = sidebar root)',
            },
            color: { type: ['string', 'null'], description: 'Folder color hex string' },
            sounds: {
              type: 'array',
              description:
                'Sounds for create (needs path) or patch (id or unique path/name) on update',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Exact PlaylistSound id (update matching only)',
                  },
                  name: { type: 'string' },
                  path: { type: 'string' },
                  volume: { type: 'number', minimum: 0, maximum: 1 },
                  repeat: { type: 'boolean' },
                  fade: { type: 'number' },
                },
              },
            },
            updates: {
              type: 'object',
              description: 'Free-form patch merged into the playlist update (advanced)',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'control-playlist',
        description:
          'Playback control for playlists and their sounds: play (playAll), stop (stopAll), cycle-mode (sequential -> shuffle -> soundboard), play-sound, stop-sound. Playlist and sound accept ids or unique names.',
        inputSchema: {
          type: 'object',
          properties: {
            playlist: { type: 'string', description: 'Playlist id or unique name' },
            command: {
              type: 'string',
              enum: ['play', 'stop', 'cycle-mode', 'play-sound', 'stop-sound'],
              description: 'Playback command',
            },
            sound: {
              type: 'string',
              description:
                'Sound id or unique name within the playlist (play-sound / stop-sound only)',
            },
          },
          required: ['playlist', 'command'],
        },
      },
    ];
  }

  async handleManagePlaylists(args: any): Promise<any> {
    const schema = z.object({
      action: z.enum(['create', 'update', 'delete', 'describe']),
      playlist: z.string().nullable().optional(),
      name: z.string().optional(),
      mode: z.number().int().min(0).max(2).optional(),
      fade: z.number().optional(),
      description: z.string().optional(),
      sorting: z.enum(['a', 'm']).optional(),
      folder: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      sounds: z.array(soundEntrySchema).optional(),
      updates: z.record(z.any()).optional(),
    });
    const parsed = schema.parse(args);

    this.logger.info('Managing playlists', { action: parsed.action, playlist: parsed.playlist });
    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.manage-playlists', parsed);
      return { success: true, ...result };
    } catch (error) {
      this.logger.error('Failed to manage playlists', error);
      throw new Error(
        `Failed to manage playlists: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleControlPlaylist(args: any): Promise<any> {
    const schema = z.object({
      playlist: z.string().min(1),
      command: z.enum(['play', 'stop', 'cycle-mode', 'play-sound', 'stop-sound']),
      sound: z.string().optional(),
    });
    const parsed = schema.parse(args);
    if ((parsed.command === 'play-sound' || parsed.command === 'stop-sound') && !parsed.sound) {
      throw new Error(`command ${parsed.command} requires "sound"`);
    }

    this.logger.info('Controlling playlist', {
      playlist: parsed.playlist,
      command: parsed.command,
    });
    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.control-playlist', parsed);
      return { success: true, ...result };
    } catch (error) {
      this.logger.error('Failed to control playlist', error);
      throw new Error(
        `Failed to control playlist: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
