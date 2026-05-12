# Risk Analysis - MCP Tool Migration

## Executive Summary

This document provides a comprehensive risk analysis for migrating 7 MCP tools from the broken branch (`claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB`) to the baseline branch (`claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9`).

**Overall Risk Level:** MEDIUM

**Risk Categories:**

1. Technical/Implementation Risks
2. Integration Risks
3. Compatibility Risks
4. Data Safety Risks
5. Project Timeline Risks

**Critical Risk Factors:**

- ⚠️ DSA5 condition system compatibility (unknown)
- ⚠️ Destructive operations (delete-tokens)
- ⚠️ Unknown root cause of broken branch instability

---

## Risk Matrix Overview

| Risk Category                    | Severity | Likelihood | Overall Risk | Mitigation Priority |
| -------------------------------- | -------- | ---------- | ------------ | ------------------- |
| DSA5 Condition Compatibility     | HIGH     | MEDIUM     | **HIGH**     | **CRITICAL**        |
| Destructive Operations           | HIGH     | LOW        | **MEDIUM**   | **HIGH**            |
| Type System Breaking Changes     | MEDIUM   | LOW        | **LOW**      | MEDIUM              |
| Foundry API Compatibility        | MEDIUM   | MEDIUM     | **MEDIUM**   | HIGH                |
| Performance Degradation          | LOW      | LOW        | **LOW**      | LOW                 |
| Documentation Drift              | LOW      | MEDIUM     | **LOW**      | MEDIUM              |
| Broken Branch Instability Source | HIGH     | UNKNOWN    | **HIGH**     | **CRITICAL**        |

**Overall Assessment:** Migration is feasible with proper testing and phased rollout.

---

## Category 1: Technical/Implementation Risks

### Risk 1.1: Broken Branch Instability Root Cause

**Severity:** HIGH
**Likelihood:** UNKNOWN
**Overall Risk:** HIGH

**Description:**
The broken branch is marked as unstable, but the specific cause of instability is not documented. It's unclear if the instability is related to:

- The 7 new tools themselves
- COMPENDIUM_ADAPTER_FEATURE.md changes
- Other undocumented changes
- Integration issues with Foundry

**Potential Impact:**

- Migrated tools may carry hidden bugs
- Instability may resurface in baseline branch
- Difficult to debug if root cause is unknown

**Indicators:**

- No specific bug reports in documentation
- CHANGELOG mentions "Bug fixes" without details
- Version v0.6.2 jumped from v0.6.1 but instability reason unclear

**Mitigation Strategies:**

1. **Code Archaeology** (HIGH PRIORITY)

   ```bash
   # Compare broken branch with its parent
   git log claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB --oneline -20

   # Find divergence point
   git merge-base claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9 claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB

   # Review all changes
   git diff <merge-base> claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB
   ```

2. **Selective Migration**
   - Only migrate the 7 specific tools
   - **DO NOT** migrate COMPENDIUM_ADAPTER_FEATURE.md changes (yet)
   - Review all other files for unexpected changes

3. **Extensive Testing**
   - Test each tool individually
   - Monitor for memory leaks
   - Check for race conditions
   - Load test with multiple concurrent operations

4. **Canary Deployment**
   - Deploy to test environment first
   - Monitor for 24-48 hours before production release
   - Have rollback plan ready

**Residual Risk:** MEDIUM (even with mitigation, unknown bugs may exist)

---

### Risk 1.2: Type System Breaking Changes

**Severity:** MEDIUM
**Likelihood:** LOW
**Overall Risk:** LOW

**Description:**
The broken branch may have different TypeScript dependencies or type definitions that could cause compilation errors when merged into baseline.

**Potential Impact:**

- Build failures
- Type errors in production code
- Integration issues with existing tools

**Mitigation Strategies:**

1. **Version Lock Check**

   ```bash
   # Compare package.json versions
   git show claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB:package.json > /tmp/broken-package.json
   diff package.json /tmp/broken-package.json
   ```

2. **Incremental Build Testing**
   - Build after each file addition
   - Run TypeScript compiler in strict mode
   - Fix type errors immediately

3. **Type Safety Verification**
   - Run `npm run type-check` after each change
   - Use `tsc --noEmit` for validation

**Residual Risk:** LOW (TypeScript will catch most issues at compile time)

---

### Risk 1.3: Missing Dependencies

