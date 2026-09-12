import { describe, expect, it, vi } from 'vitest';
import { DiceRollTools } from './dice-roll.js';

function makeTools(response: any = { success: true }) {
  const query = vi.fn(async () => response);
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  return { tools: new DiceRollTools({ foundryClient, logger }), query };
}

describe('DiceRollTools definitions', () => {
  it('advertises direct and readable roll tools', () => {
    const names = makeTools()
      .tools.getToolDefinitions()
      .map(def => def.name);
    expect(names).toEqual([
      'roll-dice',
      'get-recent-rolls',
      'get-roll-result',
      'request-player-rolls',
    ]);
  });
});

describe('DiceRollTools direct rolls', () => {
  it('forwards an explicitly visible roll', async () => {
    const response = { success: true, roll: { chatMessageId: 'm1', total: 17 } };
    const { tools, query } = makeTools(response);
    const result = await tools.handleRollDice({
      formula: '1d20 + 5',
      flavor: 'Perception',
      actorIdentifier: 'Aragorn',
      visibility: 'public',
      userConfirmedVisibility: true,
    });

    expect(result).toEqual(response);
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.roll-dice', {
      formula: '1d20 + 5',
      flavor: 'Perception',
      actorIdentifier: 'Aragorn',
      visibility: 'public',
      userConfirmedVisibility: true,
    });
  });

  it('rejects a roll without confirmed visibility', async () => {
    const { tools, query } = makeTools();
    const result = await tools.handleRollDice({ formula: '1d20', visibility: 'public' });
    expect(result.success).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('DiceRollTools roll reads', () => {
  it('reads recent rolls with defaults', async () => {
    const { tools, query } = makeTools({ success: true, rolls: [] });
    await tools.handleGetRecentRolls({});
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-recent-rolls', {
      limit: 20,
    });
  });

  it('requires a chat message ID for exact lookup', async () => {
    const { tools, query } = makeTools();
    const result = await tools.handleGetRollResult({});
    expect(result.success).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
