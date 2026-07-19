/**
 * Core combat tools — schema advertisement + bridge query-forwarding tests.
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
  it('advertises the seven core combat tools', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(d => d.name);
    expect(names).toEqual([
      'apply-damage',
      'apply-healing',
      'advance-turn',
      'set-initiative',
      'apply-active-effect',
      'remove-active-effect',
      'get-combatant-status',
    ]);
  });

  it('requires targets and amount for apply-damage', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.required).toEqual(['targets', 'amount']);
  });
});

describe('CombatTools forwarding', () => {
  it('forwards apply-damage params to the bridge', async () => {
    const { tools, query } = makeTools();
    await tools.handleApplyDamage({
      targets: ['Goblin'],
      amount: 7,
      damageType: 'fire',
      half: true,
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.apply-damage', {
      targets: ['Goblin'],
      amount: 7,
      damageType: 'fire',
      half: true,
    });
  });

  it('rejects non-positive damage amounts before querying', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleApplyDamage({ targets: ['Goblin'], amount: -1 })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('forwards apply-healing params to the bridge', async () => {
    const { tools, query } = makeTools();
    await tools.handleApplyHealing({ targets: ['Hero'], amount: 5 });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.apply-healing', {
      targets: ['Hero'],
      amount: 5,
    });
  });

  it('defaults advance-turn direction to undefined (bridge applies next-turn)', async () => {
    const { tools, query } = makeTools();
    await tools.handleAdvanceTurn({});
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.advance-turn', { direction: undefined });
  });

  it('forwards set-initiative with an explicit value', async () => {
    const { tools, query } = makeTools();
    await tools.handleSetInitiative({ combatant: 'Goblin', value: 15 });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.set-initiative', {
      combatant: 'Goblin',
      value: 15,
    });
  });

  it('forwards a condition on apply-active-effect', async () => {
    const { tools, query } = makeTools();
    await tools.handleApplyActiveEffect({ actor: 'Hero', condition: 'prone' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.apply-active-effect', {
      actor: 'Hero',
      condition: 'prone',
    });
  });

  it('rejects apply-active-effect with both condition and effect', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleApplyActiveEffect({ actor: 'Hero', condition: 'prone', effect: { label: 'X' } })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('forwards remove-active-effect', async () => {
    const { tools, query } = makeTools();
    await tools.handleRemoveActiveEffect({ actor: 'Hero', effect: 'prone' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.remove-active-effect', {
      actor: 'Hero',
      effect: 'prone',
    });
  });

  it('forwards get-combatant-status for a single actor', async () => {
    const { tools, query } = makeTools();
    await tools.handleGetCombatantStatus({ actor: 'Hero' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-combatant-status', {
      actor: 'Hero',
    });
  });

  it('rejects get-combatant-status with neither actor nor all', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleGetCombatantStatus({})).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
