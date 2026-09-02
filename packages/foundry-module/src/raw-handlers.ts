import { MODULE_ID } from './constants.js';
import type { FoundryDataAccess } from './data-access.js';

/**
 * Raw document handlers.
 *
 * Everything registered here lives under `CONFIG.queries['foundry-mcp-bridge.raw.*']`
 * and is deliberately kept out of `queries.ts` so upstream merges stay conflict-free.
 * The theme is round-trip fidelity: full Foundry actor source documents (items with
 * dnd5e activities included) in and out, world compendium management, verbatim
 * document updates and a scripting escape hatch for the GM client.
 */

/** Default Actor folder used by importActors when the caller gives none. */
const DEFAULT_IMPORT_FOLDER = 'Imported Actors';

/** Upper bound on a single importActors batch. */
const MAX_IMPORT_ACTORS = 50;

/** Default runScript timeout. */
const DEFAULT_SCRIPT_TIMEOUT_MS = 60000;

/** Document types a world compendium may be created for. */
const COMPENDIUM_DOCUMENT_TYPES = [
  'Actor',
  'Item',
  'JournalEntry',
  'Scene',
  'RollTable',
  'Macro',
] as const;

type AccessDenial = { success: false; error: string };

interface ActorRef {
  id: string;
  name: string;
  uuid: string;
}

export class RawHandlers {
  constructor(private dataAccess: FoundryDataAccess) {}

  /**
   * Register every raw.* query handler in CONFIG.queries.
   * Unregistration is handled by QueryHandlers.unregisterHandlers(), which drops
   * every key with the module prefix.
   */
  registerHandlers(): void {
    const prefix = `${MODULE_ID}.raw`;

    CONFIG.queries[`${prefix}.importActors`] = this.handleImportActors.bind(this);
    CONFIG.queries[`${prefix}.exportActor`] = this.handleExportActor.bind(this);
    CONFIG.queries[`${prefix}.manageCompendium`] = this.handleManageCompendium.bind(this);
    CONFIG.queries[`${prefix}.manageActorItems`] = this.handleManageActorItems.bind(this);
    CONFIG.queries[`${prefix}.updateActor`] = this.handleUpdateActor.bind(this);
    CONFIG.queries[`${prefix}.runScript`] = this.handleRunScript.bind(this);
    CONFIG.queries[`${prefix}.bridgeInfo`] = this.handleBridgeInfo.bind(this);
  }

  // ─── Gates and shared helpers ───────────────────────────────────────────────

  /**
   * SECURITY: GM-only, plus the world-level write toggle for mutating handlers.
   * Returns a denial payload to send back verbatim, or null when the call may proceed.
   */
  private checkAccess(requiresWrite: boolean): AccessDenial | null {
    if (!game.user?.isGM) {
      // Silent failure - no detail for non-GM users
      return { success: false, error: 'Access denied' };
    }

    if (requiresWrite) {
      let allowed = true;
      try {
        allowed = game.settings.get(MODULE_ID, 'allowWriteOperations') !== false;
      } catch {
        allowed = true;
      }
      if (!allowed) {
        return { success: false, error: 'Write operations disabled' };
      }
    }

    return null;
  }

  /**
   * Audit a write the same way data-access does. `auditLog` is private to
   * FoundryDataAccess in TypeScript terms only, so it is reachable at runtime;
   * fall back to the console when it is not.
   */
  private audit(operation: string, data: any, result: 'success' | 'failure', error?: string): void {
    const target = this.dataAccess as any;
    if (typeof target?.auditLog === 'function') {
      try {
        target.auditLog(`raw.${operation}`, data, result, error);
        return;
      } catch {
        // fall through to console logging
      }
    }
    console.log(`[${MODULE_ID}] raw.${operation} ${result}`, data, error ?? '');
  }

