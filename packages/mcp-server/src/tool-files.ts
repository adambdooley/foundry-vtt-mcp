/**
 * File hydration for the raw actor tools.
 *
 * Files live on the machine that runs the stdio wrapper (src/index.ts), while the
 * backend may later move to a different host. So every filesystem access happens
 * here: `hydrateToolArgs` runs before a call_tool request is forwarded and
 * `dehydrateToolResult` runs on the response that comes back.
 *
 * The backend never sees `filePath` / `scriptFile`; it does see `outFile`, but only
 * to decide whether an oversized payload may be returned inline.
 *
 * Only Node built-ins are imported here - this module is bundled into
 * dist/index.bundle.cjs by esbuild.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ToolArgs = Record<string, any>;

/** Result of hydrating tool arguments: either rewritten args or a user-facing error. */
export type HydrateOutcome = { ok: true; args: ToolArgs } | { ok: false; error: string };

/** Minimal shape of an MCP tool response as produced by the backend. */
export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/** Build an MCP error response without ever reaching the backend. */
export function toolErrorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function readTextFile(filePath: string, field: string): string {
  const resolved = path.resolve(filePath);
  try {
    return fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read "${field}" file ${resolved}: ${errorMessage(error)}`);
  }
}

function readJsonFile(filePath: string, field: string): unknown {
  const text = readTextFile(filePath, field);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Cannot parse JSON from "${field}" file ${path.resolve(filePath)}: ${errorMessage(error)}`
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accept either a single JSON object or an array of them, always return an array. */
function asObjectArray(parsed: unknown, filePath: string, field: string): unknown[] {
  if (Array.isArray(parsed)) {
    const bad = parsed.findIndex(entry => !isPlainObject(entry));
    if (bad >= 0) {
      throw new Error(
        `"${field}" file ${path.resolve(filePath)} has a non-object entry at index ${bad}`
      );
    }
    return parsed;
  }
  if (isPlainObject(parsed)) return [parsed];
  throw new Error(
    `"${field}" file ${path.resolve(filePath)} must hold a JSON object or an array of JSON objects`
  );
}

// ── hydration ─────────────────────────────────────────────────────────────────

/**
 * Read any file-backed argument into the inline field the backend expects.
 * Tools without file arguments are returned untouched.
 */
export function hydrateToolArgs(name: string, args: ToolArgs | undefined): HydrateOutcome {
  const next: ToolArgs = { ...(args ?? {}) };

  try {
    switch (name) {
      case 'import-actor':
        hydrateImportActor(next);
        break;
      case 'manage-actor-items':
        hydrateManageActorItems(next);
        break;
      case 'update-actor-raw':
        hydrateUpdateActorRaw(next);
        break;
      case 'run-script':
        hydrateRunScript(next);
        break;
      default:
        break;
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }

  return { ok: true, args: next };
}

function hydrateImportActor(args: ToolArgs): void {
  const filePath = nonEmptyString(args.filePath);
  const hasInline = args.actors !== undefined;

  if (hasInline && filePath) {
    throw new Error('import-actor takes exactly one of "actors" or "filePath", not both');
  }
  if (!hasInline && !filePath) {
    throw new Error('import-actor requires either "actors" or "filePath"');
  }
  if (!filePath) return;

  args.actors = asObjectArray(readJsonFile(filePath, 'filePath'), filePath, 'filePath');
  delete args.filePath;
}

function hydrateManageActorItems(args: ToolArgs): void {
  const filePath = nonEmptyString(args.filePath);
  if (!filePath) return;

  const action = nonEmptyString(args.action) ?? '';
  const field = action === 'create' ? 'items' : action === 'update-raw' ? 'updates' : null;
  if (!field) {
    throw new Error(
      `manage-actor-items "filePath" applies to action "create" or "update-raw" only, got "${action || 'none'}"`
    );
  }
  if (args[field] !== undefined) {
    throw new Error(`manage-actor-items takes exactly one of "${field}" or "filePath", not both`);
  }

  args[field] = asObjectArray(readJsonFile(filePath, 'filePath'), filePath, 'filePath');
  delete args.filePath;
}

function hydrateUpdateActorRaw(args: ToolArgs): void {
  const filePath = nonEmptyString(args.filePath);
  if (!filePath) return;

  if (args.update !== undefined) {
    throw new Error('update-actor-raw takes exactly one of "update" or "filePath", not both');
  }

  const parsed = readJsonFile(filePath, 'filePath');
  if (!isPlainObject(parsed)) {
    throw new Error(
      `"filePath" file ${path.resolve(filePath)} must hold a single JSON object of update keys`
    );
  }

  args.update = parsed;
  delete args.filePath;
}

function hydrateRunScript(args: ToolArgs): void {
  const scriptFile = nonEmptyString(args.scriptFile);
  const hasInline = nonEmptyString(args.script) !== undefined;

  if (hasInline && scriptFile) {
    throw new Error('run-script takes exactly one of "script" or "scriptFile", not both');
  }
  if (!scriptFile) return;

  args.script = readTextFile(scriptFile, 'scriptFile');
  delete args.scriptFile;
}

// ── dehydration ───────────────────────────────────────────────────────────────

/**
 * Post-process a backend response. Only export-actor with "outFile" is affected:
 * the actor source is written to disk and the response shrinks to a summary.
 * Anything unexpected (error response, non-JSON text, missing "data") passes through.
 */
export function dehydrateToolResult(name: string, args: ToolArgs | undefined, result: any): any {
  if (name !== 'export-actor') return result;

  const outFile = nonEmptyString(args?.outFile);
  if (!outFile) return result;
  if (!result || result.isError) return result;

  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') return result;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return result;
  }
  if (!isPlainObject(parsed) || parsed.data === undefined) return result;

  const resolved = path.resolve(outFile);
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const json = JSON.stringify(parsed.data, null, 2);
    fs.writeFileSync(resolved, json, 'utf8');

    const summary = {
      uuid: parsed.uuid,
      name: parsed.name,
      type: parsed.type,
      itemCount: parsed.itemCount,
      bytes: Buffer.byteLength(json, 'utf8'),
      outFile: resolved,
    };
    return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
  } catch (error) {
    return toolErrorResult(`Cannot write "outFile" ${resolved}: ${errorMessage(error)}`);
  }
}
