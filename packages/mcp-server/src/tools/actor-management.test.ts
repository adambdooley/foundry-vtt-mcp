/**
 * manage-actors "place" action tests.
 *
 * The token placement itself runs browser-side (data-access.addActorsToScene),
 * so these cover the MCP tool layer: the action is advertised, and a valid call
 * forwards to the existing GM-gated addActorsToScene bridge query with defaults
 * applied.
 */

import { describe, it, expect, vi } from 'vitest';
import { ActorManagementTools } from './actor-management.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true, created: [] })));
  const logger: any = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  const tools = new ActorManagementTools({ foundryClient, logger });
  return { tools, query };
}

describe('manage-actors place action', () => {
  it('advertises "place" in the action enum', () => {
    const { tools } = makeTools();
    const def = tools.getToolDefinitions()[0];
    const actionEnum = def.inputSchema.properties.action.enum;
    expect(actionEnum).toContain('place');
  });

  it('forwards to addActorsToScene with the given ids and options', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageActors({
      action: 'place',
      actorIds: ['abc', 'def'],
      placement: 'grid',
      hidden: true,
    });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.addActorsToScene', {
      actorIds: ['abc', 'def'],
      placement: 'grid',
      hidden: true,
    });
  });

  it('defaults placement to random and hidden to false', async () => {
    const { tools, query } = makeTools();
    await tools.handleManageActors({ action: 'place', actorIds: ['abc'] });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.addActorsToScene', {
      actorIds: ['abc'],
      placement: 'random',
      hidden: false,
    });
  });

  it('rejects a place call with no actorIds', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleManageActors({ action: 'place', actorIds: [] })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
