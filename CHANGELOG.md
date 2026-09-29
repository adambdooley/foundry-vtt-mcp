## Unreleased

### New Features

- **Generic document tools** (any system, world or compendium)
  - `get-document` / `query-documents`: read any document by UUID (journal pages of every type, scenes, actors, items, playlists, macros, folders…) or list a world collection / compendium with name filter, exact `where` matches on dot paths, field selection and pagination
  - `create-document` / `update-document` / `duplicate-document` / `delete-document`: full CRUD on any document class, including embedded documents via `parent` (pages, tokens, walls, notes, items on actors) and compendium documents via `pack`; locked packs need an explicit `unlockPack`
  - Folders can be given by name or id; results over 200k characters are truncated with a hint instead of flooding the context
  - Writes reuse the existing **Allow Write Operations** switch; every handler is GM-only
- **Settings tools**: `get-settings` (filter by namespace or keys; values of keys that look like secrets are hidden) and `set-setting`; the bridge's own permission switches, `core.permissions` and `core.moduleConfiguration` cannot be changed by the model
- **Safety guards**: `User` and `Setting` documents are out of reach of the generic tools (no password hashes, no bypass of the switches through the raw Setting document); creating or editing a script macro needs **Allow Script Execution**; writes go through `permissionManager` (`modifyWorld` / `deleteData`); `unlockPack` re-locks the compendium afterwards
- **`run-script`**: runs an async JavaScript body in the GM client with the full Foundry API and returns JSON (documents, Maps, Sets and collections are serialised, cycles guarded; `log()` collects messages). Behind a new **Allow Script Execution** setting, **off by default**, that only the GM can enable
- Tested on Foundry v14.368 with dnd5e 6.0.5 (a full French translation of an adventure module and scene rebuilds were done through these tools)

## v0.8.4 (2026-09-12)

### New Features