**Severity:** MEDIUM
**Likelihood:** LOW
**Overall Risk:** LOW

**Description:**
The broken branch may rely on npm packages or Foundry API features not present in baseline.

**Potential Impact:**

- Runtime errors
- Missing functionality
- Installation failures

**Mitigation Strategies:**

1. **Dependency Audit**
   - Review all imports in token-manipulation.ts
   - Check for new npm packages in broken branch package.json
   - Verify Foundry API calls exist in v13

2. **Runtime Validation**
   - Add defensive checks for undefined APIs
   - Graceful degradation if features missing

3. **Integration Tests**
   - Test in clean environment
   - Fresh npm install
   - Verify all imports resolve

**Residual Risk:** LOW (code review shows no new dependencies)

---

## Category 2: Integration Risks

### Risk 2.1: Foundry Module Handler Integration

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Overall Risk:** MEDIUM

**Description:**
The 6 token manipulation tools require new handlers in the Foundry module. Integration issues could cause:

- Handler not found errors
- WebRTC communication failures
- Incomplete implementation

**Potential Impact:**

- Tools fail silently
- Error messages unclear
- Difficult to debug client-server mismatch

**Mitigation Strategies:**

1. **Handler Template Testing**

   ```javascript
   // Test handler exists before full implementation
   case 'foundry-mcp-bridge.moveToken': {
     console.log('moveToken handler called', args);
     return { success: true, test: true };
   }
   ```

2. **Systematic Handler Implementation**
   - Implement one handler at a time
   - Test immediately after each handler
   - Verify request/response format matches MCP tool expectations

3. **Error Handling Pattern**

   ```javascript
   try {
     // Handler implementation
   } catch (error) {
     console.error(`Handler failed: foundry-mcp-bridge.moveToken`, error);
     throw error; // Re-throw with context
   }
   ```

4. **WebRTC Communication Monitoring**
   - Log all WebRTC messages during testing
   - Verify message format consistency
   - Check for dropped messages

**Residual Risk:** LOW (with systematic testing)

---

### Risk 2.2: MCP Server Index.ts Registration

**Severity:** HIGH
**Likelihood:** LOW
**Overall Risk:** MEDIUM

**Description:**
Incorrect registration of TokenManipulationTools in index.ts could cause:

- Tools not appearing in MCP tool list
- Handler routing failures
- Tool call timeouts

**Potential Impact:**

- Complete failure of token tools
- Confusing user experience
- Silent failures

**Mitigation Strategies:**

1. **Registration Checklist**
   - [ ] Import TokenManipulationTools class
   - [ ] Instantiate with correct parameters (foundryClient, logger)
   - [ ] Add to getToolDefinitions() array
   - [ ] Register all 6 handlers in CallToolRequestSchema

2. **Verification Test**

   ```bash
   # Start MCP server and list tools
   node packages/mcp-server/dist/index.js
   # Expected: 32 tools listed
   ```

3. **Handler Mapping Validation**
   - Create test script that calls each tool
   - Verify handler routing works
   - Check error messages are clear

**Residual Risk:** LOW (compile-time checks + explicit testing)

---

### Risk 2.3: Character.ts Modification Conflicts

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Overall Risk:** MEDIUM

**Description:**
The broken branch character.ts has significant changes from baseline:

- Different `get-character` description (lazy-loading language)
- Modified `formatItems` (returns ALL items vs 20)
- New `formatActions` method
- Different response structure

**Potential Impact:**

- Breaking changes to existing users
- Token usage increase if returning ALL items
- Regression in character tool behavior

**Mitigation Strategies:**

1. **Incremental Changes**
   - Add get-character-entity WITHOUT modifying existing behavior
   - Test that get-character still works identically
   - Optionally add enhancements in separate commit

