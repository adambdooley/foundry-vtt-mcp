/**
 * Generic document tools: read / query / create / update / duplicate / delete any
 * document by UUID (world or compendium, any page type), plus world settings.
 * GM-only; writes are gated by the existing `allowWriteOperations` setting.
 */
import { MODULE_ID } from './constants.js';
import { permissionManager } from './permissions.js';

const MAX_RESULT_CHARS = 200_000;
const MAX_QUERY_LIMIT = 500;
/** Permission switches the AI must never flip itself. */
const PROTECTED_SETTINGS = ['allowWriteOperations', 'allowScriptExecution'];
/** Core settings that would widen player permissions or change enabled modules. */
const PROTECTED_CORE_SETTINGS = ['core.permissions', 'core.moduleConfiguration'];
/**
 * Document types the generic tools never read or write: users (roles, password hashes)
 * and raw settings (which would bypass the protected switches above).
 */
const RESTRICTED_DOCUMENTS = ['User', 'Setting'];
/** Setting keys whose values are hidden from get-settings (API keys, tokens…). */
const SECRET_SETTING = /key|token|secret|password/i;

type Handler = (data: any) => Promise<any>;

export function assertGM(): void {
  if (!game.user?.isGM) throw new Error('Access denied: GM only');
}

export function assertWrite(operation: 'modifyWorld' | 'deleteData' = 'modifyWorld'): void {
  assertGM();
  const check = permissionManager.checkWritePermission(operation);
  if (!check.allowed) {
    throw new Error(
      `Write operations are disabled in the Foundry MCP Bridge settings (${check.reason ?? operation})`
    );
  }
}

function assertAllowedType(documentName: string | undefined): void {
  if (documentName && RESTRICTED_DOCUMENTS.includes(documentName)) {
    throw new Error(`${documentName} documents cannot be accessed through the generic tools`);
  }
}

/** Script macros are code: creating or editing one needs the script execution switch. */
function assertMacroAllowed(documentName: string, data: any, existingType?: string): void {
  if (documentName !== 'Macro') return;
  const type = data?.type ?? existingType ?? 'script';
  if (type === 'script' && !game.settings.get(MODULE_ID, 'allowScriptExecution')) {
    throw new Error(
      'Script macros can only be created or edited when "Allow Script Execution" is enabled'
    );
  }
}

function pick(obj: any, fields?: string[]): any {
  if (!fields?.length) return obj;
  const out: Record<string, any> = {};
  for (const f of fields) out[f] = foundry.utils.getProperty(obj, f);
  return out;
}

export function limit(result: any): any {
  const text = JSON.stringify(result ?? null);
  if (text.length <= MAX_RESULT_CHARS) return result;
  return {
    truncated: true,
    totalChars: text.length,
    preview: text.slice(0, MAX_RESULT_CHARS),
    hint: 'Result too large: return fewer fields or paginate.',
  };
}

async function resolve(uuid: string): Promise<any> {
  if (!uuid) throw new Error('uuid is required');
  const doc: any = await fromUuid(uuid);
  if (!doc) throw new Error(`Document not found: ${uuid}`);
  assertAllowedType(doc.documentName);
  return doc;
}

/** Run a write on a document, temporarily unlocking its compendium when asked to. */
async function withUnlockedPack<T>(
  doc: any,
  unlockPack: boolean | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const pack = doc.pack ? game.packs.get(doc.pack) : null;
  if (!pack?.locked) return fn();
  if (!unlockPack) throw new Error(`Compendium ${pack.collection} is locked: pass unlockPack=true`);
  await pack.configure({ locked: false });
  try {
    return await fn();
  } finally {
    await pack.configure({ locked: true });
  }
}

function folderId(name: string | null | undefined, type: string): string | null | undefined {
  if (name === undefined) return undefined;
  if (!name) return null;
  const folder = game.folders.find(
    (f: any) => f.type === type && (f.id === name || f.name === name)
  );
  if (!folder) throw new Error(`Folder not found: ${name}`);
  return folder.id;
}

/** A world document type (Actor, Item, Scene…) or a compendium id. */
function collectionFor(source: string): { docs: () => Promise<any[]>; type: string } {
  const pack = game.packs.get(source);
  if (pack) {
    assertAllowedType(pack.documentName);
    return { docs: () => pack.getDocuments(), type: pack.documentName };
  }
  assertAllowedType(source);
  const coll = game.collections.get(source);
  if (!coll) {
    throw new Error(
      `Unknown source "${source}": use a document type (Actor, Item, Scene, JournalEntry, Playlist, RollTable, Macro, Folder…) or a compendium id`
    );
  }
  return { docs: async () => coll.contents, type: source };
}

async function getDocument(data: { uuid: string; fields?: string[] }): Promise<any> {
  assertGM();
  const doc = await resolve(data.uuid);
  return limit({
    uuid: doc.uuid,
    documentName: doc.documentName,
    data: pick(doc.toObject(), data.fields),
  });
}

