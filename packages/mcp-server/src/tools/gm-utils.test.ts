/**
 * gm-utils — schema advertisement + bridge query-forwarding tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { GmUtilsTools } from './gm-utils.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new GmUtilsTools({ foundryClient, logger });
  return { tools, query };
}

describe('GmUtilsTools.getToolDefinitions', () => {
  it('advertises a single gm-utils tool', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(d => d.name);
    expect(names).toEqual(['gm-utils']);
  });

  it('requires an action and offers ping and play-sound', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.required).toEqual(['action']);
    expect(def.inputSchema.properties.action.enum).toEqual(['ping', 'play-sound']);
  });
});

describe('gm-utils ping forwarding', () => {
  it('forwards a ping by token', async () => {
    const { tools, query } = makeTools();
    await tools.handleGmUtils({ action: 'ping', token: 'Hero', pull: true });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.ping-location', {
      token: 'Hero',
      pull: true,
    });
  });

  it('forwards a ping by coordinates', async () => {
    const { tools, query } = makeTools();
    await tools.handleGmUtils({ action: 'ping', x: 100, y: 200 });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.ping-location', { x: 100, y: 200 });
  });

  it('rejects a partial coordinate + token mix', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleGmUtils({ action: 'ping', x: 100, token: 'Hero' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('gm-utils play-sound forwarding', () => {
  it('forwards play-sound params to the bridge', async () => {
    const { tools, query } = makeTools();
    await tools.handleGmUtils({
      action: 'play-sound',
      file: 'sounds/cannon.ogg',
      volume: 0.5,
      forEveryone: false,
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.play-sound', {
      file: 'sounds/cannon.ogg',
      volume: 0.5,
      forEveryone: false,
    });
  });

  it('rejects a missing file before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleGmUtils({ action: 'play-sound' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range volume', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleGmUtils({ action: 'play-sound', file: 'a.ogg', volume: 5 })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unknown action before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleGmUtils({ action: 'ping-location' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
