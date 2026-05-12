# Complete MCP Tool Inventory

## Overview

This document provides a comprehensive inventory of all MCP tools across the three branches.

## Branch Summary

| Branch                                                             | Total Tools | Status      | Version |
| ------------------------------------------------------------------ | ----------- | ----------- | ------- |
| **Baseline** (claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9) | **26**      | ✅ Working  | v0.6.1  |
| **Master**                                                         | **23**      | ✅ Working  | v0.4.17 |
| **Broken** (claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB)    | **32**      | ⚠️ Unstable | v0.6.2  |

---

## BASELINE BRANCH TOOLS (26 Total)

### Character Tools (2)

#### 1. get-character

- **Description:** Retrieve detailed information about a specific character by name or ID
- **Input:** `identifier` (string) - Character name or ID
- **Output:** Full character data including stats, resources, skills, items
- **File:** `packages/mcp-server/src/tools/character.ts`
- **Status:** ✅ Working
- **System Support:** D&D5e, PF2e, DSA5

#### 2. list-characters

- **Description:** List all available characters with basic information
- **Input:** `type` (string, optional) - Filter by actor type
- **Output:** Array of character summaries
- **File:** `packages/mcp-server/src/tools/character.ts`
- **Status:** ✅ Working
- **System Support:** D&D5e, PF2e, DSA5

### Compendium Tools (4)

#### 3. search-compendium

- **Description:** Search compendium packs for items, spells, monsters, etc.
- **Input:**
  - `query` (string) - Search query
  - `packName` (string, optional) - Specific pack to search
  - `type` (string, optional) - Item type filter
- **Output:** Array of matching items with basic info
- **File:** `packages/mcp-server/src/tools/compendium.ts`
- **Status:** ✅ Working
- **Notes:** Name-only search, heuristic filters

#### 4. get-compendium-item

- **Description:** Get detailed information about a specific compendium item
- **Input:**
  - `packName` (string) - Pack ID
  - `itemId` (string) - Item ID
  - `compact` (boolean, optional) - Return minimal data
- **Output:** Complete item data with description and stats
- **File:** `packages/mcp-server/src/tools/compendium.ts`
- **Status:** ✅ Working
- **Notes:** Handles DSA5 items correctly in baseline

#### 5. list-creatures-by-criteria

- **Description:** List creatures from compendium filtered by CR/Level, type, size, etc.
- **Input:**
  - `cr` (string, optional) - Challenge Rating or Level
  - `creatureType` (string, optional) - Creature type
  - `size` (string, optional) - Size category
  - `alignment` (string, optional) - Alignment
  - **DSA5:** `level`, `species`, `culture`, `hasSpells`
- **Output:** Array of creatures matching criteria
- **File:** `packages/mcp-server/src/tools/compendium.ts`
- **Status:** ✅ Working
- **Notes:** Uses SystemAdapter for filtering

#### 6. list-compendium-packs

- **Description:** List all available compendium packs
- **Input:** None
- **Output:** Array of pack info (id, label, type)
- **File:** `packages/mcp-server/src/tools/compendium.ts`
- **Status:** ✅ Working
- **System Support:** All systems

### Scene Tools (2)

#### 7. get-current-scene

- **Description:** Get information about the currently active scene
- **Input:** None
- **Output:** Scene data (name, dimensions, tokens, walls, lights)
- **File:** `packages/mcp-server/src/tools/scene.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 8. get-world-info

- **Description:** Get basic information about the Foundry world
- **Input:** None
- **Output:** World title, system, version, user info
- **File:** `packages/mcp-server/src/tools/scene.ts`
- **Status:** ✅ Working
- **System Support:** All systems

### Actor Creation Tools (2)

#### 9. create-actor-from-compendium

- **Description:** Create an actor from a compendium entry
- **Input:**
  - `packName` (string) - Compendium pack ID
  - `entryId` (string) - Entry ID
  - `name` (string, optional) - Custom name
  - `folder` (string, optional) - Folder ID
- **Output:** Created actor data
- **File:** `packages/mcp-server/src/tools/actor-creation.ts`
- **Status:** ✅ Working
- **System Support:** D&D5e, PF2e, DSA5

#### 10. get-compendium-entry-full

- **Description:** Get full details of a compendium entry before creation
- **Input:**
  - `packName` (string) - Pack ID
  - `entryId` (string) - Entry ID
- **Output:** Complete entry data
- **File:** `packages/mcp-server/src/tools/actor-creation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

### DSA5 Character Creation Tools (2)

#### 11. create-dsa5-character-from-archetype

- **Description:** Create a DSA5 character from an archetype template
- **Input:**
  - `archetypeName` (string) - Archetype name
  - `characterName` (string) - Character name
  - `age` (number, optional) - Character age
  - `biography` (string, optional) - Background story
  - `gender` (string, optional) - Gender
  - `eyeColor`, `hairColor`, `height`, `weight` (optional) - Appearance
  - `species`, `culture`, `profession` (optional) - Overrides
