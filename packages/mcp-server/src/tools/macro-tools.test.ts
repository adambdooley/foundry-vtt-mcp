/**
 * manage-macros — schema advertisement + bridge query-forwarding tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { MacroTools } from './macro-tools.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new MacroTools({ foundryClient, logger });
  return { tools, query };
}

describe('MacroTools.getToolDefinitions', () => {
  it('advertises a single manage-macros tool', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(d => d.name);
    expect(names).toEqual(['manage-macros']);
  });

  it('requires an action and offers create, list, and delete', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.required).toEqual(['action']);
    expect(def.inputSchema.properties.action.enum).toEqual(['create', 'list', 'delete']);
  });
});

describe('manage-macros forwarding', () => {
  it('defaults a created macro to the chat type', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageMacros({
      action: 'create',
      name: 'Cannon Volley',
      command: '/roll 2d6+3',
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.create-macro', {
      name: 'Cannon Volley',
      type: 'chat',
      command: '/roll 2d6+3',
    });
  });

  it('forwards a hotbar slot when given', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageMacros({
      action: 'create',
      name: 'Gum Gum',
      command: 'console.log(1)',
      type: 'script',
      hotbarSlot: 3,
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.create-macro', {
      name: 'Gum Gum',
      type: 'script',
      command: 'console.log(1)',
      hotbarSlot: 3,
    });
  });

  it('rejects a hotbar slot outside 1 to 50 before querying', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleManageMacros({ action: 'create', name: 'X', command: 'y', hotbarSlot: 99 })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('forwards a list search filter', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageMacros({ action: 'list', search: 'cannon' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.list-macros', { search: 'cannon' });
  });

  it('forwards a delete by reference', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageMacros({ action: 'delete', macro: 'Cannon Volley' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.delete-macro', {
      macro: 'Cannon Volley',
    });
  });

  it('rejects create without a command before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageMacros({ action: 'create', name: 'X' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unknown action before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageMacros({ action: 'execute' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
