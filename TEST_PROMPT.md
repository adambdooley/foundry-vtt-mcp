# MCP Tool Migration Testing Prompt

Please test the following 7 newly migrated MCP tools for the Foundry VTT MCP Server. Test each tool systematically and report any errors or unexpected behavior.

## Prerequisites

- Foundry VTT v13 must be running
- A game world must be active (preferably DSA5, but D&D 5e or PF2e works too)
- At least one character/actor must exist in the world
- At least one scene with tokens must be active

---

## Test 1: get-character-entity

**Purpose:** Retrieve detailed information about a specific entity (item, action, or effect) within a character.

**Test Cases:**

### 1a. Get a weapon from a character

```
Use the get-character-entity tool with:
- characterIdentifier: [name of a character in your world]
- entityIdentifier: [name of a weapon that character has]

Expected: Full weapon details including description, damage, and system-specific data
```

### 1b. Get a spell/ability by ID

```
Use the get-character-entity tool with:
- characterIdentifier: [character name]
- entityIdentifier: [an item ID if you know one]

Expected: Entity found by ID with complete details
```

### 1c. Get an effect

```
Use the get-character-entity tool with:
- characterIdentifier: [character name]
- entityIdentifier: [name of an active effect on the character]

Expected: Effect details including duration and changes
```

### 1d. Error case - entity not found

```
Use the get-character-entity tool with:
- characterIdentifier: [valid character name]
- entityIdentifier: "NonexistentWeaponXYZ123"

Expected: Error message indicating entity not found
```

### 1e. Error case - empty identifier

```
Use the get-character-entity tool with:
- characterIdentifier: [valid character name]
- entityIdentifier: ""

Expected: Validation error about empty identifier
```

---

## Test 2: get-token-details

**Purpose:** Get comprehensive information about a token on the current scene.

**Test Cases:**

### 2a. Get details of a character token

```
Use the get-token-details tool with:
- tokenId: [ID of a token on the active scene]

Expected: Token details including position, disposition, vision settings, actor data
```

### 2b. Error case - invalid token ID

```
Use the get-token-details tool with:
- tokenId: "invalidTokenId123"

Expected: Error message indicating token not found
```

---

## Test 3: move-token

**Purpose:** Move a token to a new position on the scene.

**Test Cases:**

### 3a. Move token with animation

```
Use the move-token tool with:
- tokenId: [ID of a token]
- x: [new X coordinate, e.g., 500]
- y: [new Y coordinate, e.g., 500]
- animate: true

Expected: Token moves smoothly to new position with animation
```

### 3b. Move token instantly (no animation)

```
Use the move-token tool with:
- tokenId: [same token]
- x: [different X coordinate, e.g., 700]
- y: [different Y coordinate, e.g., 300]
- animate: false

Expected: Token jumps immediately to new position
```

### 3c. Error case - negative coordinates

```
Use the move-token tool with:
- tokenId: [valid token]
- x: -100
- y: -100

Expected: Validation error about negative coordinates
```

---

## Test 4: update-token

**Purpose:** Update various properties of a token.

**Test Cases:**

### 4a. Update token name and scale

```
Use the update-token tool with:
- tokenId: [token ID]
- updates: {
    "name": "TestTokenRenamed",
    "scale": 1.5
  }

Expected: Token name changes and appears larger
```

### 4b. Update token visibility and elevation

```
Use the update-token tool with:
- tokenId: [token ID]
- updates: {
    "hidden": false,
    "elevation": 10
  }

Expected: Token is visible and elevation updated
```

### 4c. Update disposition (friendly/hostile/neutral)

```
Use the update-token tool with:
- tokenId: [token ID]
- updates: {
    "disposition": -1
  }

Expected: Token border color changes to hostile (red)
```

### 4d. Error case - invalid property

```
Use the update-token tool with:
- tokenId: [token ID]
- updates: {
    "nonExistentProperty": "value"
  }

Expected: Either error or property ignored (check actual behavior)
```

---

## Test 5: get-available-conditions

**Purpose:** List all available status conditions for the current game system.

**Test Cases:**

### 5a. Get conditions for current system

```
Use the get-available-conditions tool

Expected: List of conditions appropriate for the game system (e.g., blinded, charmed, frightened for D&D 5e)
```

