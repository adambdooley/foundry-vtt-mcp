import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDocumentHandlers } from './document-tools.js';
import { registerScriptHandlers } from './script-runner.js';

const PREFIX = 'foundry-mcp-bridge';

function getProperty(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flattenObject(v, key));
    else out[key] = v;
  }
  return out;
}

function makeDoc(id: string, source: Record<string, any>, documentName = 'Actor') {
  const doc: any = {
    id,
    uuid: `${documentName}.${id}`,
    documentName,
    name: source.name,
    ...source,
    toObject: () => ({ _id: id, ...source }),
    update: vi.fn(async () => doc),
    delete: vi.fn(async () => doc),
  };
  return doc;
}

interface SetupOptions {
  isGM?: boolean;
  allowWrite?: boolean;
  allowScript?: boolean;
}

function setup({ isGM = true, allowWrite = true, allowScript = false }: SetupOptions = {}) {
  const goblin = makeDoc('a1', { name: 'Goblin', type: 'npc', system: { cr: 0.25 } });
  const klarg = makeDoc('a2', { name: 'Klarg', type: 'npc', system: { cr: 1 } });
  const hero = makeDoc('a3', { name: 'Hero', type: 'character', system: { cr: 0 } });
  const setting = makeDoc(
    's1',
    { name: undefined, key: `${PREFIX}.allowScriptExecution`, value: false },
    'Setting'
  );
  const user = makeDoc('u1', { name: 'Gamemaster', password: 'hash', role: 4 }, 'User');
  const macro = makeDoc('m1', { name: 'Light', type: 'script', command: 'return 1' }, 'Macro');
  const docs = [goblin, klarg, hero, setting, user, macro];

  const settingsStore = new Map<string, any>([
    [`${PREFIX}.allowWriteOperations`, allowWrite],
    [`${PREFIX}.allowScriptExecution`, allowScript],
    ['dnd5e.metricLengthUnits', false],
    ['core.permissions', {}],
    ['some-module.apiKey', 'sk-secret'],
  ]);
  const settingsConfig = new Map<string, any>(
    [...settingsStore.keys()].map(id => {
      const [namespace, key] = id.split(/\.(.+)/);
      return [id, { namespace, key, scope: 'world', name: key }];
    })
  );

  const actorCreate = vi.fn(async (src: any) => makeDoc('new1', src));
  const macroCreate = vi.fn(async (src: any) => makeDoc('new2', src, 'Macro'));
  const settingCreate = vi.fn();

  vi.stubGlobal('game', {
    user: { isGM },
    settings: {
      settings: settingsConfig,
      get: (ns: string, key: string) => settingsStore.get(`${ns}.${key}`),
      set: vi.fn(async (ns: string, key: string, value: any) =>
        settingsStore.set(`${ns}.${key}`, value)
      ),
    },
    i18n: { localize: (s: string) => s },
    packs: { get: () => undefined },
    collections: { get: (name: string) => (name === 'Actor' ? { contents: docs } : undefined) },
    folders: [{ id: 'f1', name: 'NPCs', type: 'Actor' }],
  });
  vi.stubGlobal('foundry', { utils: { getProperty, flattenObject } });
  vi.stubGlobal('fromUuid', async (uuid: string) => docs.find(d => d.uuid === uuid) ?? null);
  vi.stubGlobal('CONFIG', {
    queries: {},
    Actor: { documentClass: { create: actorCreate } },
    Macro: { documentClass: { create: macroCreate } },
    Setting: { documentClass: { create: settingCreate } },
  });

  registerDocumentHandlers();
  registerScriptHandlers();

  const call = (name: string, data: any = {}) => (CONFIG as any).queries[`${PREFIX}.${name}`](data);
  return {
    call,
    goblin,
    klarg,
    setting,
    macro,
    actorCreate,
    macroCreate,
    settingCreate,
    settingsStore,
  };
}

