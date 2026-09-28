/**
 * Generic document tools: read / query / create / update / duplicate / delete any
 * document by UUID (world or compendium, any page type), plus world settings.
 * GM-only; writes are gated by the existing `allowWriteOperations` setting.
 */
import { MODULE_ID } from './constants.js';

const MAX_RESULT_CHARS = 200_000;
/** Permission switches the AI must never flip itself. */
const PROTECTED_SETTINGS = ['allowWriteOperations', 'allowScriptExecution'];

type Handler = (data: any) => Promise<any>;

export function assertGM(): void {
  if (!game.user?.isGM) throw new Error('Access denied: GM only');
}

export function assertWrite(): void {
  assertGM();
  if (!game.settings.get(MODULE_ID, 'allowWriteOperations')) {
    throw new Error('Write operations are disabled in the Foundry MCP Bridge settings');
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
  return doc;
}

async function unlockIfNeeded(doc: any, unlockPack?: boolean): Promise<void> {
  const pack = doc.pack ? game.packs.get(doc.pack) : null;
  if (!pack?.locked) return;
  if (!unlockPack) throw new Error(`Compendium ${pack.collection} is locked: pass unlockPack=true`);
  await pack.configure({ locked: false });
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
  if (pack) return { docs: () => pack.getDocuments(), type: pack.documentName };
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
  const start = data.offset ?? 0;
  const page = all.slice(start, start + (data.limit ?? 50));
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
  const cls: any = (CONFIG as any)[data.documentName]?.documentClass;
  if (!cls) throw new Error(`Unknown document type: ${data.documentName}`);
  const src = { ...(data.data ?? {}) };
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
  await unlockIfNeeded(doc, data.unlockPack);
  await doc.update(data.changes);
  return {
    success: true,
    uuid: doc.uuid,
    updatedKeys: Object.keys(foundry.utils.flattenObject(data.changes)),
  };
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
  if (data.name) src.name = data.name;
  const fid = folderId(data.folder, doc.documentName);
  if (fid !== undefined) src.folder = fid;
  const created = await doc.constructor.create(src, doc.parent ? { parent: doc.parent } : {});
  return { success: true, uuid: created.uuid, id: created.id, name: created.name };
}

async function deleteDocument(data: { uuid: string; unlockPack?: boolean }): Promise<any> {
  assertWrite();
  const doc = await resolve(data.uuid);
  await unlockIfNeeded(doc, data.unlockPack);
  const info = { uuid: doc.uuid, name: doc.name };
  await doc.delete();
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
      value = game.settings.get(s.namespace, s.key);
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
  if (data.namespace === MODULE_ID && PROTECTED_SETTINGS.includes(data.key)) {
    throw new Error(`${data.key} can only be changed by the GM in the module settings`);
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