- **Output:** Created character data
- **File:** `packages/mcp-server/src/systems/dsa5/character-creator.ts`
- **Status:** ✅ Working
- **System Support:** DSA5 only

#### 12. list-dsa5-archetypes

- **Description:** List available DSA5 character archetypes
- **Input:**
  - `species` (string, optional) - Filter by species
- **Output:** Array of archetype info
- **File:** `packages/mcp-server/src/systems/dsa5/character-creator.ts`
- **Status:** ✅ Working
- **System Support:** DSA5 only

### Quest/Journal Tools (5)

#### 13. create-quest-journal

- **Description:** Create a new quest journal entry
- **Input:**
  - `title` (string) - Quest title
  - `content` (string) - Quest description (supports HTML)
  - `folder` (string, optional) - Folder ID
- **Output:** Created journal data
- **File:** `packages/mcp-server/src/tools/quest-creation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 14. link-quest-to-npc

- **Description:** Link a quest journal to an NPC actor
- **Input:**
  - `journalId` (string) - Journal ID
  - `actorId` (string) - NPC actor ID
- **Output:** Updated journal/actor data
- **File:** `packages/mcp-server/src/tools/quest-creation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 15. update-quest-journal

- **Description:** Update an existing quest journal
- **Input:**
  - `journalId` (string) - Journal ID
  - `updates` (object) - Fields to update
- **Output:** Updated journal data
- **File:** `packages/mcp-server/src/tools/quest-creation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 16. list-journals

- **Description:** List all journal entries
- **Input:**
  - `folder` (string, optional) - Filter by folder
- **Output:** Array of journal summaries
- **File:** `packages/mcp-server/src/tools/quest-creation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 17. search-journals

- **Description:** Search journal entries by query
- **Input:**
  - `query` (string) - Search query
- **Output:** Matching journals
- **File:** `packages/mcp-server/src/tools/quest-creation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

### Dice Roll Tools (1)

#### 18. request-player-rolls

- **Description:** Request dice rolls from players
- **Input:**
  - `playerName` (string) - Player name
  - `rollFormula` (string) - Dice formula (e.g., "1d20+5")
  - `label` (string, optional) - Roll description
- **Output:** Roll request confirmation
- **File:** `packages/mcp-server/src/tools/dice-roll.ts`
- **Status:** ✅ Working
- **System Support:** All systems

### Campaign Management Tools (1)

#### 19. create-campaign-dashboard

- **Description:** Create a campaign dashboard journal
- **Input:**
  - `title` (string) - Dashboard title
  - `content` (string) - Dashboard content
- **Output:** Created dashboard data
- **File:** `packages/mcp-server/src/tools/campaign-management.ts`
- **Status:** ✅ Working
- **System Support:** All systems

### Ownership Tools (3)

#### 20. assign-actor-ownership

- **Description:** Assign ownership of an actor to a user
- **Input:**
  - `actorId` (string) - Actor ID
  - `userId` (string) - User ID
  - `level` (number) - Ownership level (0-3)
- **Output:** Updated ownership data
- **File:** `packages/mcp-server/src/tools/ownership.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 21. remove-actor-ownership

- **Description:** Remove ownership of an actor from a user
- **Input:**
  - `actorId` (string) - Actor ID
  - `userId` (string) - User ID
- **Output:** Updated ownership data
- **File:** `packages/mcp-server/src/tools/ownership.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 22. list-actor-ownership

- **Description:** List ownership information for an actor
- **Input:**
  - `actorId` (string) - Actor ID
- **Output:** Ownership list (userId → level mapping)
- **File:** `packages/mcp-server/src/tools/ownership.ts`
- **Status:** ✅ Working
- **System Support:** All systems

### Map Generation Tools (5)

#### 23. generate-map

- **Description:** Generate a battlemap using AI (ComfyUI)
- **Input:**
  - `prompt` (string) - Map description
  - `scene_name` (string) - Scene name
  - `size` (string, optional) - Map size
  - `grid_size` (number, optional) - Grid size
  - `quality` (string, optional) - Generation quality
- **Output:** Job ID for tracking
- **File:** `packages/mcp-server/src/tools/map-generation.ts`
- **Status:** ✅ Working
- **System Support:** All systems
- **Requires:** ComfyUI backend

#### 24. check-map-status

- **Description:** Check the status of a map generation job
- **Input:**
  - `jobId` (string) - Job ID
- **Output:** Job status (pending/complete/failed)
- **File:** `packages/mcp-server/src/tools/map-generation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 25. cancel-map-job

- **Description:** Cancel a running map generation job
- **Input:**
  - `jobId` (string) - Job ID
