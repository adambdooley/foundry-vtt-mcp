/**
 * Tests for the wrapper-side file hydration (src/tool-files.ts).
 *
 * These run against real temporary files: the whole point of the module is that
 * the stdio wrapper - not the backend - touches the filesystem, so mocking fs
 * would test nothing worth testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { hydrateToolArgs, dehydrateToolResult, toolErrorResult } from './tool-files.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-files-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(fileName: string, content: unknown): string {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(
    filePath,
    typeof content === 'string' ? content : JSON.stringify(content),
    'utf8'
  );
  return filePath;
}

function expectOk(outcome: ReturnType<typeof hydrateToolArgs>): Record<string, any> {
  if (!outcome.ok) throw new Error(`expected hydration to succeed, got: ${outcome.error}`);
  return outcome.args;
}

function expectError(outcome: ReturnType<typeof hydrateToolArgs>): string {
  if (outcome.ok) throw new Error('expected hydration to fail, but it succeeded');
  return outcome.error;
}

// ── import-actor ──────────────────────────────────────────────────────────────

describe('hydrateToolArgs: import-actor', () => {
  const destination = { type: 'world', folder: 'Imported Actors' };

  it('reads a single actor object into a one-element actors array', () => {
    const filePath = writeFixture('one.json', { name: 'Goblin Boss', type: 'npc' });

    const args = expectOk(hydrateToolArgs('import-actor', { filePath, destination }));

    expect(args.actors).toEqual([{ name: 'Goblin Boss', type: 'npc' }]);
    expect(args.filePath).toBeUndefined();
    expect(args.destination).toEqual(destination);
  });

  it('reads an array of actors as is', () => {
    const filePath = writeFixture('many.json', [
      { name: 'Hookwolf', type: 'npc' },
      { name: 'Mannequin', type: 'npc' },
    ]);

    const args = expectOk(hydrateToolArgs('import-actor', { filePath, destination }));

    expect(args.actors).toHaveLength(2);
    expect(args.actors[1].name).toBe('Mannequin');
  });

  it('leaves inline actors untouched', () => {
    const actors = [{ name: 'Siberian', type: 'npc' }];

    const args = expectOk(hydrateToolArgs('import-actor', { actors, destination }));

    expect(args.actors).toBe(actors);
  });

  it('rejects both actors and filePath', () => {
    const filePath = writeFixture('one.json', { name: 'Goblin Boss', type: 'npc' });

    const error = expectError(
      hydrateToolArgs('import-actor', {
        actors: [{ name: 'Goblin Boss', type: 'npc' }],
        filePath,
        destination,
      })
    );

    expect(error).toMatch(/exactly one of "actors" or "filePath"/);
  });

  it('rejects neither actors nor filePath', () => {
    const error = expectError(hydrateToolArgs('import-actor', { destination }));

    expect(error).toMatch(/requires either "actors" or "filePath"/);
  });

  it('reports a missing file instead of throwing', () => {
    const missing = path.join(tmpDir, 'nope.json');

    const error = expectError(hydrateToolArgs('import-actor', { filePath: missing, destination }));

    expect(error).toContain('Cannot read "filePath" file');
    expect(error).toContain(missing);
  });

  it('reports malformed JSON', () => {
    const filePath = writeFixture('broken.json', '{ "name": ');

    const error = expectError(hydrateToolArgs('import-actor', { filePath, destination }));

    expect(error).toContain('Cannot parse JSON');
  });

  it('rejects a JSON scalar', () => {
    const filePath = writeFixture('scalar.json', '42');

    const error = expectError(hydrateToolArgs('import-actor', { filePath, destination }));

    expect(error).toMatch(/must hold a JSON object or an array of JSON objects/);
  });

  it('rejects an array with a non-object entry', () => {
    const filePath = writeFixture('mixed.json', [{ name: 'Goblin Boss', type: 'npc' }, 'nope']);

    const error = expectError(hydrateToolArgs('import-actor', { filePath, destination }));

    expect(error).toContain('non-object entry at index 1');
  });
});

// ── manage-actor-items ────────────────────────────────────────────────────────

describe('hydrateToolArgs: manage-actor-items', () => {
  it('loads a file into "items" for action create', () => {
    const filePath = writeFixture('items.json', [{ name: 'Blade', type: 'weapon' }]);

    const args = expectOk(
      hydrateToolArgs('manage-actor-items', { actorIdentifier: 'Goblin Boss', action: 'create', filePath })
    );

    expect(args.items).toEqual([{ name: 'Blade', type: 'weapon' }]);
    expect(args.updates).toBeUndefined();
    expect(args.filePath).toBeUndefined();
  });

  it('loads a file into "updates" for action update-raw', () => {
    const filePath = writeFixture('updates.json', { _id: 'abc', 'system.uses.max': '3' });

    const args = expectOk(
      hydrateToolArgs('manage-actor-items', {
        actorIdentifier: 'Goblin Boss',
        action: 'update-raw',
        filePath,
      })
    );

    expect(args.updates).toEqual([{ _id: 'abc', 'system.uses.max': '3' }]);
    expect(args.filePath).toBeUndefined();
  });

  it('rejects filePath for actions that take no payload', () => {
    const filePath = writeFixture('items.json', [{ name: 'Blade' }]);

    const error = expectError(
      hydrateToolArgs('manage-actor-items', { actorIdentifier: 'Goblin Boss', action: 'list', filePath })
    );

    expect(error).toMatch(/applies to action "create" or "update-raw" only/);
  });

  it('rejects filePath alongside an inline payload', () => {
    const filePath = writeFixture('items.json', [{ name: 'Blade' }]);

    const error = expectError(
      hydrateToolArgs('manage-actor-items', {
        actorIdentifier: 'Goblin Boss',
        action: 'create',
        items: [{ name: 'Other' }],
        filePath,
      })
    );

    expect(error).toMatch(/exactly one of "items" or "filePath"/);
  });
});

// ── update-actor-raw ──────────────────────────────────────────────────────────

describe('hydrateToolArgs: update-actor-raw', () => {
  it('loads a JSON object into "update"', () => {
    const filePath = writeFixture('update.json', { 'system.attributes.hp.max': 120 });

    const args = expectOk(
      hydrateToolArgs('update-actor-raw', { actorIdentifier: 'Goblin Boss', filePath })
    );

    expect(args.update).toEqual({ 'system.attributes.hp.max': 120 });
    expect(args.filePath).toBeUndefined();
  });

  it('rejects an array payload', () => {
    const filePath = writeFixture('update.json', [{ 'system.attributes.hp.max': 120 }]);

    const error = expectError(
      hydrateToolArgs('update-actor-raw', { actorIdentifier: 'Goblin Boss', filePath })
    );

    expect(error).toMatch(/must hold a single JSON object/);
  });

  it('rejects both update and filePath', () => {
    const filePath = writeFixture('update.json', { name: 'Goblin Boss' });

    const error = expectError(
      hydrateToolArgs('update-actor-raw', {
        actorIdentifier: 'Goblin Boss',
        update: { name: 'Other' },
        filePath,
      })
    );

    expect(error).toMatch(/exactly one of "update" or "filePath"/);
  });
});

// ── run-script ────────────────────────────────────────────────────────────────

describe('hydrateToolArgs: run-script', () => {
  it('reads scriptFile into script verbatim', () => {
    const filePath = writeFixture('script.js', 'return game.actors.size;\n');

    const args = expectOk(hydrateToolArgs('run-script', { scriptFile: filePath }));

    expect(args.script).toBe('return game.actors.size;\n');
    expect(args.scriptFile).toBeUndefined();
  });

  it('rejects both script and scriptFile', () => {
    const filePath = writeFixture('script.js', 'return 1;');

    const error = expectError(
      hydrateToolArgs('run-script', { script: 'return 2;', scriptFile: filePath })
    );

    expect(error).toMatch(/exactly one of "script" or "scriptFile"/);
  });

  it('reports a missing script file', () => {
    const missing = path.join(tmpDir, 'gone.js');

    const error = expectError(hydrateToolArgs('run-script', { scriptFile: missing }));

    expect(error).toContain('Cannot read "scriptFile" file');
  });
});

// ── untouched tools ───────────────────────────────────────────────────────────

describe('hydrateToolArgs: tools without file arguments', () => {
  it('copies the args through unchanged', () => {
    const original = { actorIdentifier: 'Goblin Boss', pack: 'world.my-bestiary' };

    const args = expectOk(hydrateToolArgs('export-actor', original));

    expect(args).toEqual(original);
    expect(args).not.toBe(original);
  });

  it('tolerates undefined args', () => {
    expect(expectOk(hydrateToolArgs('bridge-info', undefined))).toEqual({});
  });
});

// ── dehydrateToolResult ───────────────────────────────────────────────────────

describe('dehydrateToolResult: export-actor', () => {
  const actorSource = { name: 'Goblin Boss', type: 'npc', items: [{ name: 'Blade' }] };

  function backendResult(payload: unknown) {
    return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
  }

  it('writes the actor source and returns a summary without data', () => {
    const outFile = path.join(tmpDir, 'nested', 'ozhog.json');
    const result = backendResult({
      uuid: 'Actor.abc',
      name: 'Goblin Boss',
      type: 'npc',
      itemCount: 1,
      data: actorSource,
    });

    const out = dehydrateToolResult('export-actor', { actorIdentifier: 'Goblin Boss', outFile }, result);
    const summary = JSON.parse(out.content[0].text);

    expect(summary).toEqual({
      uuid: 'Actor.abc',
      name: 'Goblin Boss',
      type: 'npc',
      itemCount: 1,
      bytes: summary.bytes,
      outFile,
    });
    expect(summary.data).toBeUndefined();

    const onDisk = fs.readFileSync(outFile, 'utf8');
    expect(JSON.parse(onDisk)).toEqual(actorSource);
    expect(onDisk).toContain('\n  "name"'); // pretty-printed with 2 spaces
    expect(summary.bytes).toBe(Buffer.byteLength(onDisk, 'utf8'));
  });

  it('passes the response through when no outFile is given', () => {
    const result = backendResult({ uuid: 'Actor.abc', data: actorSource });

    expect(dehydrateToolResult('export-actor', { actorIdentifier: 'Goblin Boss' }, result)).toBe(result);
  });

  it('passes error responses through untouched', () => {
    const outFile = path.join(tmpDir, 'never.json');
    const result = { content: [{ type: 'text', text: 'Error: no such actor' }], isError: true };

    expect(dehydrateToolResult('export-actor', { outFile }, result)).toBe(result);
    expect(fs.existsSync(outFile)).toBe(false);
  });

  it('passes non-JSON text through untouched', () => {
    const outFile = path.join(tmpDir, 'never.json');
    const result = { content: [{ type: 'text', text: 'plain text' }] };

    expect(dehydrateToolResult('export-actor', { outFile }, result)).toBe(result);
    expect(fs.existsSync(outFile)).toBe(false);
  });

  it('reports a write failure as a tool error', () => {
    // A path under an existing regular file cannot be created.
    const blocker = writeFixture('blocker', 'not a directory');
    const outFile = path.join(blocker, 'actor.json');
    const result = backendResult({ uuid: 'Actor.abc', data: actorSource });

    const out = dehydrateToolResult('export-actor', { outFile }, result);

    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain('Cannot write "outFile"');
  });

  it('leaves other tools alone', () => {
    const result = backendResult({ anything: true });

    expect(dehydrateToolResult('manage-actor-items', { outFile: 'x.json' }, result)).toBe(result);
  });
});

describe('toolErrorResult', () => {
  it('builds an MCP error payload', () => {
    expect(toolErrorResult('boom')).toEqual({
      content: [{ type: 'text', text: 'Error: boom' }],
      isError: true,
    });
  });
});