describe('generic document handlers', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('registers every handler under the module prefix', () => {
    setup();
    const names = Object.keys((CONFIG as any).queries).sort();
    expect(names).toEqual(
      [
        'create-document',
        'delete-document',
        'duplicate-document',
        'get-document',
        'get-settings',
        'query-documents',
        'run-script',
        'set-setting',
        'update-document',
      ].map(n => `${PREFIX}.${n}`)
    );
  });

  it('get-document returns only the requested fields', async () => {
    const { call } = setup();
    const res = await call('get-document', { uuid: 'Actor.a2', fields: ['name', 'system.cr'] });
    expect(res).toEqual({
      uuid: 'Actor.a2',
      documentName: 'Actor',
      data: { name: 'Klarg', 'system.cr': 1 },
    });
  });

  it('get-document fails clearly on an unknown uuid', async () => {
    const { call } = setup();
    await expect(call('get-document', { uuid: 'Actor.nope' })).rejects.toThrow(
      'get-document failed: Document not found: Actor.nope'
    );
  });

  it('query-documents filters by name and exact field values, with pagination', async () => {
    const { call } = setup();
    const res = await call('query-documents', {
      source: 'Actor',
      where: { type: 'npc' },
      fields: ['name'],
      limit: 1,
    });
    expect(res.total).toBe(2);
    expect(res.results).toEqual([{ uuid: 'Actor.a1', name: 'Goblin' }]);

    const byName = await call('query-documents', { source: 'Actor', nameFilter: 'KLA' });
    expect(byName.results.map((r: any) => r.name)).toEqual(['Klarg']);
  });

  it('query-documents rejects an unknown source', async () => {
    const { call } = setup();
    await expect(call('query-documents', { source: 'Nope' })).rejects.toThrow('Unknown source');
  });

  it('create-document resolves the folder by name', async () => {
    const { call, actorCreate } = setup();
    const res = await call('create-document', {
      documentName: 'Actor',
      data: { name: 'Fizzle', type: 'npc' },
      folder: 'NPCs',
    });
    expect(actorCreate).toHaveBeenCalledWith({ name: 'Fizzle', type: 'npc', folder: 'f1' }, {});
    expect(res).toMatchObject({ success: true, name: 'Fizzle' });
  });

  it('update-document applies changes and reports flattened keys', async () => {
    const { call, goblin } = setup();
    const res = await call('update-document', {
      uuid: 'Actor.a1',
      changes: { name: 'Gobelin', system: { cr: 0.5 } },
    });
    expect(goblin.update).toHaveBeenCalledWith({ name: 'Gobelin', system: { cr: 0.5 } });
    expect(res.updatedKeys).toEqual(['name', 'system.cr']);
  });

  it('write handlers are refused when write operations are disabled', async () => {
    const { call, goblin } = setup({ allowWrite: false });
    await expect(call('delete-document', { uuid: 'Actor.a1' })).rejects.toThrow(
      'Write operations are disabled'
    );
    expect(goblin.delete).not.toHaveBeenCalled();
  });

  it('every handler is GM-only', async () => {
    const { call } = setup({ isGM: false });
    await expect(call('get-document', { uuid: 'Actor.a1' })).rejects.toThrow('GM only');
  });

  it('set-setting refuses the bridge permission switches', async () => {
    const { call, settingsStore } = setup({ allowScript: false });
    await expect(
      call('set-setting', { namespace: PREFIX, key: 'allowScriptExecution', value: true })
    ).rejects.toThrow('can only be changed by the GM');
    expect(settingsStore.get(`${PREFIX}.allowScriptExecution`)).toBe(false);
  });

  it('set-setting changes a known setting and rejects unknown ones', async () => {
    const { call } = setup();
    const res = await call('set-setting', {
      namespace: 'dnd5e',
      key: 'metricLengthUnits',
      value: true,
    });
    expect(res).toEqual({ success: true, id: 'dnd5e.metricLengthUnits', value: true });
    await expect(
      call('set-setting', { namespace: 'dnd5e', key: 'nope', value: 1 })
    ).rejects.toThrow('Unknown setting');
  });

  it('get-settings filters by namespace', async () => {
    const { call } = setup();
    const res = await call('get-settings', { namespace: 'dnd5e' });
    expect(res.settings).toEqual([
      { id: 'dnd5e.metricLengthUnits', scope: 'world', name: 'metricLengthUnits', value: false },
    ]);
  });
});

