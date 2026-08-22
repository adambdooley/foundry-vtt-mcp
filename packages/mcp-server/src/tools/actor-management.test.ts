/**
 * manage-actors damage/heal — the system-aware HP actions folded in from the
 * former apply-damage / apply-healing tools.
 */

import { describe, it, expect, vi } from 'vitest';
import { ActorManagementTools } from './actor-management.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new ActorManagementTools({ foundryClient, logger });
  return { tools, query };
}

describe('manage-actors schema', () => {
  it('advertises damage and heal alongside the CRUD actions', () => {
    const [def] = makeTools().tools.getToolDefinitions();
    expect(def.inputSchema.properties.action.enum).toEqual([
      'create',
      'update',
      'delete',
      'update-items',
      'delete-items',
      'damage',
      'heal',
      'describe',
    ]);
  });
});

describe('manage-actors damage/heal forwarding', () => {
  it('forwards damage params to the bridge', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageActors({
      action: 'damage',
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
    await expect(
      tools.handleManageActors({ action: 'damage', targets: ['Goblin'], amount: -1 })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects damage with no targets before querying', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleManageActors({ action: 'damage', targets: [], amount: 5 })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('forwards heal params to the bridge', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageActors({ action: 'heal', targets: ['Hero'], amount: 5 });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.apply-healing', {
      targets: ['Hero'],
      amount: 5,
    });
  });

  it('does not pass damage-only fields through the heal path', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageActors({
      action: 'heal',
      targets: ['Hero'],
      amount: 5,
      damageType: 'fire',
      half: true,
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.apply-healing', {
      targets: ['Hero'],
      amount: 5,
    });
  });
});
