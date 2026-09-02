# Raw document tools

Seven tools that give an MCP client the same level of access a GM has in the Foundry console, without going through system-specific helpers. They were written for D&D 5e 4.x/5.x actors whose buttons live in `system.activities`, but nothing in them is system-specific: documents go in and out as Foundry source data.

All of them run through the Foundry module as `foundry-mcp-bridge.raw.*` queries (`packages/foundry-module/src/raw-handlers.ts`) and are exposed by `packages/mcp-server/src/tools/raw-actor.ts`. Every handler requires a GM user and the module setting **Allow write operations** for anything that writes.

| Tool | What it does |
|---|---|
| `import-actor` | Create complete actors from source data (`system`, `items` with activities, `effects`, `prototypeToken`, `flags`) in the world or in a compendium pack. `replace: "byName"` (default) deletes same-named documents in the destination first; `keepId` keeps the `_id` values from the source. Failures are per actor and reported in `errors`. |
| `export-actor` | Return `actor.toObject()` for a world actor or a compendium entry. With `outFile` the payload is written to disk by the wrapper and the response shrinks to a summary. |
| `manage-compendium` | `list`, `create`, `contents`, `delete-entries`, `lock`, `unlock`, `delete-pack` for world packs (creation and deletion are world packs only). Locked packs are unlocked for the duration of a write and re-locked afterwards. |
| `manage-actor-items` | `list`, `create` (full item source), `update-raw` (passed to `updateEmbeddedDocuments` verbatim, so dotted keys and `-=` deletions work), `delete`. |
| `update-actor-raw` | `actor.update(update)` verbatim. Unlike `manage-actors`, nested objects are not replaced wholesale. |
| `run-script` | Run the body of an async function inside the GM client with `game` available and `args` passed in. Errors and stack traces come back in the result instead of failing the call. |
| `bridge-info` | Which user, world, system and connection type the bridge is running as. |

## Actor identifiers

`actorIdentifier` resolves in this order: UUID (world actors and compendium entries), world actor id, exact world actor name, then a case-insensitive partial name match. An ambiguous partial match is an error that lists the candidates.

`pack` resolves as collection id (`world.my-bestiary`), then pack label, then pack name.

## Files stay on the client machine

`filePath`, `scriptFile` and `outFile` are handled by the stdio wrapper (`packages/mcp-server/src/tool-files.ts`) before the call reaches the backend, so the backend can run on a different host than the MCP client. A `filePath` for `import-actor` may hold one actor object or an array; for `manage-actor-items` it feeds `items` or `updates` depending on `action`; for `update-actor-raw` it holds the update object; `scriptFile` holds the script text. Inline responses are capped at 200,000 characters; `export-actor` beyond that requires `outFile`.

## Typical flow: building a monster with buttons

1. Build the actor source however you like (an exporter, a converter from a stat block, or a copy of an SRD actor from `export-actor`). For dnd5e 5.x each button is an activity inside an item: `attack`, `save`, `damage`, `heal`, `utility`, `cast`, with `activation.type` (`action`, `bonus`, `reaction`, `legendary`) and `consumption.targets` for charges, item uses or `resources.legact.value`.
2. `manage-compendium` with `action: "create"` once, to get a world pack.
3. `import-actor` with `filePath` and `destination: { type: "pack", pack: "world.my-bestiary" }`.
4. Verify without opening a sheet through `run-script`, for example by reading `activity.labels` (`toHit`, `damage`, `save`, `range`, `target`) on the imported document.

## Running the bridge without a browser

`scripts/headless-gm/headless-gm.mjs` keeps a dedicated GM user logged in through a headless Chrome next to the Foundry server. Together with `FOUNDRY_BIND_HOST=127.0.0.1` on the backend and an SSH tunnel to the control port (31414) from the MCP client machine, the bridge stays up as long as the server does. See the comments at the top of the script for the environment variables; `HEADLESS_NO_CANVAS=1` disables canvas rendering for that user to keep CPU usage near zero.

Other GM sessions on the same world should untick the client-scoped module setting **Act as MCP bridge client**, otherwise every GM browser tries to reach the MCP server on its own localhost.
