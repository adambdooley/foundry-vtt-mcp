/**
 * manage-playlists — schema advertisement + bridge query-forwarding tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { PlaylistTools } from './playlist-tools.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new PlaylistTools({ foundryClient, logger });
  return { tools, query };
}

describe('PlaylistTools.getToolDefinitions', () => {
  it('advertises a single manage-playlists tool', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(d => d.name);
    expect(names).toEqual(['manage-playlists']);
  });

  it('folds all seven playlist operations into one action enum', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.required).toEqual(['action']);
    expect(def.inputSchema.properties.action.enum).toEqual([
      'list',
      'play',
      'stop',
      'play-sound',
      'stop-all',
      'set-mode',
      'create',
    ]);
  });
});

describe('manage-playlists forwarding', () => {
  it('forwards list with its filter', async () => {
    const { tools, query } = makeTools();
    await tools.handleManagePlaylists({ action: 'list', playingOnly: true });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.list-playlists', { playingOnly: true });
  });

  it('forwards play by playlist reference', async () => {
    const { tools, query } = makeTools();
    await tools.handleManagePlaylists({ action: 'play', playlist: 'Battle Themes' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.play-playlist', {
      playlist: 'Battle Themes',
    });
  });

  it('forwards play-sound with both playlist and track', async () => {
    const { tools, query } = makeTools();
    await tools.handleManagePlaylists({
      action: 'play-sound',
      playlist: 'Battle Themes',
      sound: 'Marine Assault',
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.play-playlist-sound', {
      playlist: 'Battle Themes',
      sound: 'Marine Assault',
    });
  });

  it('sends an empty payload for stop-all, ignoring stray args', async () => {
    const { tools, query } = makeTools();
    await tools.handleManagePlaylists({ action: 'stop-all', playlist: 'ignored' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.stop-all-playlists', {});
  });

  it('forwards create with its sounds', async () => {
    const { tools, query } = makeTools();
    await tools.handleManagePlaylists({
      action: 'create',
      name: 'Grand Line',
      mode: 'shuffle',
      sounds: [{ name: 'Sailing', path: 'sounds/sail.ogg' }],
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.create-playlist', {
      name: 'Grand Line',
      mode: 'shuffle',
      sounds: [{ name: 'Sailing', path: 'sounds/sail.ogg' }],
    });
  });

  it('rejects play without a playlist before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManagePlaylists({ action: 'play' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an invalid playback mode before querying', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleManagePlaylists({ action: 'set-mode', playlist: 'X', mode: 'random' })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unknown action before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManagePlaylists({ action: 'pause' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
