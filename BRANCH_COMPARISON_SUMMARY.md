# Branch Comparison Summary

## Three-Branch Analysis

This document provides a high-level overview of the three branches and their differences.

## Branch Overview

### Branch 1: Baseline (claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9)

**Status:** ✅ Last Known Working Version
**Version:** v0.6.1
**Tools:** 26
**Documentation Files:** 12

**Key Features:**

- Full DSA5 system adapter implementation
- 8 Eigenschaften support (MU/KL/IN/CH/FF/GE/KO/KK)
- Experience level system (1-7)
- DSA5 character creation from archetypes
- Enhanced creature indexing
- Character API with all items
- All baseline MCP tools working

**DSA5-Specific:**

- `create-dsa5-character-from-archetype`
- `list-dsa5-archetypes`
- Complete SystemAdapter pattern
- DSA5IndexBuilder for browser context

### Branch 2: Main (master)

**Status:** ✅ Stable (Simpler State)
**Version:** v0.4.17
**Tools:** 23
**Documentation Files:** 5

**Key Features:**

- Generic D&D5e/PF2e support only
- No DSA5 functionality
- Standard MCP tools
- Minimal documentation
- Older architecture

**Differences from Baseline:**

- ❌ No DSA5 tools (-2 tools)
- ❌ No SystemRegistry integration
- ❌ Older version

### Branch 3: Broken (claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB)

**Status:** ⚠️ Has New Features But Unstable
**Version:** v0.6.2
**Tools:** 32 (claims "31+")
**Documentation Files:** 7

**Key Features:**

- **NEW:** 6 Token Manipulation Tools
- **NEW:** Character entity deep-dive tool
- Maintains DSA5 support
- Enhanced character API (lazy loading)
- CompendiumTools SystemAdapter integration

**New Tools:**

- `move-token` - Token positioning with animation
- `update-token` - Update token properties
- `delete-tokens` - Bulk token deletion
- `get-token-details` - Token inspection
- `toggle-token-condition` - Status effect management
- `get-available-conditions` - Condition discovery
- `get-character-entity` - Deep entity details

**Issues:**

- ⚠️ Unknown stability problems
- ⚠️ Bugs/instability (reason not documented)

## Timeline & Feature Evolution

```
master (v0.4.17)
    ↓
    ├─→ Baseline (v0.6.1) - DSA5 Support Added
    │   └─→ [STABLE] ✅
    │
    └─→ Broken (v0.6.2) - Token Tools Added
        └─→ [UNSTABLE] ⚠️
```

## Documentation Comparison

### Documentation Files Matrix

| Document                                       | Baseline       | Master        | Broken         | Purpose                     |
| ---------------------------------------------- | -------------- | ------------- | -------------- | --------------------------- |
| README.md                                      | ✅ (25 tools)  | ✅ (25 tools) | ✅ (31+ tools) | Main project description    |
| CHANGELOG.md                                   | ✅ v0.6.1      | ✅ v0.4.17    | ✅ v0.6.2      | Version history             |
| INSTALLATION.md                                | ✅             | ✅            | ✅             | Installation guide          |
| Claude.md                                      | ✅ DSA5 v0.6.1 | ✅ Simple     | ❌             | Project notes               |
| ADDING_NEW_SYSTEMS.md                          | ✅             | ❌            | ✅             | System adapter guide        |
| DSA5_ROADMAP.md                                | ✅             | ❌            | ❌             | DSA5 implementation roadmap |
| DSA5_UPSTREAM_COMPARISON.md                    | ✅             | ❌            | ❌             | Comparison with upstream    |
| dsa5-mcp-bug-report-remaining-issues.md        | ✅             | ❌            | ❌             | Known DSA5 bugs             |
| dsa5-mcp-test-report.md                        | ✅             | ❌            | ❌             | DSA5 test results           |
| INSTALL_DSA5.md                                | ✅             | ❌            | ❌             | DSA5-specific install guide |
| packages/mcp-server/src/systems/dsa5/README.md | ✅             | ❌            | ✅             | DSA5 adapter API docs       |
| COMPENDIUM_ADAPTER_FEATURE.md                  | ❌             | ❌            | ✅             | v0.6.2 compendium feature   |
| installer/BUILD_DMG_INSTRUCTIONS.md            | ✅             | ✅            | ✅             | Mac installer build guide   |
| **TOTAL**                                      | **12**         | **5**         | **7**          |                             |

### Key Documentation Insights

**Baseline Branch Documentation Highlights:**

