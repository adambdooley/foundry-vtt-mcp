# Implementation Order - Prioritized Migration Sequence

## Executive Summary

This document provides a recommended implementation order for migrating the 7 missing tools from the broken branch to the baseline branch. The order is optimized for:

1. **Risk Management** - Low-risk tools first
2. **Dependency Resolution** - Foundation tools before dependent tools
3. **Value Delivery** - High-impact tools prioritized
4. **Testing Efficiency** - Logical groupings for testing

**Recommended Approach:** Implement in 3 waves with testing checkpoints between each wave.

---

## Prioritization Criteria

### Impact Score (1-10)

How much value does this tool provide to end users?

- 10 = Critical functionality, frequently used
- 5 = Useful but not essential
- 1 = Nice to have

### Complexity Score (1-10)

How difficult is the implementation?

- 10 = Complex, many dependencies, system-specific
- 5 = Moderate complexity
- 1 = Simple, straightforward

### Risk Score (1-10)

What is the risk of introducing bugs or breaking existing functionality?

- 10 = High risk, destructive operations, breaking changes
- 5 = Medium risk, some integration challenges
- 1 = Low risk, isolated changes

### Dependency Score (1-10)

How many other tools depend on this tool?

- 10 = Many tools depend on this
- 5 = Some dependencies
- 1 = Independent tool

### DSA5 Compatibility Score (1-10)

How well does this work with DSA5?

- 10 = Fully tested and compatible
- 5 = Should work but needs testing
- 1 = Unknown, significant testing needed

---

## Tool Scoring Matrix

| Tool                         | Impact | Complexity | Risk | Dependencies | DSA5 Compat | Priority Score | Wave  |
| ---------------------------- | ------ | ---------- | ---- | ------------ | ----------- | -------------- | ----- |
| **get-character-entity**     | 7      | 2          | 2    | 0            | 10          | **91**         | **1** |
| **get-available-conditions** | 6      | 1          | 1    | 1            | 9           | **88**         | **1** |
| **get-token-details**        | 8      | 3          | 2    | 3            | 10          | **86**         | **1** |
| **move-token**               | 9      | 2          | 3    | 0            | 10          | **84**         | **2** |
| **update-token**             | 8      | 4          | 5    | 2            | 10          | **71**         | **2** |
| **toggle-token-condition**   | 9      | 5          | 6    | 2            | 7           | **67**         | **3** |
| **delete-tokens**            | 6      | 3          | 8    | 0            | 10          | **65**         | **3** |

**Priority Score Formula:**

```
Score = (Impact × 2) + (10 - Complexity) + (10 - Risk) + (Dependencies × 1.5) + (DSA5 Compat × 1.2)
```

Higher score = implement earlier

---

## Wave 1: Foundation Tools (Low Risk, High Value)

### Estimated Time: 3-4 hours

### Goal: Establish basic character and token inspection capabilities

---

### 1. get-character-entity (HIGHEST PRIORITY)

**Priority Score:** 91/100

**Why First:**

- ✅ Lowest risk (read-only operation)
- ✅ Lowest complexity (single class modification)
- ✅ No external dependencies
- ✅ Full DSA5 compatibility
- ✅ Enhances existing character tool
- ✅ No Foundry module changes required

**Implementation Details:**

- **File:** `/packages/mcp-server/src/tools/character.ts`
- **Changes:** Add 1 method, 1 tool definition
- **Lines of Code:** ~100
- **Testing:** Easy to test with existing characters
- **Rollback:** Simple (just remove the method)

**Why This Is Foundation:**

- Establishes pattern for lazy-loading
- Tests character data retrieval independently
- Validates FoundryClient integration works

**Success Criteria:**

- [ ] Can retrieve item details by ID
- [ ] Can retrieve item details by name (case-insensitive)
- [ ] Can retrieve action details
- [ ] Can retrieve effect details
- [ ] Error handling works (entity not found)
- [ ] Works with D&D5e, PF2e, and DSA5

**Time Estimate:** 1 hour (including testing)

---

### 2. get-available-conditions (SECOND)

**Priority Score:** 88/100

**Why Second:**

- ✅ Simple read-only operation
- ✅ Required by toggle-token-condition (dependency)
- ✅ Tests Foundry module integration first
- ✅ Low risk (no state changes)
- ✅ System-agnostic (returns CONFIG.statusEffects)