describe('safety guards', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('cannot flip a protected switch through its Setting document', async () => {
    const { call, setting, settingCreate } = setup();
    await expect(
      call('update-document', { uuid: 'Setting.s1', changes: { value: true } })
    ).rejects.toThrow('Setting documents cannot be accessed');
    await expect(
      call('create-document', {
        documentName: 'Setting',
        data: { key: `${PREFIX}.allowScriptExecution`, value: true },
      })
    ).rejects.toThrow('Setting documents cannot be accessed');
    expect(setting.update).not.toHaveBeenCalled();
    expect(settingCreate).not.toHaveBeenCalled();
  });

  it('never exposes User documents (roles, password hashes)', async () => {
    const { call } = setup();
    await expect(call('get-document', { uuid: 'User.u1' })).rejects.toThrow(
      'User documents cannot be accessed'
    );
    await expect(call('query-documents', { source: 'User' })).rejects.toThrow(
      'User documents cannot be accessed'
    );
  });

  it('refuses core permission and module settings', async () => {
    const { call } = setup();
    await expect(
      call('set-setting', { namespace: 'core', key: 'permissions', value: {} })
    ).rejects.toThrow("only be changed by the GM in Foundry's own settings");
  });

  it('hides secret-looking setting values', async () => {
    const { call } = setup();
    const res = await call('get-settings', { namespace: 'some-module' });
    expect(res.settings[0].value).toBe('[hidden]');
  });

  it('script macros need the script execution switch', async () => {
    const { call, macro, macroCreate } = setup({ allowScript: false });
    await expect(
      call('create-document', {
        documentName: 'Macro',
        data: { name: 'x', type: 'script', command: 'game.settings.set(...)' },
      })
    ).rejects.toThrow('Allow Script Execution');
    await expect(
      call('update-document', { uuid: 'Macro.m1', changes: { command: 'evil()' } })
    ).rejects.toThrow('Allow Script Execution');
    expect(macroCreate).not.toHaveBeenCalled();
    expect(macro.update).not.toHaveBeenCalled();

    await call('create-document', {
      documentName: 'Macro',
      data: { name: 'hello', type: 'chat', command: 'Hello' },
    });
    expect(macroCreate).toHaveBeenCalled();
  });

  it('clamps query pagination', async () => {
    const { call } = setup();
    const res = await call('query-documents', { source: 'Actor', limit: -5, offset: -2 });
    expect(res.offset).toBe(0);
    expect(res.results.length).toBe(1);
  });
});

describe('run-script', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('is disabled unless the GM enabled script execution', async () => {
    const { call } = setup({ allowScript: false });
    await expect(call('run-script', { code: 'return 1' })).rejects.toThrow(
      'Script execution is disabled'
    );
  });

  it('runs async code, returns plain JSON and collects logs', async () => {
    const { call } = setup({ allowScript: true });
    const res = await call('run-script', {
      code: 'log("hello", {a:1}); const d = await fromUuid("Actor.a2"); return { name: d.name, n: new Set([1,2]) };',
    });
    expect(res).toEqual({
      success: true,
      result: { name: 'Klarg', n: [1, 2] },
      logs: ['hello {"a":1}'],
    });
  });

  it('serialises documents and guards circular references', async () => {
    const { call } = setup({ allowScript: true });
    const res = await call('run-script', {
      code: 'const o = { doc: await fromUuid("Actor.a1") }; o.self = o; return o;',
    });
    expect(res.result.doc).toMatchObject({ uuid: 'Actor.a1', name: 'Goblin' });
    expect(res.result.self).toBe('[circular]');
  });

  it('rejects empty code and reports script errors', async () => {
    const { call } = setup({ allowScript: true });
    await expect(call('run-script', { code: '  ' })).rejects.toThrow('code is required');
    await expect(call('run-script', { code: 'throw new Error("boom")' })).rejects.toThrow(
      'run-script failed: boom'
    );
  });
});
