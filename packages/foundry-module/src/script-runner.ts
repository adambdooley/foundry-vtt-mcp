/**
 * run-script: execute JavaScript in the GM client (full Foundry API access).
 * GM-only, and requires the `allowScriptExecution` setting (off by default,
 * only the GM can switch it on from the module settings).
 */
import { MODULE_ID } from './constants.js';
import { assertWrite, limit, registerHandlers } from './document-tools.js';

/** Convert documents / collections / maps to plain JSON, guarding cycles and depth. */
function toPlain(value: any): any {
  const seen = new WeakSet();
  const walk = (v: any, depth: number): any => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'function') return undefined;
    if (typeof v !== 'object') return v;
    if (depth > 12) return '[max depth]';
    if (seen.has(v)) return '[circular]';
    seen.add(v);
    if (typeof v.toObject === 'function' && v.documentName) {
      return { uuid: v.uuid, ...walk(v.toObject(), depth + 1) };
    }
    if (v instanceof Map) return walk(Object.fromEntries(v), depth + 1);
    if (v instanceof Set || Array.isArray(v)) return Array.from(v).map(x => walk(x, depth + 1));
    if (Array.isArray(v.contents)) return v.contents.map((x: any) => walk(x, depth + 1));
    const out: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) {
      const w = walk(x, depth + 1);
      if (w !== undefined) out[k] = w;
    }
    return out;
  };
  return walk(value, 0);
}

async function runScript(data: { code: string }): Promise<any> {
  assertWrite();
  if (!game.settings.get(MODULE_ID, 'allowScriptExecution')) {
    throw new Error(
      'Script execution is disabled: enable "Allow Script Execution" in the Foundry MCP Bridge settings'
    );
  }
  if (typeof data.code !== 'string' || !data.code.trim()) throw new Error('code is required');
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const logs: string[] = [];
  const log = (...args: any[]) =>
    logs.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(toPlain(a)))).join(' '));
  console.log(`${MODULE_ID} | run-script\n${data.code}`);
  const result = await new AsyncFunction('log', data.code)(log);
  return limit({ success: true, result: toPlain(result), logs });
}

export function registerScriptHandlers(): void {
  registerHandlers({ 'run-script': runScript });
}
