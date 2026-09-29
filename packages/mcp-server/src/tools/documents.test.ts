import { describe, expect, it, vi } from 'vitest';
import { DocumentTools } from './documents.js';

function makeTools(query = vi.fn().mockResolvedValue({ success: true })) {
  const logger: any = { info: vi.fn(), error: vi.fn(), child: () => logger };
  const tools = new DocumentTools({ foundryClient: { query } as any, logger });
  return { tools, query, logger };
}

describe('DocumentTools', () => {
  it('defines exactly the tools it handles', () => {
    const { tools } = makeTools();
    const names = tools.getToolDefinitions().map(t => t.name);
    expect(names).toEqual(DocumentTools.TOOL_NAMES);
    for (const def of tools.getToolDefinitions()) {
      expect(def.inputSchema.type).toBe('object');
      expect(def.description.length).toBeGreaterThan(20);
    }
  });

  it('forwards calls to the bridge query of the same name', async () => {
    const { tools, query } = makeTools();
    await tools.handle('get-document', { uuid: 'Actor.abc' });
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-document', { uuid: 'Actor.abc' });
  });

  it('sends an empty object when no arguments are given', async () => {
    const { tools, query } = makeTools();
    await tools.handle('get-settings', undefined);
    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-settings', {});
  });

  it('rejects unknown tool names without calling Foundry', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handle('drop-database', {})).rejects.toThrow('Unknown document tool');
    expect(query).not.toHaveBeenCalled();
  });

  it('wraps bridge errors with the tool name', async () => {
    const { tools, logger } = makeTools(vi.fn().mockRejectedValue(new Error('GM only')));
    await expect(tools.handle('run-script', { code: 'return 1' })).rejects.toThrow(
      'run-script failed: GM only'
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