2. **Backwards Compatibility**
   - Keep 20-item limit in get-character (don't break existing behavior)
   - Only return full items if explicitly needed
   - Document any breaking changes

3. **A/B Testing**
   - Test both versions of formatItems
   - Measure token usage differences
   - User feedback on preferred behavior

**Recommendation:** Add get-character-entity WITHOUT changing get-character behavior initially. Enhance later if needed.

**Residual Risk:** LOW (if keeping backwards compatibility)

---

## Category 3: Compatibility Risks

### Risk 3.1: DSA5 Condition System Compatibility (CRITICAL)

**Severity:** HIGH
**Likelihood:** MEDIUM
**Overall Risk:** HIGH

**Description:**
The `toggle-token-condition` and `get-available-conditions` tools interact with Foundry's status effect system. DSA5 may implement conditions differently than D&D5e/PF2e:

- Different condition IDs
- Different CONFIG.statusEffects structure
- Different effect application method
- Custom DSA5-specific conditions

**Potential Impact:**

- Tools fail with DSA5 actors
- Incorrect conditions applied
- Runtime errors in DSA5 worlds
- Loss of DSA5 compatibility (regression from v0.6.1)

**Unknown Factors:**

- How DSA5 system stores conditions
- Whether DSA5 uses standard Foundry effects
- If DSA5 has custom condition management

**Mitigation Strategies:**

1. **DSA5 System Investigation** (CRITICAL - DO FIRST)

   ```javascript
   // In DSA5 Foundry world, run in console:
   console.log('DSA5 Status Effects:', CONFIG.statusEffects);
   console.log('DSA5 System:', game.system.id);

   // Test with DSA5 character:
   const actor = game.actors.getName('Test Held');
   console.log('Actor effects:', actor.effects);
   console.log('Actor statuses:', actor.statuses);

   // Test effect application:
   await actor.toggleStatusEffect('condition-id-here');
   ```

2. **DSA5-Specific Testing Plan**
   - Create DSA5 test world
   - Create test character (Held)
   - Place token on scene
   - Test get-available-conditions
   - Verify DSA5 conditions are returned
   - Test toggle-token-condition with DSA5 condition
   - Verify effect is applied correctly

3. **Conditional Implementation**

   ```typescript
   // In toggle-token-condition handler
   const gameSystem = await detectGameSystem(this.foundryClient, this.logger);

   if (gameSystem === 'dsa5') {
     // DSA5-specific condition handling if needed
     return this.handleDSA5Condition(tokenId, conditionId, active);
   }
   ```

4. **Fallback Behavior**
   - If DSA5 conditions don't work, disable for DSA5
   - Document limitation in README
   - Plan follow-up DSA5-specific implementation

5. **Community Consultation**
   - Check DSA5 Foundry system documentation
   - Ask DSA5 community about condition handling
   - Review DSA5 system source code

**Testing Checklist:**

- [ ] DSA5 world created and loaded
- [ ] CONFIG.statusEffects inspected for DSA5
- [ ] get-available-conditions tested with DSA5
- [ ] toggle-token-condition tested with common DSA5 conditions
- [ ] Verified no errors in DSA5 console
- [ ] Documented DSA5-specific behavior

**Residual Risk:** MEDIUM (DSA5 testing can reduce but not eliminate uncertainty)

---

### Risk 3.2: Foundry VTT Version Compatibility

**Severity:** MEDIUM
**Likelihood:** LOW
**Overall Risk:** LOW

**Description:**
Token manipulation relies on Foundry v13 APIs. Changes in Foundry API between versions could cause:

- canvas.tokens API differences
- token.document.update() signature changes
- Effect system changes

**Potential Impact:**

- Tools fail on different Foundry versions
- Unexpected behavior on Foundry v12 or v14

**Mitigation Strategies:**

1. **Version Check in Module**

   ```javascript
   if (!game.version.startsWith('13')) {
     console.warn('Token manipulation tools designed for Foundry v13');
   }
   ```

2. **API Compatibility Checks**
   - Test on Foundry v13.291 (latest stable)
   - Document minimum version: v13.0
   - Review Foundry v13 API changelog for breaking changes

3. **Defensive Coding**
   ```javascript
   if (typeof canvas.tokens.get !== 'function') {
     throw new Error('Token API not available');
   }
   ```

**Residual Risk:** LOW (project already targets v13)

---

### Risk 3.3: Cross-System Behavior Differences

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Overall Risk:** MEDIUM

**Description:**
D&D5e, PF2e, and DSA5 may handle tokens differently:

- Actor data structure
- Default token settings
- Vision/light integration
- Combat tracker integration

**Potential Impact:**

- Tool works on D&D5e but fails on PF2e
- Different behavior across systems
- User confusion

**Mitigation Strategies:**

1. **Cross-System Test Matrix**
   | Tool | D&D5e | PF2e | DSA5 |
   |------|-------|------|------|
   | move-token | ✅ | ✅ | ✅ |
   | update-token | ✅ | ✅ | ✅ |
   | delete-tokens | ✅ | ✅ | ✅ |
   | get-token-details | ✅ | ✅ | ✅ |
   | toggle-token-condition | ✅ | ✅ | ⚠️ |
   | get-available-conditions | ✅ | ✅ | ⚠️ |
   | get-character-entity | ✅ | ✅ | ✅ |

2. **System-Agnostic Design**
   - Use Foundry core APIs (not system-specific)
   - Avoid hardcoded system assumptions
   - Test with all 3 systems

3. **System-Specific Handlers** (if needed)

   ```typescript
   const gameSystem = await detectGameSystem(...);

   if (gameSystem === 'dsa5') {
     return this.handleDSA5Version(args);
   }
   // Default implementation
   ```

**Residual Risk:** LOW for most tools, MEDIUM for condition tools

---

## Category 4: Data Safety Risks

### Risk 4.1: Destructive Token Deletion

**Severity:** HIGH
**Likelihood:** LOW
**Overall Risk:** MEDIUM

**Description:**
`delete-tokens` permanently removes tokens from the scene. User errors or bugs could cause:

- Accidental deletion of important tokens
- Loss of unlinked token data (not recoverable)
- Bulk deletion of wrong tokens

**Potential Impact:**

- Permanent data loss
- User frustration
- Need to recreate tokens manually

**Mitigation Strategies:**

1. **Foundry Undo Mechanism**
   - Rely on Foundry's built-in history
   - Document that undo is available (Ctrl+Z)
   - Note: History may not persist across sessions

2. **Confirmation in Tool Description**

   ```typescript
   description: "Delete one or more tokens from the current scene. **WARNING:** This is a destructive operation. Deleted tokens may be recoverable via Foundry's undo (Ctrl+Z) but this is not guaranteed. Use with caution.";
   ```

3. **Error Handling for Partial Failures**

   ```typescript
   // Don't fail entire operation if one token fails
   const errors = [];
   for (const tokenId of tokenIds) {
     try {
       await token.delete();
     } catch (err) {
       errors.push({ tokenId, error: err.message });
     }
   }
   return { deletedCount, errors };
   ```

4. **Testing with Disposable Tokens**
   - Create test tokens specifically for deletion testing
   - Never test with real campaign tokens
   - Backup Foundry data before deletion tests

5. **Future Enhancement: Soft Delete**
   - Consider adding a "confirm" parameter
   - Require explicit confirmation for bulk deletes (>5 tokens)

**Residual Risk:** LOW (with proper documentation and user warnings)

---

### Risk 4.2: Token State Corruption

**Severity:** MEDIUM
**Likelihood:** LOW
**Overall Risk:** LOW

**Description:**
`update-token` could set invalid property combinations:

- Size 0 or negative
- Invalid disposition values
- Rotation out of bounds

**Potential Impact:**

- Token becomes invisible or unusable
- Scene corruption
- Foundry errors

**Mitigation Strategies:**

1. **Input Validation (Zod Schemas)**

   ```typescript
   updates: z.object({
     width: z.number().positive().optional(),
     height: z.number().positive().optional(),
     rotation: z.number().min(0).max(360).optional(),
     disposition: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
   });
   ```

2. **Foundry's Built-in Validation**
   - Foundry validates token.document.update()
   - Invalid values will be rejected by Foundry
   - Errors propagated back to user

3. **Boundary Testing**
   - Test edge cases (0, 360, negative values)
   - Verify Foundry's error handling
   - Ensure clear error messages

**Residual Risk:** VERY LOW (double validation: Zod + Foundry)

---

### Risk 4.3: Race Conditions in Concurrent Operations

**Severity:** MEDIUM
**Likelihood:** LOW
**Overall Risk:** LOW

**Description:**
Multiple concurrent token operations could cause:

- Conflicting updates
- Unexpected state
- Lost updates

**Potential Impact:**

- Token in inconsistent state
- Operation failures
- User confusion

**Mitigation Strategies:**

1. **Foundry's Locking Mechanism**
   - Foundry handles concurrent updates internally
   - token.document.update() is atomic

2. **Error Handling**
   - Catch and report conflicts
   - Retry logic if needed

3. **Testing**
   - Test concurrent operations
   - Verify Foundry handles conflicts

**Residual Risk:** VERY LOW (Foundry handles this)

---

## Category 5: Project Timeline Risks

### Risk 5.1: Scope Creep

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Overall Risk:** MEDIUM

**Description:**
During migration, discovering additional features or improvements that expand scope:

- Temptation to refactor existing code
- Adding enhancements beyond migration
- Perfectionism delaying release

**Potential Impact:**

- Timeline overrun
- Increased complexity
- More opportunities for bugs

**Mitigation Strategies:**

1. **Strict Scope Definition**
   - Migrate 7 tools ONLY
   - No refactoring of existing code
   - No new features beyond what's in broken branch

2. **Future Enhancement Backlog**
   - Document improvement ideas
   - Create issues for future work
   - Don't implement during migration

3. **MVP Mindset**
   - Goal: Working v0.6.3 with 32 tools
   - Enhancements can be v0.6.4+

**Residual Risk:** LOW (with discipline)

---

### Risk 5.2: Testing Time Underestimation

**Severity:** MEDIUM
**Likelihood:** MEDIUM
**Overall Risk:** MEDIUM

**Description:**
DSA5 testing and condition system investigation could take longer than expected.

**Potential Impact:**

- Timeline delays
- Rushed testing
- Bugs in production

**Mitigation Strategies:**

1. **Buffer Time in Schedule**
   - Original estimate: 2-3 days
   - Revised with buffer: 3-4 days
   - Allocate full day for DSA5 testing

2. **Parallel Testing**
   - Test D&D5e and PF2e simultaneously
   - DSA5 testing can be done separately

3. **Test Automation**
   - Write automated tests where possible
   - Reduce manual testing time

**Residual Risk:** LOW (with buffer time)

---

## Category 6: Unknown Risks

### Risk 6.1: Undiscovered Broken Branch Issues

**Severity:** UNKNOWN
**Likelihood:** UNKNOWN
**Overall Risk:** HIGH (precautionary)

**Description:**
There may be bugs or issues in the broken branch that are not documented.

**Mitigation Strategies:**

1. **Thorough Code Review**
   - Review all changes in broken branch
   - Look for commented-out code
   - Check for TODO/FIXME comments
   - Review git history for reverted changes

2. **Canary Testing**
   - Deploy to test environment first
   - Monitor for unexpected behavior
   - Collect user feedback before wide release

3. **Incremental Rollout**
   - Release to small group of testers
   - Monitor for issues
   - Full release only after confidence

4. **Quick Rollback Plan**
   - Keep v0.6.1 available
   - Document rollback procedure
   - Have rollback script ready

**Residual Risk:** MEDIUM (unknowns always exist)

---

## Critical Mitigation Priorities

### Priority 1: CRITICAL - Investigate Broken Branch Instability

**Why:** Root cause unknown, highest uncertainty
**Action:**

1. Review broken branch git history
2. Compare all files (not just tools)
3. Identify what made it "broken"
4. Document findings before migration

**Timeline:** 2-3 hours (before migration starts)

---

### Priority 2: CRITICAL - DSA5 Condition System Testing

**Why:** Highest compatibility risk, could break DSA5 support
**Action:**

1. Set up DSA5 test world
2. Investigate CONFIG.statusEffects
3. Test condition application manually
4. Document DSA5-specific behavior
5. Decide if conditions work with DSA5

**Timeline:** 3-4 hours (during Wave 3 implementation)

---

### Priority 3: HIGH - Foundry Module Handler Validation

**Why:** Integration point, many things can go wrong
**Action:**

1. Implement one handler at a time
2. Test immediately after each
3. Verify WebRTC communication
4. Check error handling

**Timeline:** Ongoing during implementation (30 min per handler)

---

### Priority 4: HIGH - Backwards Compatibility Verification

**Why:** Don't break existing users
**Action:**

1. Test all 26 existing tools after migration
2. Verify character.ts changes don't break get-character
3. Check performance hasn't degraded

**Timeline:** 2-3 hours (after Wave 1 complete)

---

## Risk Acceptance Criteria

The migration can proceed if:

✅ **Must Have:**

- [ ] Broken branch instability root cause identified or isolated to COMPENDIUM_ADAPTER_FEATURE
- [ ] DSA5 condition system investigated and documented
- [ ] All 6 token tools tested with D&D5e and PF2e successfully
- [ ] Comprehensive error handling in place
- [ ] Rollback plan documented and tested

⚠️ **Should Have:**

- [ ] DSA5 condition tools working (or explicitly disabled with documentation)
- [ ] Automated test coverage >70%
- [ ] Performance benchmarks showing no regression

🔄 **Nice to Have:**

- [ ] 100% DSA5 compatibility
- [ ] Enhanced error messages
- [ ] Performance improvements

---

## Rollback Triggers

Immediately rollback if:

🚨 **Critical Issues:**

- Any existing tools break
- Data loss occurs
- DSA5 functionality completely broken
- Performance degradation >50%
- Foundry crashes or hangs
- Security vulnerability discovered

⚠️ **Major Issues (consider rollback):**

- > 3 critical bugs discovered in testing
- DSA5 partially broken with no fix path
- Timeline overrun >2x estimate
- User reports of serious issues

---

## Residual Risk Summary

After all mitigations:

| Risk Category             | Pre-Mitigation | Post-Mitigation | Acceptable?                      |
| ------------------------- | -------------- | --------------- | -------------------------------- |
| DSA5 Compatibility        | HIGH           | MEDIUM          | ✅ Yes (with testing)            |
| Broken Branch Instability | HIGH           | MEDIUM          | ✅ Yes (with investigation)      |
| Destructive Operations    | MEDIUM         | LOW             | ✅ Yes (with warnings)           |
| Integration Issues        | MEDIUM         | LOW             | ✅ Yes (with systematic testing) |
| Type/Build Issues         | LOW            | VERY LOW        | ✅ Yes                           |
| Timeline Overrun          | MEDIUM         | LOW             | ✅ Yes (with buffer)             |

**Overall Residual Risk:** MEDIUM (acceptable for migration)

---

## Monitoring & Success Metrics

### Post-Migration Monitoring

**Week 1 After Release:**

- Monitor GitHub issues for bug reports
- Check Discord/community for feedback
- Track error logs in MCP server
- Monitor Foundry console errors

**Success Metrics:**

- ✅ Zero critical bugs reported
- ✅ <3 minor bugs reported
- ✅ DSA5 users confirm compatibility
- ✅ No performance complaints
- ✅ Positive user feedback on token tools

**Failure Indicators:**

- 🚨 >3 critical bug reports in first week
- 🚨 DSA5 users reporting breakage
- 🚨 Rollback requests from users
- 🚨 >10% increase in error rate

---

## Conclusion

**Overall Assessment:** Migration is **FEASIBLE** with **MEDIUM RISK**

**Key Success Factors:**

1. ✅ Thorough investigation of broken branch instability
2. ✅ Comprehensive DSA5 testing before release
3. ✅ Systematic phased implementation (Waves 1-3)
4. ✅ Robust error handling and validation
5. ✅ Clear rollback plan

**Recommendation:** **PROCEED** with migration following the phased approach outlined in IMPLEMENTATION_ORDER.md, with special emphasis on:

- DSA5 condition system investigation (Priority 1)
- Broken branch instability root cause analysis (Priority 2)
- Comprehensive testing across all 3 game systems

**Confidence Level:** 75% (Would be 90% after DSA5 condition system is verified)

---

## Appendix: Risk Review Checklist

Use this checklist before starting migration:

**Pre-Migration:**

- [ ] Read all migration documentation (MISSING_TOOLS.md, MIGRATION_PLAN.md, IMPLEMENTATION_ORDER.md)
- [ ] Investigate broken branch git history
- [ ] Set up DSA5 test world
- [ ] Create rollback plan
- [ ] Backup Foundry data directory
- [ ] Document current baseline state

**During Migration:**

- [ ] Follow implementation order (Waves 1-3)
- [ ] Test after each wave
- [ ] Monitor for errors continuously
- [ ] Document any deviations from plan
- [ ] Keep notes on issues encountered

**Post-Migration:**

- [ ] All 32 tools tested
- [ ] Cross-system compatibility verified
- [ ] Documentation updated
- [ ] Release notes prepared
- [ ] Monitoring plan in place
- [ ] Community notified

**If Issues Arise:**

- [ ] Assess severity (critical/major/minor)
- [ ] Check rollback triggers
- [ ] Document issue thoroughly
- [ ] Attempt fix if minor
- [ ] Rollback if critical
- [ ] Report to team/community
