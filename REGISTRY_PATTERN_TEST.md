# Registry Pattern & DSA5 Support - Test Plan

**Branch:** `claude/fix-dsa5-bug-S84Ey`
**Date:** 2024-12-20
**Tester:** Claude or User

---

## 🎯 Test Objectives

1. Verify SystemRegistry initialization
2. Test DSA5 adapter registration and detection
3. Verify creature type support (character, npc, creature)
4. Test DSA5-specific filtering
5. Confirm bugs are fixed

---

## 📋 Pre-Test Setup

### 1. Build the Project

```bash
cd /home/user/foundry-vtt-mcp-dsa
npm run build
```

**Expected Result:** ✅ Build completes without errors

### 2. Check TypeScript Compilation

```bash
npm run typecheck 2>&1 | grep -i "error" | head -20
```

**Expected Result:** ⚠️ May show dependency errors (like missing @types/node), but NO errors in our new files:

- `systems/dsa5/adapter.ts` - Should compile cleanly
- `systems/dnd5e/adapter.ts` - Should compile cleanly
- `systems/pf2e/adapter.ts` - Should compile cleanly
- `systems/system-registry.ts` - Should compile cleanly

---

## 🧪 Test Cases

### TEST 1: SystemRegistry Infrastructure

**Verify files exist:**

```bash
ls -la packages/mcp-server/src/systems/
```

**Expected Output:**

```
dnd5e/
dsa5/
pf2e/
index-builder-registry.ts
index.ts
system-registry.ts
types.ts
```

**Verify DSA5 adapter files:**

```bash
ls -la packages/mcp-server/src/systems/dsa5/
```

**Expected Output:**

```
README.md
adapter.ts
character-creator.ts
constants.ts
filters.test.ts
filters.ts
index-builder.ts
index.ts
```

✅ **PASS** if all files exist
❌ **FAIL** if any files are missing

---

### TEST 2: TypeScript Imports

**Verify imports compile:**

```bash
# Check if imports resolve
grep -r "from './systems" packages/mcp-server/src/backend.ts
```

**Expected Output:**

```typescript
const { getSystemRegistry } = await import('./systems/index.js');
const { DnD5eAdapter } = await import('./systems/dnd5e/adapter.js');
const { PF2eAdapter } = await import('./systems/pf2e/adapter.js');
const { DSA5Adapter } = await import('./systems/dsa5/adapter.js');
```

✅ **PASS** if imports are present
❌ **FAIL** if imports are missing

---

### TEST 3: Backend Registration

**Verify SystemRegistry initialization:**

```bash
grep -A 10 "systemRegistry.register" packages/mcp-server/src/backend.ts
```

**Expected Output:**

```typescript
systemRegistry.register(new DnD5eAdapter());
systemRegistry.register(new PF2eAdapter());
systemRegistry.register(new DSA5Adapter());
```

✅ **PASS** if all three adapters are registered
❌ **FAIL** if any adapter is missing

---

### TEST 4: CharacterTools Integration

**Verify systemRegistry parameter:**

```bash
grep -A 2 "new CharacterTools" packages/mcp-server/src/backend.ts
```

**Expected Output:**

```typescript
const characterTools = new CharacterTools({ foundryClient, logger, systemRegistry });
```

✅ **PASS** if systemRegistry is passed
❌ **FAIL** if systemRegistry is missing

---

### TEST 5: CompendiumTools Integration

**Verify systemRegistry parameter:**

```bash
grep -A 2 "new CompendiumTools" packages/mcp-server/src/backend.ts
```

**Expected Output:**

```typescript
const compendiumTools = new CompendiumTools({ foundryClient, logger, systemRegistry });
```

✅ **PASS** if systemRegistry is passed
❌ **FAIL** if systemRegistry is missing

---

### TEST 6: DSA5 Filter Schema

**Verify DSA5 species defined:**

```bash
grep "DSA5Species" packages/mcp-server/src/systems/dsa5/filters.ts | head -5
```

**Expected Output:**

```typescript
export const DSA5Species = [
  'mensch',      // Human
  'elf',         // Elf
  'halbelf',     // Half-Elf
  'zwerg',       // Dwarf
```

✅ **PASS** if species array exists
❌ **FAIL** if not found

---

### TEST 7: DSA5 Experience Levels

**Verify experience level constants:**

```bash
grep -A 10 "getExperienceLevel" packages/mcp-server/src/systems/dsa5/constants.ts | head -15
```

**Expected:** Function exists that maps AP (Abenteuerpunkte) to Experience Levels 1-7

✅ **PASS** if function exists
❌ **FAIL** if not found

---

### TEST 8: Creature Type Support (BUG #2 Fix)

**Verify data-access.ts supports all actor types:**

```bash
grep -A 5 "validActorTypes" packages/foundry-module/src/data-access.ts
```

**Expected Output:**

```typescript
const validActorTypes = ['character', 'npc', 'creature'];
if (!validActorTypes.includes(sourceDocument.type)) {
```

