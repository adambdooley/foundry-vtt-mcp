## Unreleased

### Added
- Raw document tools: `import-actor`, `export-actor`, `manage-compendium`, `manage-actor-items`, `update-actor-raw`, `run-script`, `bridge-info`. Full actor source (items with activities, effects, prototype token) goes in and out unchanged, world compendiums can be created and filled, embedded items and actors accept verbatim updates (dotted keys and `-=` deletions), and a script can run in the GM client. See `docs/raw-actor-tools.md`.
- File-backed arguments (`filePath`, `scriptFile`, `outFile`) handled by the stdio wrapper on the machine that runs the MCP client, so the backend may live on another host.
- `FOUNDRY_BIND_HOST` for the backend: bind the module-facing WebSocket and WebRTC signaling listeners to a specific interface (for example `127.0.0.1` when the backend runs next to Foundry on a public server).
- Client-scoped module setting "Act as MCP bridge client" so extra GM sessions can stay passive.
- `scripts/headless-gm/headless-gm.mjs`: a puppeteer runner that keeps a dedicated GM user logged in next to the Foundry server so the bridge does not depend on anyone's browser.
- `scripts/mcp-call.mjs` (call any tool from the shell through the wrapper) and `scripts/deploy-module.sh` (rsync the built module to a remote Foundry data directory).

### Changed
- The module reconnects indefinitely with capped backoff instead of giving up after five attempts, and the heartbeat keeps retrying while the MCP server is down.
- Connection type `auto` picks WebSocket for loopback hosts even on HTTPS pages; the WebRTC signaling path is only used for remote hosts.

## v0.8.3 (2026-06-11)

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
