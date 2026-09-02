/**
 * Raw actor tool tests.
 *
 * The Foundry side runs browser-side, so these cover the MCP tool layer: schemas
 * are advertised, validated arguments reach the right raw.* bridge query, and the
 * inline response limit fires when a payload is too large to hand back directly.
 */

import { describe, it, expect, vi } from 'vitest';
import { RawActorTools, MAX_INLINE_RESPONSE_CHARS } from './raw-actor.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ ok: true })));
  const logger: any = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger };
  const foundryClient: any = { query };
  return { tools: new RawActorTools({ foundryClient, logger }), query };
}

describe('RawActorTools definitions', () => {
  it('advertises all seven tools with object input schemas', () => {
    const { tools } = makeTools();
    const defs = tools.getToolDefinitions();

    expect(defs.map(d => d.name)).toEqual([
      'import-actor',
      'export-actor',
      'manage-compendium',
      'manage-actor-items',
      'update-actor-raw',
      'run-script',
      'bridge-info',
    ]);
    for (const def of defs) {
      expect(def.inputSchema.type).toBe('object');
    }
  });

  it('tells clients import-actor takes full actor source with activities', () => {
    const { tools } = makeTools();
    const def = tools.getToolDefinitions().find(d => d.name === 'import-actor');

    expect(def!.description).toContain(
      'full Foundry actor source including items with activities; the recommended way to create ' +
        'monsters with legendary actions, recharge, templates and spell links'
    );
  });

  it('advertises the file-backed arguments so clients can pass them', () => {
    const { tools } = makeTools();
    const byName = Object.fromEntries(tools.getToolDefinitions().map(d => [d.name, d]));

    expect(byName['import-actor'].inputSchema.properties.filePath).toBeDefined();
    expect(byName['export-actor'].inputSchema.properties.outFile).toBeDefined();
    expect(byName['manage-actor-items'].inputSchema.properties.filePath).toBeDefined();
    expect(byName['update-actor-raw'].inputSchema.properties.filePath).toBeDefined();
    expect(byName['run-script'].inputSchema.properties.scriptFile).toBeDefined();
  });
});

