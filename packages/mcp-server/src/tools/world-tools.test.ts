/**
 * Core world tools — schema advertisement + bridge query-forwarding tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { WorldTools } from './world-tools.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new WorldTools({ foundryClient, logger });
  return { tools, query };
}

describe('WorldTools.getToolDefinitions', () => {
  it('advertises the three core world tools', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(d => d.name);
    expect(names).toEqual(['advance-game-time', 'get-game-time', 'ping-location']);
  });
});

describe('WorldTools forwarding', () => {
  it('forwards advance-game-time params to the bridge', async () => {
    const { tools, query } = makeTools();
    await tools.handleAdvanceGameTime({ amount: 10, unit: 'minutes' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.advance-game-time', {
      amount: 10,
      unit: 'minutes',
    });
  });

  it('rejects a non-positive amount before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleAdvanceGameTime({ amount: 0, unit: 'hours' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('forwards get-game-time with an empty payload', async () => {
    const { tools, query } = makeTools();
    await tools.handleGetGameTime({});
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-game-time', {});
  });

  it('forwards ping-location by token', async () => {
    const { tools, query } = makeTools();
    await tools.handlePingLocation({ token: 'Hero', pull: true });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.ping-location', {
      token: 'Hero',
      pull: true,
    });
  });

  it('forwards ping-location by coordinates', async () => {
    const { tools, query } = makeTools();
    await tools.handlePingLocation({ x: 100, y: 200 });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.ping-location', { x: 100, y: 200 });
  });

  it('rejects a partial coordinate + token mix', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handlePingLocation({ x: 100, token: 'Hero' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
