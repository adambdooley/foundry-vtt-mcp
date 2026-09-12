import { describe, expect, it, vi } from 'vitest';
import { CombatTools } from './combat.js';

function makeTools(response: any = { success: true }) {
  const query = vi.fn(async () => response);
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  return { tools: new CombatTools({ foundryClient, logger }), query };
}

describe('CombatTools definitions', () => {
  it('advertises read and mutation tools', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(def => def.name);
    expect(names).toEqual(['get-combat-state', 'manage-combat']);
  });
});

describe('CombatTools validation', () => {
  it('forwards a normal turn advance', async () => {
    const response = { success: true, action: 'next-turn' };
    const { tools, query } = makeTools(response);
    const result = await tools.handleManageCombat({ action: 'next-turn', combatId: 'c1' });
    expect(result).toEqual(response);
    expect(query).toHaveBeenCalledWith(
      'foundry-mcp-bridge.manage-combat',
      expect.objectContaining({ action: 'next-turn', combatId: 'c1' })
    );
  });

  it('requires token identifiers when adding combatants', async () => {
    const { tools, query } = makeTools();
    const result = await tools.handleManageCombat({ action: 'add-combatants' });
    expect(result.success).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation for permanent deletion', async () => {
    const { tools, query } = makeTools();
    const result = await tools.handleManageCombat({ action: 'delete', combatId: 'c1' });
    expect(result.success).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts a confirmed delete', async () => {
    const { tools, query } = makeTools({ success: true, deletedCombatId: 'c1' });
    await tools.handleManageCombat({ action: 'delete', combatId: 'c1', confirmDelete: true });
    expect(query).toHaveBeenCalled();
  });
});
