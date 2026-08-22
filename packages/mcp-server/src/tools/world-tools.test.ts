/**
 * manage-time — schema advertisement + bridge query-forwarding tests.
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
  it('advertises a single manage-time tool', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(d => d.name);
    expect(names).toEqual(['manage-time']);
  });

  it('requires an action and offers get and advance', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.required).toEqual(['action']);
    expect(def.inputSchema.properties.action.enum).toEqual(['get', 'advance']);
  });
});

describe('manage-time forwarding', () => {
  it('forwards advance params to the bridge', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageTime({ action: 'advance', amount: 10, unit: 'minutes' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.advance-game-time', {
      amount: 10,
      unit: 'minutes',
    });
  });

  it('rejects a non-positive amount before querying', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleManageTime({ action: 'advance', amount: 0, unit: 'hours' })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects advance without a unit before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageTime({ action: 'advance', amount: 10 })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('forwards get with an empty payload', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageTime({ action: 'get' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-game-time', {});
  });

  it('rejects an unknown action before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageTime({ action: 'set' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
