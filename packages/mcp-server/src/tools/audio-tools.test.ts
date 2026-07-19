/**
 * Core audio tool — schema advertisement + bridge query-forwarding tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { AudioTools } from './audio-tools.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new AudioTools({ foundryClient, logger });
  return { tools, query };
}

describe('AudioTools.getToolDefinitions', () => {
  it('advertises play-sound with a required file', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.name).toBe('play-sound');
    expect(def.inputSchema.required).toEqual(['file']);
  });
});

describe('AudioTools forwarding', () => {
  it('forwards play-sound params to the bridge', async () => {
    const { tools, query } = makeTools();
    await tools.handlePlaySound({ file: 'sounds/cannon.ogg', volume: 0.5, forEveryone: false });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.play-sound', {
      file: 'sounds/cannon.ogg',
      volume: 0.5,
      forEveryone: false,
    });
  });

  it('rejects a missing file before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handlePlaySound({})).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range volume', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handlePlaySound({ file: 'a.ogg', volume: 5 })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