**Implementation Details:**

- **File (MCP):** `/packages/mcp-server/src/tools/token-manipulation.ts`
- **File (Foundry):** `/packages/foundry-module/scripts/mcp-bridge.js`
- **Lines of Code:** ~30 (MCP) + ~15 (Foundry)
- **Dependencies:** None
- **Testing:** Easy - just check returned list

**Why Before Other Token Tools:**

- Tests token-manipulation.ts class integration
- Establishes Foundry module token handler pattern
- Provides information needed for toggle-token-condition
- No risk of breaking anything

**Success Criteria:**

- [ ] Returns list of conditions for D&D5e
- [ ] Returns list of conditions for PF2e
- [ ] Returns list of conditions for DSA5
- [ ] Includes id, label, and icon for each condition
- [ ] Returns correct gameSystem value

**Time Estimate:** 1 hour (including Foundry module setup)

---

### 3. get-token-details (THIRD)

**Priority Score:** 86/100

**Why Third:**

- ✅ Read-only operation (low risk)
- ✅ Required by other token tools (dependency)
- ✅ Tests token data formatting
- ✅ Validates token retrieval from canvas
- ✅ Full DSA5 compatibility

**Implementation Details:**

- **File (MCP):** `/packages/mcp-server/src/tools/token-manipulation.ts`
- **File (Foundry):** `/packages/foundry-module/scripts/mcp-bridge.js`
- **Lines of Code:** ~80 (MCP) + ~30 (Foundry)
- **Dependencies:** None
- **Testing:** Requires tokens on scene

**Why Before Manipulation Tools:**

- Tests token access pattern
- Validates actor data retrieval
- Establishes token formatting helpers
- Confirms disposition/elevation/rotation access
- Provides debugging tool for other token operations

**Success Criteria:**

- [ ] Returns complete token data (position, size, appearance)
- [ ] Returns linked actor data
- [ ] Handles tokens without actors gracefully
- [ ] Formats disposition correctly (hostile/neutral/friendly)
- [ ] Works with all token types (linked/unlinked)

**Time Estimate:** 1.5 hours (including test scene setup)

---

## Wave 2: Token Manipulation Tools (Medium Risk, High Impact)

### Estimated Time: 3-4 hours

### Goal: Enable basic token movement and property updates

**Prerequisites:**

- ✅ Wave 1 complete and tested
- ✅ All Wave 1 tests passing
- ✅ Foundry module integration confirmed working

---

### 4. move-token (FOURTH)

**Priority Score:** 84/100

**Why Fourth:**

- ✅ Simple operation (only changes x, y)
- ✅ High user value (frequently needed)
- ✅ No destructive side effects
- ✅ Easy to verify (visual confirmation)
- ✅ Full DSA5 compatibility

**Implementation Details:**

- **File (MCP):** `/packages/mcp-server/src/tools/token-manipulation.ts`
- **File (Foundry):** `/packages/foundry-module/scripts/mcp-bridge.js`
- **Lines of Code:** ~40 (MCP) + ~15 (Foundry)
- **Dependencies:** None (independent operation)
- **Testing:** Visual - move token and observe

**Why Before update-token:**

- Simpler than update-token (fewer parameters)
- Tests basic token.document.update() pattern
- Tests animation parameter
- Establishes error handling pattern

**Success Criteria:**

- [ ] Moves token to specified coordinates
- [ ] Animation works when enabled
- [ ] No animation when disabled
- [ ] Error handling for invalid token ID
- [ ] No side effects on other token properties

**Time Estimate:** 1 hour

---

### 5. update-token (FIFTH)

**Priority Score:** 71/100

**Why Fifth:**

- ✅ High user value (many use cases)
- ⚠️ More complex (many update options)
- ⚠️ Medium risk (can hide tokens, change properties)
- ✅ Full DSA5 compatibility

**Implementation Details:**

- **File (MCP):** `/packages/mcp-server/src/tools/token-manipulation.ts`
- **File (Foundry):** `/packages/foundry-module/scripts/mcp-bridge.js`
- **Lines of Code:** ~50 (MCP) + ~15 (Foundry)
- **Dependencies:** Builds on move-token pattern
- **Testing:** Multiple test cases for each property type