- Extensive DSA5 coverage (6 DSA5-specific docs)
- Complete Registry Pattern documentation
- Detailed implementation roadmap (Phase 10+ complete)
- Bug tracking and test reports
- Installation guides for both generic and DSA5 setups

**Master Branch Documentation Highlights:**

- Minimal, generic documentation
- No system-specific guides
- Older version documentation (v0.4.17)

**Broken Branch Documentation Highlights:**

- New feature documentation (COMPENDIUM_ADAPTER_FEATURE.md)
- CHANGELOG documents v0.6.1 and v0.6.2
- Maintains system adapter guide (ADDING_NEW_SYSTEMS.md)
- DSA5 adapter docs present but less comprehensive

## Tool Categories Comparison

| Category       | Baseline | Master | Broken | Notes                               |
| -------------- | -------- | ------ | ------ | ----------------------------------- |
| Character      | 2        | 2      | **3**  | +1 in broken (get-character-entity) |
| Compendium     | 4        | 4      | 4      | Same across all                     |
| Scene          | 2        | 2      | 2      | Same across all                     |
| Actor Creation | 2        | 2      | 2      | Same across all                     |
| DSA5 Character | **2**    | **0**  | **2**  | Only baseline & broken              |
| Quest/Journal  | 5        | 5      | 5      | Same across all                     |
| Dice Roll      | 1        | 1      | 1      | Same across all                     |
| Campaign       | 1        | 1      | 1      | Same across all                     |
| Ownership      | 3        | 3      | 3      | Same across all                     |
| **Token**      | **0**    | **0**  | **6**  | Entirely new category in broken     |
| Map Generation | 5        | 5      | 5      | Same across all                     |
| **TOTAL**      | **26**   | **23** | **32** |                                     |

## Feature Matrix

| Feature                        | Baseline | Master | Broken            |
| ------------------------------ | -------- | ------ | ----------------- |
| **DSA5 System Support**        | ✅       | ❌     | ✅                |
| **SystemAdapter Pattern**      | ✅       | ❌     | ✅                |
| **Token Manipulation**         | ❌       | ❌     | ✅                |
| **Character Entity Deep-Dive** | ❌       | ❌     | ✅                |
| **Enhanced Character API**     | ✅       | ❌     | ✅ (lazy loading) |
| **CompendiumTools Adapter**    | ❌       | ❌     | ✅                |
| **Map Generation**             | ✅       | ✅     | ✅                |
| **Quest Management**           | ✅       | ✅     | ✅                |
| **Ownership Management**       | ✅       | ✅     | ✅                |
| **Installer Support**          | ✅       | ✅     | ✅                |

## Recommendations

### For Migration

**Target:** Baseline branch (claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9)

**Why Baseline?**

1. ✅ Known stable/working state
2. ✅ Maintains DSA5 functionality
3. ✅ Good documentation foundation
4. ✅ SystemAdapter pattern already implemented

**Migration Approach:**

1. Extract 7 new tools from broken branch
2. Port to baseline branch
3. Test thoroughly with all 3 systems (D&D5e, PF2e, DSA5)
4. Maintain extensive documentation

### For Each Feature

**DSA5 Support:** ✅ KEEP (from baseline)

- Essential for community
- Well-documented
- Already stable

**Token Tools:** ✅ MIGRATE (from broken)

- Entirely new functionality
- High value for gameplay
- Test extensively due to unknown bugs in source

**Character Entity Tool:** ✅ MIGRATE (from broken)

- Low-risk enhancement
- Complements existing character tools
- Small code change

**CompendiumTools Adapter:** ⚠️ EVALUATE

- May be part of broken branch instability
- Check if baseline needs it
- Test impact on performance

## Version Recommendation

**Proposed Version After Migration:** v0.6.3

**Rationale:**

- v0.6.1 (baseline) - DSA5 support
- v0.6.2 (broken) - Token tools + character entity (migrate from)
- v0.6.3 (new) - Stable version with all features

**Release Notes Preview:**

```
v0.6.3 - Stable Release with Token Manipulation
- Migrated 6 token manipulation tools from v0.6.2
- Added get-character-entity for detailed entity inspection
- Maintained full DSA5 support from v0.6.1
- Bug fixes and stability improvements
- Total: 32 MCP tools
```

---

**See Also:**

- `QUICK_START.md` - Executive summary
- `TOOL_INVENTORY.md` - Complete tool listing
- `MIGRATION_PLAN.md` - Step-by-step migration guide
