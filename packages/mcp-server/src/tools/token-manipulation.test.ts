/**
 * toggle-token-condition effect actions and get-token-details status modes —
 * the paths folded in from the former apply-active-effect,
 * remove-active-effect, and get-combatant-status tools.
 */

import { describe, it, expect, vi } from 'vitest';
import { TokenManipulationTools } from './token-manipulation.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new TokenManipulationTools({ foundryClient, logger });
  return { tools, query };
}

function definitionFor(name: string) {
  return makeTools()
    .tools.getToolDefinitions()
    .find(d => d.name === name)!;
}

describe('toggle-token-condition schema', () => {
  it('offers toggle plus the two effect actions', () => {
    const def = definitionFor('toggle-token-condition');
    expect(def.inputSchema.properties.action.enum).toEqual([
      'toggle',
      'apply-effect',
      'remove-effect',
    ]);
  });

  it('no longer requires conditionId, so the effect actions can omit it', () => {
    const def = definitionFor('toggle-token-condition');
    expect(def.inputSchema.required).toEqual(['tokenId']);
  });
});

describe('toggle-token-condition routing', () => {
  it('defaults to the status-effect toggle when no action is given', async () => {
    const { tools, query } = makeTools();
    await tools.handleToggleTokenCondition({ tokenId: 'tok1', conditionId: 'prone' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.toggle-token-condition', {
      tokenId: 'tok1',
      conditionId: 'prone',
      active: undefined,
    });
  });

  it('forwards a custom effect on apply-effect', async () => {
    const { tools, query } = makeTools();
    await tools.handleToggleTokenCondition({
      action: 'apply-effect',
      tokenId: 'Hero',
      effect: {
        label: 'Haki Armament',
        changes: [{ key: 'system.attributes.ac.bonus', value: 2 }],
        duration: { rounds: 3 },
      },
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.apply-active-effect', {
      actor: 'Hero',
      effect: {
        label: 'Haki Armament',
        changes: [{ key: 'system.attributes.ac.bonus', value: 2 }],
        duration: { rounds: 3 },
      },
    });
  });

  it('rejects apply-effect without an effect definition', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleToggleTokenCondition({ action: 'apply-effect', tokenId: 'Hero' })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('forwards remove-effect by name', async () => {
    const { tools, query } = makeTools();
    await tools.handleToggleTokenCondition({
      action: 'remove-effect',
      tokenId: 'Hero',
      effectName: 'prone',
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.remove-active-effect', {
      actor: 'Hero',
      effect: 'prone',
    });
  });

  it('rejects remove-effect without an effect name', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleToggleTokenCondition({ action: 'remove-effect', tokenId: 'Hero' })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('get-token-details routing', () => {
  it('reads the token document for tokenId', async () => {
    const { tools, query } = makeTools(async () => ({ id: 'tok1', name: 'Hero' }));
    await tools.handleGetTokenDetails({ tokenId: 'tok1' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-token-details', {
      tokenId: 'tok1',
    });
  });

  it('reads combatant status for a single actor', async () => {
    const { tools, query } = makeTools();
    await tools.handleGetTokenDetails({ actor: 'Hero' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-combatant-status', {
      actor: 'Hero',
      all: undefined,
    });
  });

  it('reads combatant status for the whole encounter', async () => {
    const { tools, query } = makeTools();
    await tools.handleGetTokenDetails({ all: true });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-combatant-status', {
      actor: undefined,
      all: true,
    });
  });

  it('rejects a combined tokenId + all request', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleGetTokenDetails({ tokenId: 'tok1', all: true })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a request naming no target at all', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleGetTokenDetails({})).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