**Why After move-token:**

- Uses same token.document.update() pattern
- More complex validation (disposition, rotation bounds)
- More parameters to test
- Potentially more ways to introduce bugs

**Success Criteria:**

- [ ] Updates position (x, y)
- [ ] Updates size (width, height)
- [ ] Updates rotation (0-360 validation)
- [ ] Updates visibility (hidden flag)
- [ ] Updates disposition (-1, 0, 1 validation)
- [ ] Updates name
- [ ] Updates elevation
- [ ] Updates lockRotation
- [ ] Validates all inputs correctly
- [ ] Error handling for invalid values

**Time Estimate:** 2 hours (complex validation testing)

---

## Wave 3: Advanced & Destructive Tools (Higher Risk)

### Estimated Time: 4-5 hours

### Goal: Complete the token manipulation suite with advanced features

**Prerequisites:**

- ✅ Wave 1 complete and tested
- ✅ Wave 2 complete and tested
- ✅ All tests passing across D&D5e, PF2e, DSA5
- ✅ Confidence in Foundry module integration

---

### 6. toggle-token-condition (SIXTH)

**Priority Score:** 67/100

**Why Sixth:**

- ✅ High user value (combat scenarios)
- ⚠️ System-specific complexity
- ⚠️ DSA5 testing required (unknown condition system)
- ⚠️ Medium-high risk (modifies actor state)

**Implementation Details:**

- **File (MCP):** `/packages/mcp-server/src/tools/token-manipulation.ts`
- **File (Foundry):** `/packages/foundry-module/scripts/mcp-bridge.js`
- **Lines of Code:** ~40 (MCP) + ~30 (Foundry)
- **Dependencies:** get-available-conditions (for validation)
- **Testing:** Requires testing with each game system

**Why Late in Sequence:**

- Most complex token operation
- System-specific behavior (D&D5e vs PF2e vs DSA5 conditions differ)
- Requires understanding of Foundry's effect system
- DSA5 condition system may differ significantly
- Depends on get-available-conditions for context

**Special Considerations:**

- ⚠️ **DSA5 Testing Critical** - DSA5 may use different status effect implementation
- ⚠️ **Version Compatibility** - Effect system changed in Foundry v10-v13
- ⚠️ **Toggle Logic** - Must correctly detect current state

**Success Criteria:**

- [ ] Applies condition when active=true
- [ ] Removes condition when active=false
- [ ] Toggles condition when active=undefined
- [ ] Works with D&D5e conditions (Blinded, Prone, etc.)
- [ ] Works with PF2e conditions (broader set)
- [ ] Works with DSA5 conditions (CRITICAL TEST)
- [ ] Error handling for invalid condition IDs
- [ ] Error handling for tokens without actors

**Time Estimate:** 2.5 hours (extensive system-specific testing)

---

### 7. delete-tokens (SEVENTH - LAST)

**Priority Score:** 65/100

**Why Last:**

- ⚠️ **DESTRUCTIVE OPERATION** (highest risk)
- ⚠️ No undo mechanism
- ✅ Lower user value (less frequently needed)
- ✅ Simple implementation
- ✅ Full DSA5 compatibility

**Implementation Details:**

- **File (MCP):** `/packages/mcp-server/src/tools/token-manipulation.ts`
- **File (Foundry):** `/packages/foundry-module/scripts/mcp-bridge.js`
- **Lines of Code:** ~45 (MCP) + ~25 (Foundry)
- **Dependencies:** None (independent)
- **Testing:** CAREFUL - use test tokens only

**Why Absolutely Last:**

- **DESTRUCTIVE** - can permanently remove tokens
- Relies on Foundry's history for undo (not guaranteed)
- Easy to accidentally delete wrong tokens
- Should have all other tools working for debugging
- Lower priority for MVP functionality

**Special Considerations:**

- ⚠️ **Testing with Disposable Tokens Only**
- ⚠️ **Consider Adding Confirmation**
- ⚠️ **Bulk Operations Risk** - deleting wrong array of IDs
- ⚠️ **Error Handling** - partial failures in bulk deletion

**Success Criteria:**