- **Scene music tools** (Closes #93)
  - `get-current-scene` and `list-scenes` now include each scene's music binding (`playlist` / `playlistSound` with ids + names)
  - `update-scene-music`: set or clear the binding by id or unique name; writes through `scene.update()` with the core `playlist` / `playlistSound` fields so it syncs to connected clients without a reload. Validates both ids exist before writing; a sound cannot be bound without its parent playlist.

- **Playlist management + playback tools**
  - `manage-playlists` (`create` | `update` | `delete` | `describe`): playlist CRUD on any system; `create` accepts sounds inline (`path` required, plus `name`, `volume`, `repeat`, `fade`); `update` patches playlist fields and/or individual sounds matched by exact id or unique path/name within the playlist; `delete` matches by exact id or name only, never partial; `describe` with no identifier lists all playlists compactly, with an identifier returns the full document including every sound
  - `control-playlist`: `play` (playAll), `stop` (stopAll), `cycle-mode` (sequential -> shuffle -> soundboard), plus per-sound `play-sound` / `stop-sound` - all through the client Playlist API so the server and every connected client stay in sync
  - Both are GM-only (same silent GM validation as every other bridge tool) and system-agnostic

- **ActiveEffect management** (#102)
  - `manage-effects` (`create` | `update` | `delete`): works on effects owned by an actor or by one of its items, with the parent scoped so an effect cannot be mutated through the wrong one
  - `search-character-items` with `type: "effect"` now covers item-owned effects as well as actor-owned ones, each tagged with `scope`, `parentItemId` and `parentItemName`
  - `get-character-entity` resolves items, actor-owned effects and item-owned effects, returning the complete document
  - Items are serialised from `item.toObject()`, so dnd5e Activity data is preserved rather than dropped

- **DSA5 system support** (#81)
  - DSA5 adapter with `normalizePayload` / `describeActorSchema`, plus system detection
  - New `replace-journal-page` tool

- **`manage-actors` gains `place`** (#85) — place existing world actors onto the current scene, rather than only newly created ones

- **Information notifications setting** (#99) — Foundry-side notifications can now be turned off; on by default

### Fixes

- **`use-item` failed outright on Foundry V13/V14** (#105) — it called `game.user.updateTokenTargets`, which is not a supported public API on those versions, so passing `targets` (including `"self"`) aborted the whole operation. Targeting now goes through `Token#setTarget()`, resolves token ids, token names and actor names, and no longer aborts item use when a target cannot be applied — the result reports what succeeded.

- **Windows installer could destroy an existing ComfyUI install on upgrade** (#103) — upgrades now detect a prior installation via `InstallLocation`, a legacy `UninstallString`, or the historical default path; reuse that directory; skip the directory page; and leave an existing ComfyUI directory untouched. `DisplayVersion` is derived from the build rather than hardcoded, and `UninstallString` is written quoted.

- **Large responses timed out over WebRTC** (#89, fixed in #101) — the data channel was created with `maxRetransmits`, making it only partially reliable, so a dropped chunk left the receiver waiting forever for something that would never arrive. The channel is now fully reliable, chunks are paced against the send buffer instead of being dumped into SCTP at once, and a failed reassembly now rejects the waiting query instead of surfacing as a generic timeout.

- **Five defects in `dnd5e-add-feature`** (#91) — stale skill and ability defaults among them

- **Journal page rename** (#95, fixed in #100)

- **`list-dsa5-archetypes` returned nothing** (#77, fixed in #83) — the tool called a `getPackIndex` query that was never registered on the module, and each failure was swallowed, so it reported success with an empty list

- **Scene background lost after `generate-map`** (#79)

- **Map job deduplication ignored the scene name** (#80, fixed in #84) — two jobs differing only by scene name collapsed into one

- **WebSocket loopback regression** (#74, fixed in #82) — `ws://` is used for loopback hosts even on HTTPS pages

- **Module settings CSS leaked** (#97) — `.form-footer` rules are now scoped to the module's own settings forms

### Internal

- Version consistency is now checked in CI across all five manifests (#72), guarding against the drift behind #69
- Release-notes tool count and system list corrected (#71)

## v0.8.3 (2026-08-09)

### New Features

- **Mongoose Traveller 2e (mgt2e) System Support**
  - `list-creatures-by-criteria` now works on mgt2e worlds: filters by hit points, psionics, creature type, and actor type; indexed metadata includes characteristic DMs (STR/DEX/etc.)
  - `search-compendium` extracts mgt2e-relevant stats (hits, behaviour, species, tonnage) from search results
  - `manage-world-items` gains a new `describe` action that returns a live enum reference for mgt2e item fields (weapon traits, scales, armour forms, hardware system discriminators, software classes, etc.) — call it before creating items to get valid keys

- **`manage-actors` — generic actor CRUD tool** (works on any game system)
  - `create`: create one or more actors of any type with arbitrary `system` data; mgt2e convenience: accepts skill shorthands (`{ pilot: 2 }`), lowercase characteristic keys, and `system.details` remapped to `system.sophont`
  - `update`: patch existing actors by ID; mgt2e skill shorthands normalised server-side (avoids Electron module-cache issue that prevented browser-side normalisation)
  - `delete`: delete actors by ID
  - `update-items`: update embedded items on an actor by item ID
  - `delete-items`: delete embedded items from an actor by item ID

### Fixes

- `getIndex()` now uses the return value rather than `pack.indexed` state, fixing compendium indexing on Foundry v13 where `pack.indexed` behaviour changed

---

## v0.8.2 (2026-06-07)

### New Features

- **D&D 5e NPC Creation Suite** (PR #41 by @LManfre)
  - `dnd5e-create-npc` — build a full NPC stat block from scratch (abilities, saves, skills, senses, AC/HP, CR)
  - `dnd5e-add-feature` — one tool with modes: `passive`, `save`, `attack`, `attack-with-save`, `aura`, `spellcasting`, `spells`
  - `dnd5e-add-features-from-compendium` — bulk-import features/spells from compendium packs
  - Targets the dnd5e activities data model (4.x/5.x)

- **WFRP4e (Warhammer Fantasy Roleplay 4e) System Support** (PR #53 by @nyoung)
  - Character extraction: 10 characteristics, wounds, fate/fortune, resilience/resolve, corruption, career/species/class, skills, and arcane/divine spellcasting
  - `get-character` / `list-characters` / `search-character-items` now work on WFRP4e worlds

### Fixes

- **macOS installer** (PR #54): the Claude Desktop config is now merged rather than overwritten, preserving any other configured MCP servers; more robust logged-in-user detection; postinstall scripts no longer abort on a non-critical failure; additional Foundry data-dir locations probed
- **Node 26 install failure** (Issue #51, reported by @frankyh75): removed the unused `better-sqlite3` dependency, which failed to build against Node 26's V8 ABI

---

## v0.6.2 (2025-12-03)

### New Features

- **Spellcasting Data Extraction** (Issue #14)
  - `get-character` now returns full spellcasting entries with spell lists
  - PF2e: Spellcasting entries with traditions, DC, attack, slots, prepared/expended status
  - D&D 5e: Class-based spellcasting with spell slots and prepared spells
  - DSA5: Zauber (spells), Liturgien, Zeremonien, Rituale with AsP/KaP tracking
  - **Spell Targeting Info**: Each spell now includes `range`, `target`, and `area` fields
    - D&D 5e: Range (Self/Touch/60 ft), target type (1 creature/self/area), area template
    - PF2e: Range, descriptive target, area type (emanation/cone/burst)
    - DSA5: Reichweite, Zielkategorie, Wirkungsbereich

- **Use Item Tool** (`use-item`)
  - Cast spells, use abilities, activate features, consume items
  - Works across systems: D&D 5e, PF2e, DSA5
  - Supports spell upcasting (D&D 5e)
  - Proper resource consumption (spell slots, charges, consumables)
  - GM-only with character targeting
  - **Target Selection**: Specify targets by name or use `["self"]` to target caster
    - Example: "Have Clark cast Magic Missile on the Goblin"
    - Example: "Have Vitch use a healing potion on himself"
    - Targets set via Foundry's targeting system before item use

- **Search Character Items Tool** (`search-character-items`)
  - Token-efficient item search within a character's inventory
  - Filter by type (weapon, spell, feat, equipment, etc.)
  - Filter by category (items, spells, features, all)
  - Text search across item names and descriptions
  - Returns compact results without full descriptions

---

## v0.6.1 (2025-12-03)

### New Features

- **DSA5 System Support** (PR #12 by @frankyh75)
  - Full SystemAdapter implementation for Das Schwarze Auge 5
  - Supports all 8 Eigenschaften (MU/KL/IN/CH/FF/GE/KO/KK)
  - LeP, AsP, KaP resource tracking
  - DSA5-specific filters: level, species, culture, size, hasSpells
  - DSA5IndexBuilder for creature compendium indexing
  - DSA5 character creation from archetypes

- **Token Manipulation Tools** (PR #13)
  - `move-token` - Move tokens with optional animation
  - `update-token` - Update visibility, disposition, size, rotation, elevation
  - `delete-tokens` - Bulk token deletion
  - `get-token-details` - Detailed token info with linked actor data
  - `toggle-token-condition` - Apply/remove status effects (prone, poisoned, etc.)
  - `get-available-conditions` - List system-specific status effects

- **Character API Optimization** (PR #9)
  - Lazy-loading: `get-character` now returns minimal item metadata (no descriptions)
  - New `get-character-entity` tool for on-demand full entity details
  - Removed 20-item limit - now returns ALL items
  - ~37% token reduction per character
  - PF2e: traits, rarity, level, actionType
  - D&D 5e: attunement status

### Improvements

- **Documentation** (PR #8)
  - Clarified search-compendium limitations (name-only search, heuristic filters)
  - Directed users to list-creatures-by-criteria for accurate filtering

---

## v0.4.17 (2025-09-09)

- Wrapper/backend architecture: convert MCP entry to a thin stdio wrapper that proxies to a singleton backend over `127.0.0.1:31414`.
- Backend singleton + lock: backend binds Foundry connector on `31415` and creates `%TEMP%\foundry-mcp-backend.lock`.
- Startup race fix: resolves Claude Desktop duplicate-start race by keeping wrappers alive and ensuring only one backend owns ports.
- Runtime stability: backend now bundled (`dist/backend.bundle.cjs`) and preferred by wrapper for reliable startup in installer environments.
- Shared package now emits JS + d.ts, ensuring runtime availability for both dev and installer.
- Logging: wrapper writes to `%TEMP%\foundry-mcp-server\wrapper.log`; backend logs to `%TEMP%\foundry-mcp-server\mcp-server.log`.
- Installer: enhanced staging to include full server `dist`, bundled wrapper `index.cjs`, bundled backend, and `node_modules/@foundry-mcp/shared`.
- Build scripts: added root convenience scripts (`build:release`, `bundle:server`, `installer:stage`); NSIS script accepts `--skip-download` and `--skip-nsis` for staging-only runs.

Notes

- No changes needed for CI; existing workflows continue to build bundles and the installer.
- Foundry MCP Bridge port remains `31415`. Control channel is `31414` (internal wrapper↔backend only).