### 5b. Verify system-specific conditions

```
If using DSA5: Look for DSA5-specific conditions
If using D&D 5e: Look for standard D&D conditions
If using PF2e: Look for PF2e conditions

Expected: Conditions match the game system being used
```

---

## Test 6: toggle-token-condition

**Purpose:** Apply or remove status conditions from a token.

**Test Cases:**

### 6a. Apply a condition

```
Use the toggle-token-condition tool with:
- tokenId: [token ID]
- conditionId: "blinded" (or appropriate condition for your system)
- active: true

Expected: Condition icon appears on token
```

### 6b. Remove the same condition

```
Use the toggle-token-condition tool with:
- tokenId: [same token]
- conditionId: "blinded"
- active: false

Expected: Condition icon removed from token
```

### 6c. Toggle multiple conditions

```
Apply several different conditions in sequence:
- "prone"
- "stunned"
- "invisible"

Then remove them one by one

Expected: Each condition properly applied and removed
```

### 6d. Error case - invalid condition

```
Use the toggle-token-condition tool with:
- tokenId: [valid token]
- conditionId: "nonExistentCondition123"
- active: true

Expected: Error message about invalid condition
```

---

## Test 7: delete-tokens

**Purpose:** Delete one or multiple tokens from the scene.

**Test Cases:**

### 7a. Delete a single token

```
First, create a test token or note a token ID you can delete.

Use the delete-tokens tool with:
- tokenIds: ["tokenIdToDelete"]

Expected: Token removed from scene, confirmation message
```

### 7b. Delete multiple tokens

```
Create or identify 2-3 tokens that can be safely deleted.

Use the delete-tokens tool with:
- tokenIds: ["token1", "token2", "token3"]

Expected: All specified tokens removed, count of deleted tokens returned
```

### 7c. Error case - empty array

```
Use the delete-tokens tool with:
- tokenIds: []

Expected: Validation error about empty array
```

### 7d. Partial success - some invalid IDs

```
Use the delete-tokens tool with:
- tokenIds: ["validTokenId", "invalidTokenId123", "anotherValidTokenId"]

Expected: Valid tokens deleted, error reported for invalid ones (or graceful handling)
```

---

## Integration Test: Complete Workflow

**Scenario:** Create a combat encounter and manipulate tokens through the entire lifecycle.

1. **List characters** - Use `list-characters` to see available actors
2. **Get character details** - Use `get-character` to inspect a character
3. **Get character's weapon** - Use `get-character-entity` to retrieve weapon details
4. **Get scene tokens** - Use existing tools to list tokens on scene
5. **Get token details** - Use `get-token-details` on a combat participant
6. **Move token into position** - Use `move-token` to position for combat
7. **Apply condition** - Use `toggle-token-condition` to mark as "stunned"
8. **Get available conditions** - Use `get-available-conditions` to see what else could be applied
9. **Update token** - Use `update-token` to change elevation/scale
10. **Remove condition** - Use `toggle-token-condition` to remove "stunned"
11. **Clean up** - Use `delete-tokens` to remove test tokens (if any were created)

---

## Success Criteria

✅ All tools execute without errors
✅ Data returned matches expected format
✅ Visual changes in Foundry VTT match tool actions
✅ Error cases handled gracefully with clear messages
✅ System-specific data (DSA5/D&D5e/PF2e) correctly returned
✅ Integration workflow completes successfully

---

## Reporting Results

Please report:

1. ✅ **Pass** - Tool works as expected
2. ⚠️ **Warning** - Tool works but with minor issues
3. ❌ **Fail** - Tool errors or produces incorrect results

For any failures or warnings, include:

- The exact tool call made
- The error message or unexpected behavior
- The game system being used (DSA5/D&D5e/PF2e)
- Foundry VTT version

---

## Notes

- All Foundry module handlers are fully implemented with permission checks and audit logging
- Token IDs can be found by hovering over tokens in Foundry or using developer tools
- Test in a non-critical game world to avoid data loss
- The `delete-tokens` test should be done last to avoid removing needed test tokens
- All token manipulation tools respect the "Allow Write Operations" setting in Foundry MCP Bridge module settings