- [ ] Deletes single token correctly
- [ ] Deletes multiple tokens (bulk operation)
- [ ] Returns accurate deletedCount
- [ ] Returns array of successfully deleted token IDs
- [ ] Returns errors array for failed deletions
- [ ] Handles non-existent token IDs gracefully
- [ ] Handles partial failures (some succeed, some fail)

**Time Estimate:** 1.5 hours (careful testing with backups)

---

## Implementation Waves Summary

### Wave 1: Foundation (Read-Only Tools)

**Time:** 3-4 hours | **Risk:** LOW | **Value:** HIGH

1. **get-character-entity** - Character data enhancement
2. **get-available-conditions** - Condition discovery
3. **get-token-details** - Token inspection

**Checkpoint After Wave 1:**

- [ ] All Wave 1 tools implemented
- [ ] All Wave 1 tests passing
- [ ] Build successful
- [ ] MCP server listing 29 tools (26 + 3)
- [ ] Tested with D&D5e
- [ ] Tested with PF2e
- [ ] Tested with DSA5

**Deliverable:** Inspection and discovery capabilities for characters and tokens

---

### Wave 2: Manipulation (Non-Destructive)

**Time:** 3-4 hours | **Risk:** MEDIUM | **Value:** HIGH

4. **move-token** - Token positioning
5. **update-token** - Token property updates

**Checkpoint After Wave 2:**

- [ ] All Wave 2 tools implemented
- [ ] All Wave 2 tests passing
- [ ] Integration tests with Wave 1 tools
- [ ] MCP server listing 31 tools (26 + 5)
- [ ] Visual confirmation of token changes
- [ ] No unintended side effects

**Deliverable:** Token movement and property manipulation

---

### Wave 3: Advanced (Stateful & Destructive)

**Time:** 4-5 hours | **Risk:** HIGH | **Value:** MEDIUM-HIGH

6. **toggle-token-condition** - Status effect management
7. **delete-tokens** - Token deletion

**Checkpoint After Wave 3:**

- [ ] All Wave 3 tools implemented
- [ ] All Wave 3 tests passing
- [ ] Full integration test suite passing
- [ ] MCP server listing 32 tools (26 + 6 token + 1 character)
- [ ] Destructive operations tested safely
- [ ] DSA5 condition system verified

**Deliverable:** Complete token manipulation suite

---

## Alternative Implementation Strategies

### Strategy A: Vertical Slice (Recommended Above)

**Approach:** Implement by complexity and risk level
**Pros:** Lower risk, easier testing, clear checkpoints
**Cons:** Token features arrive in multiple waves

### Strategy B: Feature Complete

**Approach:** Implement all 6 token tools together, then get-character-entity
**Pros:** Token features complete at once
**Cons:** Higher risk, harder to isolate issues, longer feedback loop

**Recommendation:** Use Strategy A (vertical slice) as outlined above

### Strategy C: Critical Path First

**Approach:** Implement highest-impact tools first regardless of risk
**Order:** move-token → toggle-token-condition → get-token-details → update-token → delete-tokens → get-character-entity → get-available-conditions

**Pros:** Delivers value faster
**Cons:** Highest risk tools first, potential for more bugs

**Recommendation:** Only use if timeline is extremely tight

---

## Dependency Graph

```
Wave 1 (Foundation):
┌─────────────────────┐
│ get-character-entity│ (Independent)
└─────────────────────┘

┌─────────────────────────┐
│ get-available-conditions│ (Independent)
└────────────┬────────────┘
             │
             │ (Informs)
             │
             v
┌─────────────────────┐
│ get-token-details   │ (Independent)
└─────────────────────┘

Wave 2 (Manipulation):
┌─────────────────────┐
│ move-token          │ (Independent)
└─────────────────────┘

┌─────────────────────┐
│ update-token        │ (Uses move pattern)
└─────────────────────┘

Wave 3 (Advanced):
┌─────────────────────────┐
│ get-available-conditions│
└────────────┬────────────┘
             │
             │ (Requires)
             v
┌─────────────────────────┐
│ toggle-token-condition  │
└─────────────────────────┘

┌─────────────────────┐
│ delete-tokens       │ (Independent)
└─────────────────────┘
```

**Key Dependencies:**