- **Output:** Cancellation confirmation
- **File:** `packages/mcp-server/src/tools/map-generation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 26. list-scenes

- **Description:** List all available scenes
- **Input:** None
- **Output:** Array of scene info
- **File:** `packages/mcp-server/src/tools/map-generation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

#### 27. switch-scene

- **Description:** Switch to a different scene
- **Input:**
  - `sceneId` (string) - Scene ID
- **Output:** Scene switch confirmation
- **File:** `packages/mcp-server/src/tools/map-generation.ts`
- **Status:** ✅ Working
- **System Support:** All systems

---

## MASTER BRANCH TOOLS (23 Total)

**All baseline tools EXCEPT:**

- ❌ create-dsa5-character-from-archetype
- ❌ list-dsa5-archetypes

**Total:** 25 tools (baseline) - 2 DSA5 tools = 23 tools

---

## BROKEN BRANCH TOOLS (32 Total)

**All 26 baseline tools PLUS 7 new tools:**

### NEW: Character Tools (+1)

#### 28. get-character-entity ⭐ NEW

- **Description:** Retrieve full details for a specific entity from a character (items, actions, spells, effects)
- **Input:**
  - `characterIdentifier` (string) - Character name or ID
  - `entityIdentifier` (string) - Entity name or ID
- **Output:** Complete entity data with description and all system properties
- **File:** `packages/mcp-server/src/tools/character.ts`
- **Status:** ⚠️ In broken branch
- **System Support:** D&D5e, PF2e, DSA5
- **Use Case:** Lazy-loading pattern - get-character returns minimal item metadata, use this for full details

### NEW: Token Manipulation Tools (+6) ⭐

#### 29. move-token ⭐ NEW

- **Description:** Move a token to a new position on the current scene with optional animation
- **Input:**
  - `tokenId` (string) - Token ID
  - `x` (number) - X coordinate
  - `y` (number) - Y coordinate
  - `animate` (boolean, optional) - Animate movement
- **Output:** Updated token data
- **File:** `packages/mcp-server/src/tools/token-manipulation.ts`
- **Status:** ⚠️ In broken branch
- **System Support:** All systems

#### 30. update-token ⭐ NEW

- **Description:** Update various properties of a token (visibility, disposition, size, rotation, elevation, name)
- **Input:**
  - `tokenId` (string) - Token ID
  - `updates` (object) - Properties to update:
    - `x`, `y` (number) - Position
    - `width`, `height` (number) - Size
    - `rotation` (number) - Rotation degrees
    - `hidden` (boolean) - Visibility
    - `disposition` (number) - Friendly/neutral/hostile
    - `name` (string) - Display name
    - `elevation` (number) - Elevation
    - `lockRotation` (boolean) - Lock rotation
- **Output:** Updated token data
- **File:** `packages/mcp-server/src/tools/token-manipulation.ts`
- **Status:** ⚠️ In broken branch
- **System Support:** All systems

#### 31. delete-tokens ⭐ NEW

- **Description:** Delete one or more tokens from the current scene
- **Input:**
  - `tokenIds` (array of strings) - Token IDs to delete
- **Output:** Deletion confirmation
- **File:** `packages/mcp-server/src/tools/token-manipulation.ts`
- **Status:** ⚠️ In broken branch
- **System Support:** All systems

#### 32. get-token-details ⭐ NEW

- **Description:** Get detailed information about a specific token including all properties and linked actor data
- **Input:**
  - `tokenId` (string) - Token ID
- **Output:** Complete token data including:
  - Position, size, rotation, elevation
  - Visibility, disposition
  - Linked actor data
  - Status effects/conditions
  - Vision/light settings
- **File:** `packages/mcp-server/src/tools/token-manipulation.ts`
- **Status:** ⚠️ In broken branch
- **System Support:** All systems

#### 33. toggle-token-condition ⭐ NEW

- **Description:** Toggle a status effect/condition on or off for a token (Prone, Poisoned, Blinded, etc.)
- **Input:**
  - `tokenId` (string) - Token ID
  - `conditionId` (string) - Condition/effect ID
  - `active` (boolean, optional) - true=apply, false=remove, undefined=toggle
- **Output:** Updated token with conditions
- **File:** `packages/mcp-server/src/tools/token-manipulation.ts`
- **Status:** ⚠️ In broken branch
- **System Support:** D&D5e, PF2e, DSA5 (system-specific conditions)

#### 34. get-available-conditions ⭐ NEW

- **Description:** Get a list of all available status effects/conditions for the current game system
- **Input:** None
- **Output:** Array of condition info (id, label, icon)
- **File:** `packages/mcp-server/src/tools/token-manipulation.ts`
- **Status:** ⚠️ In broken branch
- **System Support:** D&D5e, PF2e, DSA5

---

## Tool Comparison Matrix