  private static describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Resolve an actor identifier: UUID, then world id, then exact world name,
   * then a case-insensitive partial name match. An ambiguous partial match is an
   * error listing the candidates. With `packId` the lookup is confined to that pack.
   */
  private async resolveActor(identifier: string, packId?: string): Promise<any> {
    if (typeof identifier !== 'string' || identifier.trim().length === 0) {
      throw new Error('actorIdentifier is required');
    }

    if (packId) {
      const pack = this.resolvePack(packId);
      const found = await this.findPackActor(pack, identifier);
      if (!found) {
        throw new Error(`Actor "${identifier}" not found in compendium ${pack.collection}`);
      }
      return found;
    }

    // 1. UUID (also covers Compendium.world.xxx.Actor.id)
    if (identifier.includes('.')) {
      try {
        const doc = await (globalThis as any).fromUuid(identifier);
        if (doc?.documentName === 'Actor') return doc;
      } catch {
        // not a UUID - fall through to the name/id lookups
      }
    }

    const actors = (game as any).actors;

    // 2. World id
    const byId = actors?.get(identifier);
    if (byId) return byId;

    // 3. Exact world name
    const byName = actors?.getName?.(identifier);
    if (byName) return byName;

    // 4. Case-insensitive partial name
    const needle = identifier.toLowerCase();
    const partial: any[] =
      actors?.filter(
        (a: any) => typeof a.name === 'string' && a.name.toLowerCase().includes(needle)
      ) ?? [];

    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      const candidates = partial.map((a: any) => `${a.name} (${a.id})`).join(', ');
      throw new Error(`Ambiguous actorIdentifier "${identifier}" - candidates: ${candidates}`);
    }

