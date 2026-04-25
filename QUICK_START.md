# Quick Start - MCP Tool Migration Analysis

## TL;DR Summary

**Goal:** Migrate 7 new MCP tools from broken branch to working baseline branch.

### Tool Count

- **Baseline (Working):** 26 tools ✅
- **Master:** 23 tools (baseline minus DSA5 tools)
- **Broken:** 32 tools (baseline + 7 new tools) ⚠️

### Missing Tools (7 Total)

**HIGH PRIORITY - Token Manipulation (6 tools):**

1. `move-token` - Move tokens with animation
2. `update-token` - Update token properties
3. `delete-tokens` - Bulk delete tokens
4. `get-token-details` - Inspect token details
5. `toggle-token-condition` - Apply status effects
6. `get-available-conditions` - List system conditions

**MEDIUM PRIORITY - Character Enhancement (1 tool):** 7. `get-character-entity` - Detailed entity lookup

### Biggest Risks

1. **Unknown Bugs** - Broken branch has stability issues (reason unknown)
2. **Foundry Module Integration** - May need module updates for token tools
3. **System Compatibility** - Token tools may behave differently across D&D5e/PF2e/DSA5

### Estimated Time

- **Token Tools Migration:** 6-8 hours (new file + testing)
- **Character Entity Tool:** 2-3 hours (modify existing file)
- **Testing & QA:** 4-6 hours
- **Total:** 12-17 hours

### Recommended Implementation Order

1. **First:** `get-character-entity` (lowest risk, single file change)
2. **Second:** All 6 token tools together (new functionality, test as a group)

### Key Documentation Differences

| Aspect                  | Baseline     | Main    | Broken                     |
| ----------------------- | ------------ | ------- | -------------------------- |
| Total .md Files         | 12           | 5       | 7                          |
| Tool Count Stated       | 25           | 25      | 31+                        |
| DSA5 Documentation      | ✅ Extensive | ❌ None | ✅ Present                 |
| New Features Documented | DSA5 System  | None    | Token Tools, Character API |
| Versions                | v0.6.1       | v0.4.17 | v0.6.2                     |

### What's in Each Branch?

**Baseline (claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9):**

- ✅ Last stable/working version
- ✅ 26 tools including DSA5 character creation
- ✅ Full DSA5 system adapter
- ✅ Extensive documentation (12 .md files)

**Main (master):**

- Simple state, 23 tools (no DSA5)
- Generic documentation (5 .md files)
- v0.4.17 - older version

**Broken (claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB):**

- ⚠️ 32 tools (7 more than baseline)
- ⚠️ Has bugs/instability
- ✅ New token manipulation features
- ✅ Enhanced character API
- Documentation: 7 .md files

### Action Plan (5 Steps)

1. **Analyze** - Read broken branch implementation (DONE ✅)
2. **Extract** - Copy token-manipulation.ts from broken branch
3. **Integrate** - Add tools to baseline backend.ts
4. **Test** - Verify each tool works in Foundry VTT
5. **Document** - Update README.md with new tool count

### Success Criteria

- ✅ All 7 tools working in baseline branch
- ✅ No regression in existing 26 tools
- ✅ DSA5 functionality preserved
- ✅ Documentation updated
- ✅ All tests passing

---

**Next Step:** Read `MIGRATION_PLAN.md` for detailed implementation steps.