✅ **PASS** if all 3 types are supported
❌ **FAIL** if creature is missing

---

### TEST 9: Git History

**Verify commits:**

```bash
git log --oneline -5
```

**Expected Output:**

```
5b87f17 feat: Implement complete SystemRegistry Pattern with DSA5 adapter
2d1ee80 fix: Add full support for creature actor type in DSA5
...
```

✅ **PASS** if both commits exist
❌ **FAIL** if commits are missing

---

### TEST 10: File Count Verification

**Count new files:**

```bash
git diff --stat 2d1ee80^..5b87f17 | grep "files changed"
```

**Expected Output:**

```
21 files changed, 3935 insertions(+), 138 deletions(-)
```

✅ **PASS** if ~21 files changed
❌ **FAIL** if significantly different

---

## 🔍 Integration Tests (Conceptual)

These tests would require a running Foundry VTT instance with DSA5:

### TEST 11: SystemRegistry Runtime (Conceptual)

**Test Scenario:**

```typescript
// When backend starts
const registry = getSystemRegistry(logger);
registry.register(new DSA5Adapter());

// Should be able to get adapter
const adapter = registry.getAdapter('dsa5');
expect(adapter).toBeDefined();
expect(adapter.canHandle('dsa5')).toBe(true);
```

**Manual Test:** Start MCP server and check logs for:

```
System registry initialized
supportedSystems: ['dnd5e', 'pf2e', 'dsa5']
```

---

### TEST 12: DSA5 Filter Matching (Conceptual)

**Test Scenario:**

```typescript
const filters = {
  level: 3,
  species: 'zwerg',
};

const creature = {
  systemData: {
    level: 3,
    species: 'Zwerg',
  },
};

const matches = matchesDSA5Filters(creature, filters);
expect(matches).toBe(true);
```

---

### TEST 13: Creature Creation (BUG #2 Fix - Conceptual)

**Test Scenario in Foundry VTT:**

```typescript
// Should work for all 3 types:
createActorFromCompendium({
  packId: 'world.creatures',
  itemId: 'orkId123',
  names: ['Test-Ork'],
});
// Expected: ✅ Ork created successfully

createActorFromCompendium({
  packId: 'world.npcs',
  itemId: 'npcId123',
  names: ['Test-NPC'],
});
// Expected: ✅ NPC created successfully

createActorFromCompendium({
  packId: 'world.characters',
  itemId: 'charId123',
  names: ['Test-Character'],
});
// Expected: ✅ Character created successfully
```

---

## 📊 Test Summary Template

**Copy and fill this out:**

```
=== REGISTRY PATTERN TEST RESULTS ===

Date: ____________________
Tester: ____________________

INFRASTRUCTURE TESTS:
[ ] TEST 1: SystemRegistry files exist
[ ] TEST 2: TypeScript imports correct
[ ] TEST 3: Backend registration complete
[ ] TEST 4: CharacterTools integrated
[ ] TEST 5: CompendiumTools integrated

DSA5 SPECIFIC TESTS:
[ ] TEST 6: DSA5 filter schema present
[ ] TEST 7: Experience levels defined
[ ] TEST 8: Creature type support added

VERSION CONTROL:
[ ] TEST 9: Git commits present
[ ] TEST 10: File count correct

TOTAL PASSED: _____ / 10
TOTAL FAILED: _____ / 10

Status: [ ] READY FOR PR  [ ] NEEDS FIXES

Notes:
_________________________________________
_________________________________________
_________________________________________
```

---

## ✅ Success Criteria

**Minimum to PASS:**

- All TEST 1-10 must pass (100%)
- Build completes (some TypeScript warnings OK)
- Both commits present in git history
- All 3 adapters registered in backend.ts

**Ready for PR when:**

- ✅ All 10 tests pass
- ✅ Build completes
- ✅ No TypeScript errors in systems/ folder
- ✅ Git history clean

---

## 🐛 Known Issues / Expected Warnings

**TypeScript warnings** for missing dependencies (`@types/node`, `zod`) are OK - these are project-level issues, not our code.

**Import path warnings** - Ensure `.js` extensions are present in imports (already done).

---

## 📝 Notes for Tester

1. **Run tests sequentially** - Some tests depend on previous ones
2. **Document failures** - Note which test failed and why
3. **Check logs** - Look for errors during build
4. **Screenshot evidence** - If possible, screenshot test results

---

## 🚀 After All Tests Pass

Run this command to prepare for PR:

```bash
# Verify everything is committed
git status

# Verify branch is up to date
git log --oneline -5

# Ready to create PR!
echo "✅ All tests passed - Ready for PR"
```

---

## 🎯 Final Checklist

Before creating PR, verify:

- [ ] All 10 tests passed
- [ ] Build completes successfully
- [ ] Git branch pushed to remote
- [ ] Commit messages are clear
- [ ] No uncommitted changes
- [ ] README or docs updated (if needed)

**If all checked:** 🎉 **CREATE THE PR!**