    throw new Error(`Actor not found: ${identifier}`);
  }

  /** Find an actor inside a compendium by id or exact name. */
  private async findPackActor(pack: any, identifier: string): Promise<any> {
    const byId = await pack.getDocument(identifier).catch(() => null);
    if (byId) return byId;

    const byName = await pack.getDocuments({ name: identifier }).catch(() => []);
    if (Array.isArray(byName) && byName.length > 0) return byName[0];

    const index: any[] = Array.from(await pack.getIndex());
    const entry = index.find((e: any) => e.name?.toLowerCase() === identifier.toLowerCase());
    if (entry) return await pack.getDocument(entry._id);

    return null;
  }

  /** Resolve a compendium by collection id, then exact label, then machine name. */
  private resolvePack(identifier: string): any {
    if (typeof identifier !== 'string' || identifier.trim().length === 0) {
      throw new Error('pack is required');
    }

    const packs = (game as any).packs;
    const direct = packs?.get(identifier);
    if (direct) return direct;

    const all: any[] = Array.from(packs ?? []);
    const byLabel = all.find(p => p.metadata?.label === identifier);
    if (byLabel) return byLabel;

    const byName = all.find(p => p.metadata?.name === identifier);
    if (byName) return byName;

    throw new Error(`Compendium not found: ${identifier}`);
  }

  /** Run a mutating operation against a pack, temporarily unlocking it if needed. */
  private async withUnlockedPack<T>(pack: any, operation: () => Promise<T>): Promise<T> {
    const wasLocked = pack.locked === true;

    if (wasLocked) {
      await pack.configure({ locked: false });
    }

    try {
      return await operation();
    } finally {
      if (wasLocked) {
        try {
          await pack.configure({ locked: true });
        } catch (error) {
          console.warn(
            `[${MODULE_ID}] Failed to re-lock compendium ${pack.collection}: ${RawHandlers.describeError(error)}`
          );
        }
      }
    }
  }

  /**
   * Find, or create, an Actor folder by name. Mirrors the private helper in
   * data-access (folder lookup by name + type, creation with module flags) without
   * touching upstream code.
   */
  private async getOrCreateActorFolder(folderName: string): Promise<string | null> {
    try {
      const existing = (game as any).folders?.find(
        (f: any) => f.name === folderName && f.type === 'Actor'
      );
      if (existing) return existing.id;

      const folder = await (globalThis as any).Folder.create({
        name: folderName,
        type: 'Actor',
        description: `Actors imported via MCP bridge: ${folderName}`,
        color: '#4a90e2',
        sort: 0,
        parent: null,
        flags: {
          [MODULE_ID]: {
            mcpGenerated: true,
            createdAt: new Date().toISOString(),
          },
        },
      });
      return folder?.id ?? null;
    } catch (error) {
      console.warn(
        `[${MODULE_ID}] Failed to create folder "${folderName}": ${RawHandlers.describeError(error)}`
      );
      // Fall back to a folderless import rather than failing the whole batch
      return null;
    }
  }

  private static actorRef(doc: any): ActorRef {
    return { id: doc?.id, name: doc?.name, uuid: doc?.uuid };
  }

  /** Both a Collection and a plain object are valid shapes for system.activities. */
  private static activityList(raw: any): any[] {
    if (!raw) return [];
    const source = raw.contents ?? raw;
    if (Array.isArray(source)) return source;
    if (typeof source === 'object') return Object.values(source as Record<string, any>);
    return [];
  }

  // ─── 2.1 importActors ───────────────────────────────────────────────────────

  private async handleImportActors(data: {
    actors: any[];
    destination: { type: 'world'; folder?: string } | { type: 'pack'; pack: string };
    replace?: 'byName' | 'none';
    keepId?: boolean;
  }): Promise<any> {
    const denied = this.checkAccess(true);
    if (denied) return denied;

    this.dataAccess.validateFoundryState();

    const actors = data?.actors;
    if (!Array.isArray(actors) || actors.length === 0) {
      throw new Error('actors array is required and must contain at least one entry');
    }
    if (actors.length > MAX_IMPORT_ACTORS) {
      throw new Error(`actors array cannot contain more than ${MAX_IMPORT_ACTORS} entries`);
    }

    const destination = data?.destination;
    if (!destination || (destination.type !== 'world' && destination.type !== 'pack')) {
      throw new Error("destination is required and must be { type: 'world' } or { type: 'pack' }");
    }

    const replace = data?.replace ?? 'byName';
    const keepId = data?.keepId === true;

    const toPack = destination.type === 'pack';
    const pack = toPack ? this.resolvePack(destination.pack) : null;
    if (pack && pack.metadata?.type !== 'Actor') {
      throw new Error(
        `Compendium ${pack.collection} holds ${pack.metadata?.type} documents, not Actor`
      );
    }

    const folderName = toPack
      ? null
      : ((destination as { type: 'world'; folder?: string }).folder ?? DEFAULT_IMPORT_FOLDER);
    const folderId = folderName ? await this.getOrCreateActorFolder(folderName) : null;

    // Pack index is consulted once per batch for replace lookups
    if (pack && replace === 'byName') {
      await pack.getIndex();
    }

    const created: ActorRef[] = [];
    const replaced: ActorRef[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    // One actor at a time: a rejected document must not take the batch with it
    const importBatch = async (): Promise<void> => {
      for (const raw of actors) {
        const name = typeof raw?.name === 'string' ? raw.name : '(unnamed)';

        try {
          if (typeof raw?.name !== 'string' || raw.name.trim().length === 0) {
            throw new Error('"name" is required and must be a non-empty string');
          }
          if (typeof raw?.type !== 'string' || raw.type.trim().length === 0) {
            throw new Error('"type" is required and must be a non-empty string');
          }

          if (replace === 'byName') {
            const gone = pack
              ? await this.replaceInPack(pack, raw.name)
              : await this.replaceInWorld(raw.name, folderId);
            replaced.push(...gone);
          }

          const doc = RawHandlers.prepareActorDoc(raw, keepId, toPack ? null : folderId);
          const ActorClass = (globalThis as any).Actor;
          const impl = ActorClass?.implementation ?? ActorClass;

          const options: Record<string, any> = { keepId };
          if (pack) options.pack = pack.collection;

          const result = await impl.createDocuments([doc], options);
          const madeDoc = Array.isArray(result) ? result[0] : result;
          if (!madeDoc) {
            throw new Error('Foundry returned no document');
          }

          created.push(RawHandlers.actorRef(madeDoc));
        } catch (error) {
          errors.push({ name, error: RawHandlers.describeError(error) });
        }
      }
    };

    // A locked target pack is unlocked for the batch and locked again afterwards
    if (pack) {
      await this.withUnlockedPack(pack, importBatch);
    } else {
      await importBatch();
    }

    const destinationInfo = pack
      ? { type: 'pack' as const, pack: pack.collection }
      : { type: 'world' as const, folder: folderName };

    this.audit(
      'importActors',
      {
        destination: destinationInfo,
        requested: actors.length,
        created: created.length,
        replaced: replaced.length,
        errors: errors.length,
      },
      errors.length === actors.length ? 'failure' : 'success'
    );

    return { created, replaced, errors, destination: destinationInfo };
  }

  /**
   * Turn an ActorData source object into a document ready for createDocuments.
   * `folder` from the payload is dropped (the destination decides), `_stats` is
   * always dropped (Foundry writes its own) and ids are dropped unless kept.
   */
  private static prepareActorDoc(
    raw: any,
    keepId: boolean,
    folderId: string | null
  ): Record<string, any> {
    const doc: Record<string, any> = { ...raw };

    delete doc._stats;
    delete doc.folder;
    if (!keepId) delete doc._id;

    if (Array.isArray(doc.items)) {
      doc.items = doc.items.map((item: any) => {
        const copy: Record<string, any> = { ...item };
        if (!keepId) delete copy._id;
        return copy;
      });
    }

    if (Array.isArray(doc.effects) && !keepId) {
      doc.effects = doc.effects.map((effect: any) => {
        const copy: Record<string, any> = { ...effect };
        delete copy._id;
        return copy;
      });
    }

    if (folderId) doc.folder = folderId;

    return doc;
  }

  /** Delete world actors of the same name inside the target folder. */
  private async replaceInWorld(name: string, folderId: string | null): Promise<ActorRef[]> {
    const matches: any[] =
      (game as any).actors?.filter(
        (a: any) => a.name === name && (a.folder?.id ?? null) === folderId
      ) ?? [];

    const removed: ActorRef[] = [];
    for (const actor of matches) {
      const ref = RawHandlers.actorRef(actor);
      await actor.delete();
      removed.push(ref);
    }
    return removed;
  }

  /** Delete compendium entries of the same name, unlocking the pack if needed. */
  private async replaceInPack(pack: any, name: string): Promise<ActorRef[]> {
    const entries = Array.from(pack.index ?? []).filter((e: any) => e.name === name) as any[];
    if (entries.length === 0) return [];

    return await this.withUnlockedPack(pack, async () => {
      const removed: ActorRef[] = [];
      for (const entry of entries) {
        const doc = await pack.getDocument(entry._id);
        if (!doc) continue;
        const ref = RawHandlers.actorRef(doc);
        await doc.delete();
        removed.push(ref);
      }
      return removed;
    });
  }

  // ─── 2.2 exportActor ────────────────────────────────────────────────────────

  private async handleExportActor(data: { actorIdentifier: string; pack?: string }): Promise<any> {
    const denied = this.checkAccess(false);
    if (denied) return denied;

    this.dataAccess.validateFoundryState();

    const actor = await this.resolveActor(data?.actorIdentifier, data?.pack);
    const source = actor.toObject();
    const itemCount = Array.isArray(source?.items) ? source.items.length : 0;

    return {
      uuid: actor.uuid,
      name: actor.name,
      type: actor.type,
      itemCount,
      data: source,
    };
  }

  // ─── 2.3 manageCompendium ───────────────────────────────────────────────────

  private async handleManageCompendium(data: {
    action: 'list' | 'create' | 'contents' | 'delete-entries' | 'lock' | 'unlock' | 'delete-pack';
    pack?: string;
    label?: string;
    name?: string;
    documentType?: string;
    entryIds?: string[];
    entryNames?: string[];
  }): Promise<any> {
    const action = data?.action;
    const isWrite = action !== 'list' && action !== 'contents';

    const denied = this.checkAccess(isWrite);
    if (denied) return denied;

    this.dataAccess.validateFoundryState();

    switch (action) {
      case 'list':
        return this.listCompendiums();
      case 'create':
        return await this.createCompendium(data);
      case 'contents':
        return await this.compendiumContents(data?.pack ?? '');
      case 'delete-entries':
        return await this.deleteCompendiumEntries(data);
      case 'lock':
      case 'unlock':
        return await this.setCompendiumLock(data?.pack ?? '', action === 'lock');
      case 'delete-pack':
        return await this.deleteCompendiumPack(data?.pack ?? '');
      default:
        throw new Error(
          `Unknown action "${String(action)}". Valid actions: list, create, contents, delete-entries, lock, unlock, delete-pack`
        );
    }
  }

  private listCompendiums(): any[] {
    const packs: any[] = Array.from((game as any).packs ?? []);

    return packs.map(pack => ({
      collection: pack.collection,
      label: pack.metadata?.label,
      type: pack.metadata?.type,
      locked: pack.locked === true,
      size: pack.index?.size ?? 0,
      package: pack.metadata?.packageType,
      packageName: pack.metadata?.packageName,
    }));
  }

  private async createCompendium(data: {
    label?: string;
    name?: string;
    documentType?: string;
  }): Promise<any> {
    const label = data?.label;
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new Error('label is required to create a compendium');
    }

    const documentType = data?.documentType ?? 'Actor';
    if (!(COMPENDIUM_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
      throw new Error(
        `Unknown documentType "${documentType}". Valid types: ${COMPENDIUM_DOCUMENT_TYPES.join(', ')}`
      );
    }

    const name = data?.name?.trim() ? data.name.trim() : RawHandlers.slugify(label);
    if (!name) {
      throw new Error(
        `Could not derive a machine name from label "${label}" - pass "name" explicitly`
      );
    }

    const existing = (game as any).packs?.get(`world.${name}`);
    if (existing) {
      return {
        existed: true,
        collection: existing.collection,
        label: existing.metadata?.label,
        type: existing.metadata?.type,
        locked: existing.locked === true,
        size: existing.index?.size ?? 0,
      };
    }

    const CompendiumCollectionClass =
      (globalThis as any).foundry?.documents?.collections?.CompendiumCollection ??
      (globalThis as any).CompendiumCollection;

    if (!CompendiumCollectionClass?.createCompendium) {
      throw new Error('CompendiumCollection.createCompendium is unavailable in this Foundry build');
    }

    const pack = await CompendiumCollectionClass.createCompendium({
      type: documentType,
      label,
      name,
    });

    this.audit('manageCompendium.create', { name, label, documentType }, 'success');

    return {
      existed: false,
      collection: pack?.collection ?? `world.${name}`,
      label: pack?.metadata?.label ?? label,
      type: pack?.metadata?.type ?? documentType,
      locked: pack?.locked === true,
      size: pack?.index?.size ?? 0,
    };
  }

  /** Latin/dash machine name; Cyrillic labels are transliterated first. */
  private static slugify(label: string): string {
    const map: Record<string, string> = {
      а: 'a',
      б: 'b',
      в: 'v',
      г: 'g',
      д: 'd',
      е: 'e',
      ё: 'e',
      ж: 'zh',
      з: 'z',
      и: 'i',
      й: 'y',
      к: 'k',
      л: 'l',
      м: 'm',
      н: 'n',
      о: 'o',
      п: 'p',
      р: 'r',
      с: 's',
      т: 't',
      у: 'u',
      ф: 'f',
      х: 'h',
      ц: 'c',
      ч: 'ch',
      ш: 'sh',
      щ: 'sch',
      ъ: '',
      ы: 'y',
      ь: '',
      э: 'e',
      ю: 'yu',
      я: 'ya',
    };

    const transliterated = Array.from(label.toLowerCase())
      .map(ch => (ch in map ? map[ch] : ch))
      .join('');

    return transliterated
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  private async compendiumContents(packId: string): Promise<any[]> {
    const pack = this.resolvePack(packId);
    const index: any[] = Array.from(await pack.getIndex());
    const documentType = pack.metadata?.type;

    return index.map(entry => ({
      _id: entry._id,
      name: entry.name,
      type: entry.type ?? documentType,
      img: entry.img ?? null,
      uuid: entry.uuid ?? `Compendium.${pack.collection}.${documentType}.${entry._id}`,
    }));
  }

  private async deleteCompendiumEntries(data: {
    pack?: string;
    entryIds?: string[];
    entryNames?: string[];
  }): Promise<any> {
    const pack = this.resolvePack(data?.pack ?? '');
    const ids = Array.isArray(data?.entryIds) ? data.entryIds : [];
    const names = Array.isArray(data?.entryNames) ? data.entryNames : [];

    if (ids.length === 0 && names.length === 0) {
      throw new Error('Provide entryIds and/or entryNames identifying the entries to delete');
    }

    const index: any[] = Array.from(await pack.getIndex());
    const targets = new Map<string, string>();
    const notFound: string[] = [];

    for (const id of ids) {
      const entry = index.find(e => e._id === id);
      if (entry) targets.set(entry._id, entry.name);
      else notFound.push(id);
    }

    for (const name of names) {
      const matches = index.filter(e => e.name === name);
      if (matches.length === 0) notFound.push(name);
      for (const entry of matches) targets.set(entry._id, entry.name);
    }

    const deleted: Array<{ _id: string; name: string }> = [];

    if (targets.size > 0) {
      await this.withUnlockedPack(pack, async () => {
        for (const [id, name] of targets) {
          const doc = await pack.getDocument(id);
          if (!doc) {
            notFound.push(id);
            continue;
          }
          await doc.delete();
          deleted.push({ _id: id, name });
        }
      });
    }

    this.audit(
      'manageCompendium.delete-entries',
      { pack: pack.collection, deleted: deleted.length, notFound: notFound.length },
      'success'
    );

    return { pack: pack.collection, deleted, notFound };
  }

  private async setCompendiumLock(packId: string, locked: boolean): Promise<any> {
    const pack = this.resolvePack(packId);
    await pack.configure({ locked });

    this.audit('manageCompendium.lock', { pack: pack.collection, locked }, 'success');

    return { pack: pack.collection, locked };
  }

  private async deleteCompendiumPack(packId: string): Promise<any> {
    const pack = this.resolvePack(packId);

    if (pack.metadata?.packageType !== 'world') {
      throw new Error(
        `Only world compendiums can be deleted - ${pack.collection} belongs to ${pack.metadata?.packageType} "${pack.metadata?.packageName}"`
      );
    }

    const collection = pack.collection;
    await pack.deleteCompendium();

    this.audit('manageCompendium.delete-pack', { pack: collection }, 'success');

    return { deleted: true, pack: collection };
  }

  // ─── 2.4 manageActorItems ───────────────────────────────────────────────────

  private async handleManageActorItems(data: {
    actorIdentifier: string;
    action: 'list' | 'create' | 'update-raw' | 'delete';
    items?: any[];
    updates?: Array<Record<string, any>>;
    itemIds?: string[];
  }): Promise<any> {
    const action = data?.action;
    const denied = this.checkAccess(action !== 'list');
    if (denied) return denied;

    this.dataAccess.validateFoundryState();

    const actor = await this.resolveActor(data?.actorIdentifier);
    let result: any;

    switch (action) {
      case 'list':
        result = RawHandlers.listActorItems(actor);
        break;

      case 'create': {
        const items = data?.items;
        if (!Array.isArray(items) || items.length === 0) {
          throw new Error('items array is required and must contain at least one entry');
        }
        const payload = items.map((item: any) => {
          const copy: Record<string, any> = { ...item };
          delete copy._id;
          return copy;
        });
        const createdDocs = (await actor.createEmbeddedDocuments('Item', payload)) as any[];
        result = (createdDocs ?? []).map(doc => ({ _id: doc.id, name: doc.name, type: doc.type }));
        break;
      }

      case 'update-raw': {
        const updates = data?.updates;
        if (!Array.isArray(updates) || updates.length === 0) {
          throw new Error('updates array is required and must contain at least one entry');
        }
        for (const [idx, update] of updates.entries()) {
          if (!update || typeof update._id !== 'string' || update._id.length === 0) {
            throw new Error(`updates[${idx}]: "_id" is required`);
          }
        }
        // Passed to Foundry verbatim: dotted keys and "-=" deletions must survive
        const updatedDocs = (await actor.updateEmbeddedDocuments('Item', updates)) as any[];
        result = (updatedDocs ?? []).map(doc => ({ _id: doc.id, name: doc.name }));
        break;
      }

      case 'delete': {
        const itemIds = data?.itemIds;
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
          throw new Error('itemIds array is required and must contain at least one entry');
        }
        const deletedDocs = (await actor.deleteEmbeddedDocuments('Item', itemIds)) as any[];
        result = (deletedDocs ?? []).map(doc => ({ _id: doc.id, name: doc.name }));
        break;
      }

      default:
        throw new Error(
          `Unknown action "${String(action)}". Valid actions: list, create, update-raw, delete`
        );
    }

    if (action !== 'list') {
      this.audit(
        `manageActorItems.${action}`,
        { actorId: actor.id, count: Array.isArray(result) ? result.length : 0 },
        'success'
      );
    }

    return { actorId: actor.id, actorName: actor.name, result };
  }

  private static listActorItems(actor: any): any[] {
    const items: any[] = actor.items?.contents ?? Array.from(actor.items ?? []);

    return items.map(item => {
      const uses = item.system?.uses ?? {};

      return {
        _id: item.id,
        name: item.name,
        type: item.type,
        img: item.img ?? null,
        uses: {
          max: uses.max ?? null,
          spent: uses.spent ?? null,
          recovery: uses.recovery ?? null,
        },
        activities: RawHandlers.activityList(item.system?.activities).map((activity: any) => ({
          _id: activity._id ?? activity.id ?? null,
          type: activity.type ?? null,
          name: activity.name ?? null,
          activation: activity.activation ?? null,
        })),
        compendiumSource: item._stats?.compendiumSource ?? null,
      };
    });
  }

  // ─── 2.5 updateActor ────────────────────────────────────────────────────────

  private async handleUpdateActor(data: {
    actorIdentifier: string;
    update: Record<string, any>;
  }): Promise<any> {
    const denied = this.checkAccess(true);
    if (denied) return denied;

    this.dataAccess.validateFoundryState();

    const update = data?.update;
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw new Error('update object is required');
    }

    const actor = await this.resolveActor(data?.actorIdentifier);

    try {
      // Verbatim: dotted keys and "-=" deletions are handled by Foundry, not here
      await actor.update(update);
    } catch (error) {
      this.audit(
        'updateActor',
        { actorId: actor.id, keys: Object.keys(update) },
        'failure',
        RawHandlers.describeError(error)
      );
      throw error;
    }

    this.audit('updateActor', { actorId: actor.id, keys: Object.keys(update) }, 'success');

    return RawHandlers.actorRef(actor);
  }

  // ─── 2.6 runScript ──────────────────────────────────────────────────────────

  private async handleRunScript(data: {
    script: string;
    args?: any;
    timeoutMs?: number;
  }): Promise<any> {
    const denied = this.checkAccess(true);
    if (denied) return denied;

    const script = data?.script;
    if (typeof script !== 'string' || script.trim().length === 0) {
      throw new Error('script is required and must be a non-empty string');
    }

    const timeoutMs =
      typeof data?.timeoutMs === 'number' && data.timeoutMs > 0
        ? data.timeoutMs
        : DEFAULT_SCRIPT_TIMEOUT_MS;

    const started = Date.now();
    let timer: any = null;

    try {
      const AsyncFunction: any = Object.getPrototypeOf(async function () {
        /* async function prototype probe */
      }).constructor;
      const fn = new AsyncFunction('args', script);

      const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Script timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      });

      const value = await Promise.race([fn(data?.args), timeout]);
      const durationMs = Date.now() - started;

      let serializable = true;
      try {
        JSON.stringify(value ?? null);
      } catch {
        serializable = false;
      }

      this.audit('runScript', { length: script.length, durationMs }, 'success');

      if (!serializable) {
        return { ok: true, result: String(value), serialized: false, durationMs };
      }
      return { ok: true, result: value ?? null, durationMs };
    } catch (error) {
      const durationMs = Date.now() - started;
      const message = RawHandlers.describeError(error);

      this.audit('runScript', { length: script.length, durationMs }, 'failure', message);

      // Reported in the body, never thrown, so the caller keeps the stack
      return {
        ok: false,
        error: message,
        stack: error instanceof Error ? (error.stack ?? null) : null,
        durationMs,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ─── 2.7 bridgeInfo ─────────────────────────────────────────────────────────

  private async handleBridgeInfo(): Promise<any> {
    const denied = this.checkAccess(false);
    if (denied) return denied;

    const anyGame = game as any;

    let connectionType: string | null = null;
    try {
      const bridge = (globalThis as any).foundryMCPBridge;
      connectionType = bridge?.getStatus?.()?.connectionInfo?.type ?? null;
    } catch {
      connectionType = null;
    }
    if (!connectionType) {
      try {
        connectionType = game.settings.get(MODULE_ID, 'connectionType') as string;
      } catch {
        connectionType = null;
      }
    }

    let actAsBridge = true;
    try {
      actAsBridge = game.settings.get(MODULE_ID, 'actAsBridge') !== false;
    } catch {
      actAsBridge = true;
    }

    return {
      user: anyGame.user?.name ?? null,
      userId: anyGame.user?.id ?? null,
      isGM: anyGame.user?.isGM === true,
      world: anyGame.world?.id ?? null,
      system: anyGame.system?.id ?? null,
      systemVersion: anyGame.system?.version ?? null,
      coreVersion: anyGame.version ?? anyGame.release?.version ?? null,
      moduleVersion: anyGame.modules?.get(MODULE_ID)?.version ?? null,
      connectionType,
      actAsBridge,
      url: window.location.origin,
    };
  }
}