async function queryDocuments(data: {
  source: string;
  nameFilter?: string;
  where?: Record<string, any>;
  fields?: string[];
  limit?: number;
  offset?: number;
}): Promise<any> {
  assertGM();
  const { docs, type } = collectionFor(data.source);
  const needle = data.nameFilter?.toLowerCase();
  const all = (await docs()).filter((d: any) => {
    if (
      needle &&
      !String(d.name ?? '')
        .toLowerCase()
        .includes(needle)
    )
      return false;
    for (const [path, value] of Object.entries(data.where ?? {})) {
      if (foundry.utils.getProperty(d, path) !== value) return false;
    }
    return true;
  });
  const start = Math.max(0, Math.trunc(Number(data.offset)) || 0);
  const size = Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.trunc(Number(data.limit)) || 50));
  const page = all.slice(start, start + size);
  const fields = data.fields?.length ? data.fields : ['name', 'type', 'folder'];
  return limit({
    documentName: type,
    total: all.length,
    offset: start,
    results: page.map((d: any) => ({ uuid: d.uuid, ...pick(d.toObject(), fields) })),
  });
}

async function createDocument(data: {
  documentName: string;
  data: any;
  parent?: string;
  pack?: string;
  folder?: string;
}): Promise<any> {
  assertWrite();
  assertAllowedType(data.documentName);
  const cls: any = (CONFIG as any)[data.documentName]?.documentClass;
  if (!cls) throw new Error(`Unknown document type: ${data.documentName}`);
  const src = { ...(data.data ?? {}) };
  assertMacroAllowed(data.documentName, src);
  const fid = folderId(data.folder, data.documentName);
  if (fid !== undefined) src.folder = fid;
  const options: any = {};
  if (data.parent) options.parent = await resolve(data.parent);
  if (data.pack) options.pack = data.pack;
  const created = await cls.create(src, options);
  return { success: true, uuid: created.uuid, id: created.id, name: created.name };
}

async function updateDocument(data: {
  uuid: string;
  changes: Record<string, any>;
  unlockPack?: boolean;
}): Promise<any> {
  assertWrite();
  const doc = await resolve(data.uuid);
  if (!data.changes || typeof data.changes !== 'object')
    throw new Error('changes object is required');
  const updatedKeys = Object.keys(foundry.utils.flattenObject(data.changes));
  if (updatedKeys.includes('command') || updatedKeys.includes('type')) {
    assertMacroAllowed(doc.documentName, data.changes, doc.type);
  }
  await withUnlockedPack(doc, data.unlockPack, () => doc.update(data.changes));
  return { success: true, uuid: doc.uuid, updatedKeys };
}

async function duplicateDocument(data: {
  uuid: string;
  name?: string;
  folder?: string | null;
}): Promise<any> {
  assertWrite();
  const doc = await resolve(data.uuid);
  const src = doc.toObject();
  delete src._id;
  assertMacroAllowed(doc.documentName, src);
  if (data.name) src.name = data.name;
  const fid = folderId(data.folder, doc.documentName);
  if (fid !== undefined) src.folder = fid;
  const created = await doc.constructor.create(src, doc.parent ? { parent: doc.parent } : {});
  return { success: true, uuid: created.uuid, id: created.id, name: created.name };
}

async function deleteDocument(data: { uuid: string; unlockPack?: boolean }): Promise<any> {
  assertWrite('deleteData');
  const doc = await resolve(data.uuid);
  const info = { uuid: doc.uuid, name: doc.name };
  await withUnlockedPack(doc, data.unlockPack, () => doc.delete());
  return { success: true, deleted: info };
}

async function getSettings(data: { namespace?: string; keys?: string[] }): Promise<any> {
  assertGM();
  const out: any[] = [];
  for (const [id, cfg] of (game.settings as any).settings.entries()) {
    const s: any = cfg;
    if (data.namespace && s.namespace !== data.namespace) continue;
    if (data.keys?.length && !data.keys.includes(id) && !data.keys.includes(s.key)) continue;
    let value: any;
    try {
      value = SECRET_SETTING.test(s.key) ? '[hidden]' : game.settings.get(s.namespace, s.key);
    } catch {
      value = '[unreadable]';
    }
    out.push({ id, scope: s.scope, name: s.name ? game.i18n.localize(s.name) : undefined, value });
  }
  return limit({ count: out.length, settings: out });
}

async function setSetting(data: { namespace: string; key: string; value: any }): Promise<any> {
  assertWrite();
  if (!data.namespace || !data.key) throw new Error('namespace and key are required');
  const id = `${data.namespace}.${data.key}`;
  if (
    (data.namespace === MODULE_ID && PROTECTED_SETTINGS.includes(data.key)) ||
    PROTECTED_CORE_SETTINGS.includes(id)
  ) {
    throw new Error(`${id} can only be changed by the GM in Foundry's own settings`);
  }
  if (!(game.settings as any).settings.has(`${data.namespace}.${data.key}`)) {
    throw new Error(`Unknown setting: ${data.namespace}.${data.key}`);
  }
  await game.settings.set(data.namespace, data.key, data.value);
  return {
    success: true,
    id: `${data.namespace}.${data.key}`,
    value: game.settings.get(data.namespace, data.key),
  };
}

export function registerHandlers(handlers: Record<string, Handler>): void {
  for (const [name, fn] of Object.entries(handlers)) {
    CONFIG.queries[`${MODULE_ID}.${name}`] = async (data: any) => {
      try {
        return await fn(data ?? {});
      } catch (error) {
        throw new Error(
          `${name} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };
  }
}

export function registerDocumentHandlers(): void {
  registerHandlers({
    'get-document': getDocument,
    'query-documents': queryDocuments,
    'create-document': createDocument,
    'update-document': updateDocument,
    'duplicate-document': duplicateDocument,
    'delete-document': deleteDocument,
    'get-settings': getSettings,
    'set-setting': setSetting,
  });
}
