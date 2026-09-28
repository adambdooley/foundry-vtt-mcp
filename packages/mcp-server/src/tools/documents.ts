import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface DocumentToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const UUID_HINT =
  'Foundry UUID, e.g. "JournalEntry.abc.JournalEntryPage.def", "Scene.xyz", "Actor.id.Item.id" or "Compendium.pack-id.Item.id"';

/**
 * Generic tools that forward to the Foundry MCP Bridge document handlers:
 * any document (world or compendium), any page type, world settings, and scripts.
 */
export class DocumentTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: DocumentToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'DocumentTools' });
  }

  getToolDefinitions() {
    const fields = {
      type: 'array',
      items: { type: 'string' },
      description:
        'Optional dot paths to return (e.g. ["name","text.content","system.range"]). Omit for the full document.',
    };
    return [
      {
        name: 'get-document',
        description:
          'Read any Foundry document (world or compendium, any type: journal pages including map/image pages, scenes, actors, items, playlists, macros, folders…) as raw data.',
        inputSchema: {
          type: 'object',
          properties: { uuid: { type: 'string', description: UUID_HINT }, fields },
          required: ['uuid'],
        },
      },
      {
        name: 'query-documents',
        description:
          'List documents of a world collection (Actor, Item, Scene, JournalEntry, Playlist, RollTable, Macro, Folder, Cards…) or of a compendium (pass its id, e.g. "dnd-players-handbook.spells"). Filter by name and exact field values; returns uuids plus the requested fields.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Document type or compendium id' },
            nameFilter: { type: 'string', description: 'Case-insensitive substring of the name' },
            where: {
              type: 'object',
              description: 'Exact matches on dot paths, e.g. {"type":"spell","system.level":3}',
            },
            fields: { ...fields, description: 'Dot paths to return (default: name, type, folder)' },
            limit: { type: 'number', description: 'Max results (default 50)' },
            offset: { type: 'number', description: 'Pagination offset (default 0)' },
          },
          required: ['source'],
        },
      },
      {
        name: 'create-document',
        description:
          'Create any document: a world document (Actor, Item, Scene, JournalEntry, Playlist, Macro, Folder…), an embedded one via parent (JournalEntryPage in a journal, Item on an actor, Token/Wall/Note in a scene, PlaylistSound…), or one inside a compendium via pack.',
        inputSchema: {
          type: 'object',
          properties: {
            documentName: {
              type: 'string',
              description: 'Document class name, e.g. "JournalEntryPage", "Actor", "Folder"',
            },
            data: {
              type: 'object',
              description: 'Document source data (name, type, system, text…)',
            },
            parent: { type: 'string', description: `Parent ${UUID_HINT} for embedded documents` },
            pack: { type: 'string', description: 'Compendium id to create into' },
            folder: { type: 'string', description: 'Folder name or id' },
          },
          required: ['documentName', 'data'],
        },
      },
      {
        name: 'update-document',
        description:
          'Update any document with a changes object (dot paths allowed, e.g. {"grid.units":"m","grid.distance":1.5} on a scene, {"text.content":"<p>…</p>"} on a journal page). Set unlockPack for locked compendiums.',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: { type: 'string', description: UUID_HINT },
            changes: { type: 'object', description: 'Fields to change' },
            unlockPack: {
              type: 'boolean',
              description: 'Unlock the compendium first if it is locked',
            },
          },
          required: ['uuid', 'changes'],
        },
      },
      {
        name: 'duplicate-document',
        description:
          'Copy any document with all its content (pages, images, links, embedded items). Optionally rename and move it to a folder.',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: { type: 'string', description: UUID_HINT },
            name: { type: 'string', description: 'New name' },
            folder: {
              type: ['string', 'null'],
              description: 'Destination folder name or id (null = root)',
            },
          },
          required: ['uuid'],
        },
      },
      {
        name: 'delete-document',
        description: 'Delete any document by UUID. Irreversible: confirm with the user first.',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: { type: 'string', description: UUID_HINT },
            unlockPack: {
              type: 'boolean',
              description: 'Unlock the compendium first if it is locked',
            },
          },
          required: ['uuid'],
        },
      },
      {
        name: 'get-settings',
        description:
          'Read game settings (system, modules, core). Filter by namespace (e.g. "dnd5e", "core") or keys.',
        inputSchema: {
          type: 'object',
          properties: {
            namespace: { type: 'string', description: 'Setting namespace, e.g. "dnd5e"' },
            keys: {
              type: 'array',
              items: { type: 'string' },
              description: 'Keys or full ids to return',
            },
          },
        },
      },
      {
        name: 'set-setting',
        description:
          'Change a game setting (e.g. namespace "dnd5e", key "metricLengthUnits", value true). The bridge permission switches cannot be changed.',
        inputSchema: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            key: { type: 'string' },
            value: { description: 'New value (any JSON type)' },
          },
          required: ['namespace', 'key', 'value'],
        },
      },
      {
        name: 'run-script',
        description:
          'Run JavaScript in the GM Foundry client with the full API (game, canvas, ui, foundry, CONFIG, fromUuid…). Body of an async function: use await and `return` a JSON-serialisable value; `log(...)` collects messages. Requires "Allow Script Execution" in the bridge settings. Tell the user what the script does before running anything destructive.',
        inputSchema: {
          type: 'object',
          properties: { code: { type: 'string', description: 'JavaScript function body' } },
          required: ['code'],
        },
      },
    ];
  }

  /** Names handled by this class, used by the backend dispatcher. */
  static readonly TOOL_NAMES = [
    'get-document',
    'query-documents',
    'create-document',
    'update-document',
    'duplicate-document',
    'delete-document',
    'get-settings',
    'set-setting',
    'run-script',
  ];

  async handle(name: string, args: any): Promise<any> {
    if (!DocumentTools.TOOL_NAMES.includes(name)) throw new Error(`Unknown document tool: ${name}`);
    this.logger.info(`Running ${name}`, { uuid: args?.uuid, source: args?.source });
    try {
      return await this.foundryClient.query(`foundry-mcp-bridge.${name}`, args ?? {});
    } catch (error) {
      this.logger.error(`${name} failed`, error);
      throw new Error(
        `${name} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