describe('import-actor', () => {
  it('forwards actors with replace and keepId defaults applied', async () => {
    const { tools, query } = makeTools();

    await tools.handleImportActor({
      actors: [{ name: 'Goblin Boss', type: 'npc', items: [{ name: 'Клинок' }] }],
      destination: { type: 'pack', pack: 'world.my-bestiary' },
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.raw.importActors', {
      actors: [{ name: 'Goblin Boss', type: 'npc', items: [{ name: 'Клинок' }] }],
      destination: { type: 'pack', pack: 'world.my-bestiary' },
      replace: 'byName',
      keepId: false,
    });
  });

  it('keeps unknown actor fields such as system and prototypeToken', async () => {
    const { tools, query } = makeTools();
    const actor = {
      name: 'Goblin Boss',
      type: 'npc',
      system: { attributes: { hp: { max: 120 } } },
      prototypeToken: { name: 'Goblin Boss' },
    };

    await tools.handleImportActor({ actors: [actor], destination: { type: 'world' } });

    expect(query.mock.calls[0][1].actors[0]).toEqual(actor);
  });

  it('rejects a pack destination with no pack', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleImportActor({
        actors: [{ name: 'A', type: 'npc' }],
        destination: { type: 'pack' },
      })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects more than 50 actors', async () => {
    const { tools, query } = makeTools();
    const actors = Array.from({ length: 51 }, (_, i) => ({ name: `A${i}`, type: 'npc' }));

    await expect(
      tools.handleImportActor({ actors, destination: { type: 'world' } })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('export-actor', () => {
  it('forwards the identifier and optional pack', async () => {
    const { tools, query } = makeTools();

    await tools.handleExportActor({ actorIdentifier: 'Goblin Boss', pack: 'world.my-bestiary' });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.raw.exportActor', {
      actorIdentifier: 'Goblin Boss',
      pack: 'world.my-bestiary',
    });
  });

  it('refuses an oversized payload when no outFile is given', async () => {
    const big = { data: 'x'.repeat(MAX_INLINE_RESPONSE_CHARS + 10) };
    const { tools } = makeTools(async () => big);

    await expect(tools.handleExportActor({ actorIdentifier: 'Goblin Boss' })).rejects.toThrow(
      /over the 200000 character response limit/
    );
  });

  it('allows an oversized payload when outFile is given', async () => {
    const big = { data: 'x'.repeat(MAX_INLINE_RESPONSE_CHARS + 10) };
    const { tools } = makeTools(async () => big);

    await expect(
      tools.handleExportActor({ actorIdentifier: 'Goblin Boss', outFile: '/tmp/ozhog.json' })
    ).resolves.toBe(big);
  });
});

describe('manage-compendium', () => {
  it('requires a pack for pack-scoped actions', async () => {
    const { tools, query } = makeTools();

    await expect(tools.handleManageCompendium({ action: 'contents' })).rejects.toThrow(
      /requires "pack"/
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('requires a label for create', async () => {
    const { tools } = makeTools();

    await expect(tools.handleManageCompendium({ action: 'create' })).rejects.toThrow(
      /requires "label"/
    );
  });

  it('requires ids or names for delete-entries', async () => {
    const { tools } = makeTools();

    await expect(
      tools.handleManageCompendium({ action: 'delete-entries', pack: 'world.my-bestiary' })
    ).rejects.toThrow(/requires "entryIds" or "entryNames"/);
  });

  it('forwards a valid create call', async () => {
    const { tools, query } = makeTools();

    await tools.handleManageCompendium({
      action: 'create',
      label: 'My Bestiary',
      documentType: 'Actor',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.raw.manageCompendium', {
      action: 'create',
      label: 'My Bestiary',
      documentType: 'Actor',
    });
  });
});

describe('manage-actor-items', () => {
  it('passes dotted keys and deletions through verbatim', async () => {
    const { tools, query } = makeTools();
    const updates = [{ _id: 'abc123', 'system.uses.max': '3', 'system.activities.-=def456': null }];

    await tools.handleManageActorItems({
      actorIdentifier: 'Goblin Boss',
      action: 'update-raw',
      updates,
    });

    expect(query.mock.calls[0][1].updates).toEqual(updates);
  });

  it('rejects update-raw without updates', async () => {
    const { tools, query } = makeTools();

    await expect(
      tools.handleManageActorItems({ actorIdentifier: 'Goblin Boss', action: 'update-raw' })
    ).rejects.toThrow(/requires "updates" or "filePath"/);
    expect(query).not.toHaveBeenCalled();
  });

  it('applies the inline response limit to list', async () => {
    const { tools } = makeTools(async () => ({ items: 'x'.repeat(MAX_INLINE_RESPONSE_CHARS) }));

    await expect(
      tools.handleManageActorItems({ actorIdentifier: 'Goblin Boss', action: 'list' })
    ).rejects.toThrow(/response limit/);
  });
});

describe('update-actor-raw', () => {
  it('forwards the update object unchanged', async () => {
    const { tools, query } = makeTools();
    const update = { 'system.attributes.hp.max': 120, 'system.details.-=cr': null };

    await tools.handleUpdateActorRaw({ actorIdentifier: 'Goblin Boss', update });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.raw.updateActor', {
      actorIdentifier: 'Goblin Boss',
      update,
    });
  });

  it('rejects an empty update', async () => {
    const { tools } = makeTools();

    await expect(
      tools.handleUpdateActorRaw({ actorIdentifier: 'Goblin Boss', update: {} })
    ).rejects.toThrow(/at least one key/);
  });
});

describe('run-script and bridge-info', () => {
  it('forwards script, args and timeout', async () => {
    const { tools, query } = makeTools();

    await tools.handleRunScript({
      script: 'return game.actors.size;',
      args: { a: 1 },
      timeoutMs: 5000,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.raw.runScript', {
      script: 'return game.actors.size;',
      args: { a: 1 },
      timeoutMs: 5000,
    });
  });

  it('rejects an empty script', async () => {
    const { tools } = makeTools();

    await expect(tools.handleRunScript({ script: '' })).rejects.toThrow();
  });

  it('queries bridge info with an empty payload', async () => {
    const { tools, query } = makeTools();

    await tools.handleBridgeInfo({});

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.raw.bridgeInfo', {});
  });
});
