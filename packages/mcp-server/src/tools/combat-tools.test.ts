/**
 * manage-combat — schema advertisement + bridge query-forwarding tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { CombatTools } from './combat-tools.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new CombatTools({ foundryClient, logger });
  return { tools, query };
}

describe('CombatTools.getToolDefinitions', () => {
  it('advertises a single manage-combat tool', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(d => d.name);
    expect(names).toEqual(['manage-combat']);
  });

  it('requires an action and offers advance-turn and set-initiative', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.required).toEqual(['action']);
    expect(def.inputSchema.properties.action.enum).toEqual(['advance-turn', 'set-initiative']);
  });
});

describe('manage-combat forwarding', () => {
  it('defaults advance-turn direction to undefined (bridge applies next-turn)', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageCombat({ action: 'advance-turn' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.advance-turn', { direction: undefined });
  });

  it('forwards an explicit advance-turn direction', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageCombat({ action: 'advance-turn', direction: 'previous-turn' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.advance-turn', {
      direction: 'previous-turn',
    });
  });

  it('forwards set-initiative with an explicit value', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageCombat({ action: 'set-initiative', combatant: 'Goblin', value: 15 });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.set-initiative', {
      combatant: 'Goblin',
      value: 15,
    });
  });

  it('omits the value so the bridge rolls initiative', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageCombat({ action: 'set-initiative', combatant: 'Goblin' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.set-initiative', {
      combatant: 'Goblin',
      value: undefined,
    });
  });

  it('rejects set-initiative without a combatant before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageCombat({ action: 'set-initiative' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unknown action before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageCombat({ action: 'apply-damage' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
