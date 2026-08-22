/**
 * manage-chat — schema advertisement + bridge query-forwarding tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { ChatTools } from './chat-tools.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new ChatTools({ foundryClient, logger });
  return { tools, query };
}

describe('ChatTools.getToolDefinitions', () => {
  it('advertises a single manage-chat tool', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(d => d.name);
    expect(names).toEqual(['manage-chat']);
  });

  it('requires an action and offers post, roll, and draw-table', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.required).toEqual(['action']);
    expect(def.inputSchema.properties.action.enum).toEqual(['post', 'roll', 'draw-table']);
  });
});

describe('manage-chat forwarding', () => {
  it('defaults post style to ooc', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageChat({ action: 'post', content: 'The Marines arrive.' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.post-chat-message', {
      content: 'The Marines arrive.',
      style: 'ooc',
    });
  });

  it('forwards a whispered post with its recipients', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageChat({
      action: 'post',
      content: 'psst',
      style: 'whisper',
      whisperTo: ['Nami'],
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.post-chat-message', {
      content: 'psst',
      style: 'whisper',
      whisperTo: ['Nami'],
    });
  });

  it('forwards a roll formula with flavor', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageChat({ action: 'roll', formula: '2d6+3', flavor: 'Sanji kicks' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.roll-dice', {
      formula: '2d6+3',
      flavor: 'Sanji kicks',
    });
  });

  it('defaults draw-table to a single displayed draw', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageChat({ action: 'draw-table', table: 'Loot' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.draw-roll-table', {
      table: 'Loot',
      rolls: 1,
      displayChat: true,
    });
  });

  it('rejects a draw count above the cap before querying', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleManageChat({ action: 'draw-table', table: 'Loot', rolls: 50 })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects post without content before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageChat({ action: 'post' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unknown action before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageChat({ action: 'whisper' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