- **toggle-token-condition** requires **get-available-conditions** for condition discovery
- **update-token** benefits from **move-token** pattern
- All token tools benefit from **get-token-details** for debugging
- **get-character-entity** is completely independent

---

## Testing Strategy by Wave

### Wave 1 Testing

**Focus:** Validation that read operations work correctly

**Test Suite:**

- Unit tests for each tool
- Integration tests with Foundry
- Cross-system tests (D&D5e, PF2e, DSA5)
- Error handling tests

**Test Time:** 1-1.5 hours

---

### Wave 2 Testing

**Focus:** Validation that token updates work without side effects

**Test Suite:**

- All Wave 1 tests still passing
- Unit tests for move and update
- Integration tests with visual confirmation
- Boundary testing (rotation 0-360, disposition -1 to 1)
- Regression tests on existing tokens

**Test Time:** 1.5-2 hours

---

### Wave 3 Testing

**Focus:** Validation of complex and destructive operations

**Test Suite:**

- All Wave 1-2 tests still passing
- Condition system tests (all 3 systems)
- DSA5-specific condition testing
- Safe deletion tests (with backups)
- Bulk operation tests
- Error recovery tests

**Test Time:** 2-2.5 hours

---

## Risk Mitigation by Wave

### Wave 1 Risks

**Risk:** Minimal - read-only operations
**Mitigation:**

- Automated tests catch errors early
- No state changes = safe to test extensively

### Wave 2 Risks

**Risk:** Medium - can change token state
**Mitigation:**

- Test in isolated test worlds
- Keep Foundry backups
- Visual confirmation of changes
- Comprehensive error handling

### Wave 3 Risks

**Risk:** High - destructive operations, system-specific behavior
**Mitigation:**

- Backup Foundry data before testing
- Use disposable test tokens
- Test DSA5 conditions extensively
- Implement confirmation for delete operations
- Detailed error logging
- Partial failure handling for bulk deletes

---

## Timeline with Buffer

| Wave          | Implementation | Testing     | Buffer    | Total               |
| ------------- | -------------- | ----------- | --------- | ------------------- |
| Wave 1        | 3-4 hours      | 1-1.5 hours | 0.5 hours | **5-6 hours**       |
| Wave 2        | 3-4 hours      | 1.5-2 hours | 0.5 hours | **5-6.5 hours**     |
| Wave 3        | 4-5 hours      | 2-2.5 hours | 1 hour    | **7-8.5 hours**     |
| Documentation | 2 hours        | -           | 0.5 hours | **2.5 hours**       |
| **TOTAL**     |                |             |           | **19.5-23.5 hours** |

**Realistic Timeline:** 3 working days (8 hours/day)

---

## Decision Points

### After Wave 1

**Decision:** Proceed to Wave 2?

**Criteria:**

- ✅ All Wave 1 tests passing
- ✅ No critical bugs discovered
- ✅ DSA5 compatibility confirmed
- ✅ Foundry module integration stable

**If NO:** Debug and fix Wave 1 before proceeding

---

### After Wave 2

**Decision:** Proceed to Wave 3?

**Criteria:**

- ✅ All Wave 1-2 tests passing
- ✅ Token manipulation works reliably
- ✅ No performance issues
- ✅ No unintended side effects observed

**If NO:** Review and fix Wave 2 issues

---

### After Wave 3

**Decision:** Release v0.6.3?

**Criteria:**

- ✅ All 32 tools working
- ✅ Comprehensive tests passing
- ✅ Documentation complete
- ✅ DSA5 condition system verified
- ✅ No critical bugs
- ✅ Performance acceptable

**If NO:** Address issues before release

---

## Conclusion

**Recommended Implementation Order:**

1. ✅ **get-character-entity** - Lowest risk, tests character integration
2. ✅ **get-available-conditions** - Low risk, establishes Foundry module pattern
3. ✅ **get-token-details** - Low risk, foundation for debugging
4. ✅ **move-token** - Simple manipulation, high value
5. ✅ **update-token** - Complex manipulation, high value
6. ⚠️ **toggle-token-condition** - System-specific, needs careful testing
7. ⚠️ **delete-tokens** - Destructive, lowest priority, test last

This order optimizes for **risk management** and **incremental value delivery** while maintaining **logical dependencies** and **efficient testing**.