| Tool Name                            | Baseline | Master | Broken | Category      | Priority   |
| ------------------------------------ | -------- | ------ | ------ | ------------- | ---------- |
| get-character                        | ✅       | ✅     | ✅     | Character     | -          |
| list-characters                      | ✅       | ✅     | ✅     | Character     | -          |
| search-compendium                    | ✅       | ✅     | ✅     | Compendium    | -          |
| get-compendium-item                  | ✅       | ✅     | ✅     | Compendium    | -          |
| list-creatures-by-criteria           | ✅       | ✅     | ✅     | Compendium    | -          |
| list-compendium-packs                | ✅       | ✅     | ✅     | Compendium    | -          |
| get-current-scene                    | ✅       | ✅     | ✅     | Scene         | -          |
| get-world-info                       | ✅       | ✅     | ✅     | Scene         | -          |
| create-actor-from-compendium         | ✅       | ✅     | ✅     | Actor         | -          |
| get-compendium-entry-full            | ✅       | ✅     | ✅     | Actor         | -          |
| create-dsa5-character-from-archetype | ✅       | ❌     | ✅     | DSA5          | -          |
| list-dsa5-archetypes                 | ✅       | ❌     | ✅     | DSA5          | -          |
| create-quest-journal                 | ✅       | ✅     | ✅     | Journal       | -          |
| link-quest-to-npc                    | ✅       | ✅     | ✅     | Journal       | -          |
| update-quest-journal                 | ✅       | ✅     | ✅     | Journal       | -          |
| list-journals                        | ✅       | ✅     | ✅     | Journal       | -          |
| search-journals                      | ✅       | ✅     | ✅     | Journal       | -          |
| request-player-rolls                 | ✅       | ✅     | ✅     | Dice          | -          |
| create-campaign-dashboard            | ✅       | ✅     | ✅     | Campaign      | -          |
| assign-actor-ownership               | ✅       | ✅     | ✅     | Ownership     | -          |
| remove-actor-ownership               | ✅       | ✅     | ✅     | Ownership     | -          |
| list-actor-ownership                 | ✅       | ✅     | ✅     | Ownership     | -          |
| generate-map                         | ✅       | ✅     | ✅     | Map           | -          |
| check-map-status                     | ✅       | ✅     | ✅     | Map           | -          |
| cancel-map-job                       | ✅       | ✅     | ✅     | Map           | -          |
| list-scenes                          | ✅       | ✅     | ✅     | Map           | -          |
| switch-scene                         | ✅       | ✅     | ✅     | Map           | -          |
| **get-character-entity**             | ❌       | ❌     | **✅** | **Character** | **MEDIUM** |
| **move-token**                       | ❌       | ❌     | **✅** | **Token**     | **HIGH**   |
| **update-token**                     | ❌       | ❌     | **✅** | **Token**     | **HIGH**   |
| **delete-tokens**                    | ❌       | ❌     | **✅** | **Token**     | **HIGH**   |
| **get-token-details**                | ❌       | ❌     | **✅** | **Token**     | **HIGH**   |
| **toggle-token-condition**           | ❌       | ❌     | **✅** | **Token**     | **HIGH**   |
| **get-available-conditions**         | ❌       | ❌     | **✅** | **Token**     | **HIGH**   |

---

## Summary Statistics

### Tools by Category

| Category       | Baseline | Master | Broken | New in Broken |
| -------------- | -------- | ------ | ------ | ------------- |
| Character      | 2        | 2      | **3**  | +1            |
| Compendium     | 4        | 4      | 4      | 0             |
| Scene          | 2        | 2      | 2      | 0             |
| Actor Creation | 2        | 2      | 2      | 0             |
| DSA5 Character | 2        | 0      | 2      | 0             |
| Quest/Journal  | 5        | 5      | 5      | 0             |
| Dice Roll      | 1        | 1      | 1      | 0             |
| Campaign       | 1        | 1      | 1      | 0             |
| Ownership      | 3        | 3      | 3      | 0             |
| **Token**      | **0**    | **0**  | **6**  | **+6**        |
| Map Generation | 5        | 5      | 5      | 0             |
| **TOTAL**      | **26**   | **23** | **32** | **+7**        |

### Migration Candidates

**7 tools to migrate from broken → baseline:**

1. ✅ get-character-entity (Character category)
2. ✅ move-token (Token category)
3. ✅ update-token (Token category)
4. ✅ delete-tokens (Token category)
5. ✅ get-token-details (Token category)
6. ✅ toggle-token-condition (Token category)
7. ✅ get-available-conditions (Token category)

---

**See Also:**

- `MISSING_TOOLS.md` - Detailed analysis of the 7 missing tools
- `MIGRATION_PLAN.md` - Step-by-step implementation guide
- `IMPLEMENTATION_ORDER.md` - Recommended migration sequence
