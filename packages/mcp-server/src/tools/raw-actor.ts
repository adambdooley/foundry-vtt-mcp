/**
 * Raw Actor Tools
 *
 * Raw, high-fidelity access to Foundry documents:
 * full actor import/export (items with activities included), world compendium
 * management, verbatim embedded-item and actor updates, an arbitrary script
 * escape hatch, and a bridge diagnostics probe.
 *
 * Every handler forwards to a `foundry-mcp-bridge.raw.*` query in the module.
 *
 * The `filePath` / `scriptFile` / `outFile` arguments are advertised in the schemas
 * so MCP clients can use them, but they are handled entirely by the stdio wrapper
 * (src/tool-files.ts) before the call reaches this class. The only one this class
 * looks at is `outFile`, and only to decide whether a large payload may be inlined.
 */

import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

// ─────────────────────────────────────────────────────────────────────────────

/** Largest tool response returned inline, in characters of serialized JSON. */
export const MAX_INLINE_RESPONSE_CHARS = 200_000;

export interface RawActorToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const actorDataSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
  })
  .passthrough();

const destinationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('world'), folder: z.string().min(1).optional() }),
  z.object({ type: z.literal('pack'), pack: z.string().min(1) }),
]);

export class RawActorTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: RawActorToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'RawActorTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'import-actor',
        description:
          'Import complete actor documents into the world or a compendium pack. Accepts full ' +
          'Foundry actor source including items with activities; the recommended way to create ' +
          'monsters with legendary actions, recharge, templates and spell links.\n' +
          '- Provide exactly one of "actors" (inline) or "filePath" (a JSON file on the machine ' +
          'running this MCP server, holding one actor object or an array of them).\n' +
          '- "destination" targets the world (optionally a named folder) or a compendium pack.\n' +
          '- "replace": "byName" (default) removes same-named documents in the destination first, ' +
          '"none" keeps them.\n' +
          '- A failing actor does not abort the rest; failures come back in "errors".',
        inputSchema: {
          type: 'object',
          properties: {
            actors: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              description:
                'Full actor source objects as returned by export-actor, each with "name" and ' +
                '"type" plus optional "system", "items", "effects", "prototypeToken", "flags". ' +
                'Mutually exclusive with "filePath".',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Display name of the actor.' },
                  type: {
                    type: 'string',
                    description: 'Actor type valid for the active game system, e.g. "npc".',
                  },
                  img: { type: 'string', description: 'Portrait path.' },
                  system: {
                    type: 'object',
                    additionalProperties: true,
                    description: 'System data, passed to Foundry unchanged.',
                  },
                  items: {
                    type: 'array',
                    description:
                      'Full embedded item source objects, including "system.activities".',
                    items: { type: 'object', additionalProperties: true },
                  },
                },
                required: ['name', 'type'],
                additionalProperties: true,
              },
            },
            filePath: {
              type: 'string',
              description:
                'Path to a JSON file holding one actor object or an array of actor objects. ' +
                'Read by the MCP wrapper before the call is forwarded. ' +
                'Mutually exclusive with "actors".',
            },
            destination: {
              type: 'object',
              description: 'Where the actors go: the world or a compendium pack.',
              properties: {
                type: {
                  type: 'string',
                  enum: ['world', 'pack'],
                  description: '"world" for game.actors, "pack" for a compendium.',
                },
                folder: {
                  type: 'string',
                  description:
                    'For type "world": Actor folder name, created if absent. Defaults to "Imported Actors".',
                },
                pack: {
                  type: 'string',
                  description:
                    'For type "pack": pack collection id (e.g. "world.my-bestiary"), label, or name.',
                },
              },
              required: ['type'],
            },
            replace: {
              type: 'string',
              enum: ['byName', 'none'],
              description:
                'Delete same-named documents in the destination before creating. Defaults to "byName".',
            },
            keepId: {
              type: 'boolean',
              description:
                'Keep the "_id" values from the source data instead of letting Foundry assign new ones. Defaults to false.',
            },
          },
          required: ['destination'],
        },
      },
      {
        name: 'export-actor',
        description:
          'Export one actor as its full Foundry source object, items and activities included. ' +
          'Use it to snapshot a monster before editing, or to copy an actor between worlds and ' +
          'compendiums together with import-actor.\n' +
          '- The actor is resolved by UUID, id, exact name, then case-insensitive partial name.\n' +
          '- Pass "outFile" for large actors: the source is written to that path and the response ' +
          'shrinks to a summary. Without it, responses above ' +
          `${MAX_INLINE_RESPONSE_CHARS} characters are refused.`,
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Actor UUID, id, or name. Partial names must be unambiguous.',
            },
            pack: {
              type: 'string',
              description:
                'Optional compendium pack to look in (collection id, label, or name) instead of the world.',
            },
            outFile: {
              type: 'string',
              description:
                'Path to write the actor source JSON to (pretty-printed, UTF-8; directories are ' +
                'created). Written by the MCP wrapper on the machine running this server.',
            },
          },
          required: ['actorIdentifier'],
        },
      },
      {
        name: 'manage-compendium',
        description:
          'Inspect and manage compendium packs of the current world.\n' +
          '- "list": all packs with collection id, label, document type, locked flag and size.\n' +
          '- "create": make a world pack (returns the existing one if the name is taken).\n' +
          '- "contents": index entries of one pack.\n' +
          '- "delete-entries": remove entries by id or by exact name.\n' +
          '- "lock" / "unlock": toggle the pack lock.\n' +
          '- "delete-pack": drop a world pack entirely (world packs only).',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'create',
                'contents',
                'delete-entries',
                'lock',
                'unlock',
                'delete-pack',
              ],
              description: 'Operation to perform.',
            },
            pack: {
              type: 'string',
              description:
                'Required for every action except "list" and "create". Pack collection id ' +
                '(e.g. "world.my-bestiary"), label, or name.',
            },
            label: {
              type: 'string',
              description: 'Required for "create". Display name, e.g. "My Bestiary".',
            },
            name: {
              type: 'string',
              description:
                'For "create". Machine name; defaults to a latin/hyphen slug of the label.',
            },
            documentType: {
              type: 'string',
              enum: ['Actor', 'Item', 'JournalEntry', 'Scene', 'RollTable', 'Macro'],
              description: 'For "create". Document type of the pack. Defaults to "Actor".',
            },
            entryIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'For "delete-entries". Entry ids to remove.',
            },
            entryNames: {
              type: 'array',
              items: { type: 'string' },
              description: 'For "delete-entries". Exact entry names to remove.',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'manage-actor-items',
        description:
          'Work with the embedded items of one actor at source level.\n' +
          '- "list": items with uses, activities and compendium source.\n' +
          '- "create": add full item source objects, activities included.\n' +
          '- "update-raw": pass updates to Foundry verbatim, so dotted keys ' +
          '("system.uses.max") and key deletions ("system.activities.-=abc123": null) survive. ' +
          'Use this instead of manage-actors "update-items" whenever a nested field must be kept.\n' +
          '- "delete": remove items by id.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Actor UUID, id, or name. Partial names must be unambiguous.',
            },
            action: {
              type: 'string',
              enum: ['list', 'create', 'update-raw', 'delete'],
              description: 'Operation to perform.',
            },
            items: {
              type: 'array',
              minItems: 1,
              description:
                'Required for "create". Full item source objects, passed to Foundry as they are.',
              items: { type: 'object', additionalProperties: true },
            },
            updates: {
              type: 'array',
              minItems: 1,
              description:
                'Required for "update-raw". Each entry needs "_id" plus the keys to change; ' +
                'dotted paths and "-=" deletions are forwarded unchanged.',
              items: {
                type: 'object',
                properties: { _id: { type: 'string', description: 'Embedded item id.' } },
                required: ['_id'],
                additionalProperties: true,
              },
            },
            itemIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Required for "delete". Ids of the embedded items to remove.',
            },
            filePath: {
              type: 'string',
              description:
                'Path to a JSON file holding the "items" ("create") or "updates" ("update-raw") ' +
                'array. Read by the MCP wrapper before the call is forwarded.',
            },
          },
          required: ['actorIdentifier', 'action'],
        },
      },
      {
        name: 'update-actor-raw',
        description:
          'Update one actor with a verbatim Foundry update object. Dotted keys ' +
          '("system.attributes.hp.max") reach Foundry untouched, so sibling fields survive - ' +
          'unlike manage-actors "update", which replaces nested system objects wholesale. ' +
          'Key deletion via "-=" is supported.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Actor UUID, id, or name. Partial names must be unambiguous.',
            },
            update: {
              type: 'object',
              additionalProperties: true,
              description:
                'Update keys passed straight to actor.update(), e.g. ' +
                '{"system.attributes.hp.max": 120, "name": "Goblin Boss"}.',
            },
            filePath: {
              type: 'string',
              description:
                'Path to a JSON file holding the update object. Read by the MCP wrapper before ' +
                'the call is forwarded. Mutually exclusive with "update".',
            },
          },
          required: ['actorIdentifier'],
        },
      },
      {
        name: 'run-script',
        description:
          'Run a JavaScript snippet inside the GM browser client that acts as the bridge. ' +
          'The snippet is the body of an async function receiving "args"; "return" hands the ' +
          'value back. Use it for one-off maintenance no other tool covers. Requires GM and ' +
          'enabled write operations; errors come back with their stack instead of throwing.',
        inputSchema: {
          type: 'object',
          properties: {
            script: {
              type: 'string',
              description:
                'Async function body, e.g. "return game.actors.size;". Mutually exclusive with "scriptFile".',
            },
            scriptFile: {
              type: 'string',
              description:
                'Path to a .js file holding the script body. Read by the MCP wrapper before the ' +
                'call is forwarded. Mutually exclusive with "script".',
            },
            args: {
              description: 'Optional JSON value handed to the script as "args".',
            },
            timeoutMs: {
              type: 'number',
              description: 'Abort the script after this many milliseconds. Defaults to 60000.',
            },
          },
        },
      },
      {
        name: 'bridge-info',
        description:
          'Report which Foundry client currently acts as the MCP bridge: user, GM flag, world, ' +
          'game system and version, core version, module version, connection type and origin URL. ' +
          'Call it first when bridge behaviour looks wrong.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  // ── import-actor ──────────────────────────────────────────────────────────

  async handleImportActor(args: any): Promise<any> {
    const schema = z.object({
      actors: z.array(actorDataSchema).min(1).max(50),
      destination: destinationSchema,
      replace: z.enum(['byName', 'none']).default('byName'),
      keepId: z.boolean().default(false),
    });

    const { actors, destination, replace, keepId } = schema.parse(args);

    this.logger.info('Importing actors', {
      count: actors.length,
      destination: destination.type,
      replace,
      keepId,
    });

    return await this.foundryClient.query('foundry-mcp-bridge.raw.importActors', {
      actors,
      destination,
      replace,
      keepId,
    });
  }

  // ── export-actor ──────────────────────────────────────────────────────────

  async handleExportActor(args: any): Promise<any> {
    const schema = z.object({
      actorIdentifier: z.string().min(1),
      pack: z.string().min(1).optional(),
      outFile: z.string().min(1).optional(),
    });

    const { actorIdentifier, pack, outFile } = schema.parse(args);

    this.logger.info('Exporting actor', { actorIdentifier, pack, toFile: !!outFile });

    const result = await this.foundryClient.query('foundry-mcp-bridge.raw.exportActor', {
      actorIdentifier,
      pack,
    });

    this.assertWithinInlineLimit(result, outFile, 'export-actor');

    return result;
  }

  // ── manage-compendium ─────────────────────────────────────────────────────

  async handleManageCompendium(args: any): Promise<any> {
    const schema = z.object({
      action: z.enum([
        'list',
        'create',
        'contents',
        'delete-entries',
        'lock',
        'unlock',
        'delete-pack',
      ]),
      pack: z.string().min(1).optional(),
      label: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      documentType: z
        .enum(['Actor', 'Item', 'JournalEntry', 'Scene', 'RollTable', 'Macro'])
        .optional(),
      entryIds: z.array(z.string().min(1)).optional(),
      entryNames: z.array(z.string().min(1)).optional(),
    });

    const parsed = schema.parse(args);
    const { action, pack, label, entryIds, entryNames } = parsed;

    if (action !== 'list' && action !== 'create' && !pack) {
      throw new Error(`manage-compendium action "${action}" requires "pack"`);
    }
    if (action === 'create' && !label) {
      throw new Error('manage-compendium action "create" requires "label"');
    }
    if (action === 'delete-entries' && !entryIds?.length && !entryNames?.length) {
      throw new Error(
        'manage-compendium action "delete-entries" requires "entryIds" or "entryNames"'
      );
    }

    this.logger.info('Managing compendium', { action, pack });

    return await this.foundryClient.query('foundry-mcp-bridge.raw.manageCompendium', parsed);
  }

  // ── manage-actor-items ────────────────────────────────────────────────────

  async handleManageActorItems(args: any): Promise<any> {
    const schema = z.object({
      actorIdentifier: z.string().min(1),
      action: z.enum(['list', 'create', 'update-raw', 'delete']),
      items: z.array(z.record(z.any())).min(1).optional(),
      updates: z
        .array(z.object({ _id: z.string().min(1) }).passthrough())
        .min(1)
        .optional(),
      itemIds: z.array(z.string().min(1)).min(1).optional(),
    });

    const { actorIdentifier, action, items, updates, itemIds } = schema.parse(args);

    if (action === 'create' && !items) {
      throw new Error('manage-actor-items action "create" requires "items" or "filePath"');
    }
    if (action === 'update-raw' && !updates) {
      throw new Error('manage-actor-items action "update-raw" requires "updates" or "filePath"');
    }
    if (action === 'delete' && !itemIds) {
      throw new Error('manage-actor-items action "delete" requires "itemIds"');
    }

    this.logger.info('Managing actor items', { actorIdentifier, action });

    const result = await this.foundryClient.query('foundry-mcp-bridge.raw.manageActorItems', {
      actorIdentifier,
      action,
      items,
      updates,
      itemIds,
    });

    if (action === 'list') {
      this.assertWithinInlineLimit(result, undefined, 'manage-actor-items list');
    }

    return result;
  }

  // ── update-actor-raw ──────────────────────────────────────────────────────

  async handleUpdateActorRaw(args: any): Promise<any> {
    const schema = z.object({
      actorIdentifier: z.string().min(1),
      update: z.record(z.any()),
    });

    const { actorIdentifier, update } = schema.parse(args);

    if (Object.keys(update).length === 0) {
      throw new Error('update-actor-raw requires at least one key in "update"');
    }

    this.logger.info('Updating actor verbatim', {
      actorIdentifier,
      keys: Object.keys(update).length,
    });

    return await this.foundryClient.query('foundry-mcp-bridge.raw.updateActor', {
      actorIdentifier,
      update,
    });
  }

  // ── run-script ────────────────────────────────────────────────────────────

  async handleRunScript(args: any): Promise<any> {
    const schema = z.object({
      script: z.string().min(1),
      args: z.any().optional(),
      timeoutMs: z.number().int().positive().optional(),
    });

    const { script, args: scriptArgs, timeoutMs } = schema.parse(args);

    this.logger.info('Running bridge script', { length: script.length, timeoutMs });

    return await this.foundryClient.query('foundry-mcp-bridge.raw.runScript', {
      script,
      args: scriptArgs,
      timeoutMs,
    });
  }

  // ── bridge-info ───────────────────────────────────────────────────────────

  async handleBridgeInfo(_args?: any): Promise<any> {
    this.logger.info('Querying bridge info');

    return await this.foundryClient.query('foundry-mcp-bridge.raw.bridgeInfo', {});
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Refuse payloads too large to hand back inline. export-actor can spill to disk
   * via "outFile"; other callers are told to use it.
   */
  private assertWithinInlineLimit(result: unknown, outFile: string | undefined, label: string) {
    if (outFile) return;

    const size = JSON.stringify(result)?.length ?? 0;
    if (size <= MAX_INLINE_RESPONSE_CHARS) return;

    throw new Error(
      `${label} produced ${size} characters, over the ${MAX_INLINE_RESPONSE_CHARS} character response limit. ` +
        'Re-run export-actor with "outFile" to write the payload to a file instead.'
    );
  }
}
