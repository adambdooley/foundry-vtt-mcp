# MCP Tool Migration Plan

## Executive Summary

This document provides a comprehensive, step-by-step migration plan for bringing the 7 missing tools from the broken branch (`claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB`) to the baseline branch (`claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9`).

**Migration Target:** v0.6.3 (Stable release with all features)

**Tools to Migrate:**

1. get-character-entity
2. move-token
3. update-token
4. delete-tokens
5. get-token-details
6. toggle-token-condition
7. get-available-conditions

**Estimated Timeline:** 2-3 days (including testing)

---

## Pre-Migration Checklist

### Environment Setup

- [ ] Verify baseline branch is checked out and clean
- [ ] Create new migration branch from baseline: `git checkout -b migrate-token-tools-v0.6.3`
- [ ] Ensure Node.js dependencies are installed: `npm install`
- [ ] Verify Foundry VTT v13 is running
- [ ] Have test worlds for D&D5e, PF2e, and DSA5 ready
- [ ] Backup current Foundry data directory

### Documentation Review

- [ ] Read MISSING_TOOLS.md completely
- [ ] Review TOOL_INVENTORY.md for context
- [ ] Check DOCUMENTATION_COMPARISON.md for doc updates needed
- [ ] Review broken branch commit history: `git log claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB`

### Code Review

- [ ] Extract and review broken branch files:
  ```bash
  git show claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB:packages/mcp-server/src/tools/character.ts > /tmp/character-broken.ts
  git show claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB:packages/mcp-server/src/tools/token-manipulation.ts > /tmp/token-manipulation-broken.ts
  ```
- [ ] Compare with baseline character.ts: `diff /tmp/character-broken.ts packages/mcp-server/src/tools/character.ts`

---

## Phase 1: MCP Server - Character Tool Enhancement

### Task 1.1: Update CharacterTools Class (character.ts)

**File:** `/packages/mcp-server/src/tools/character.ts`

**Changes Required:**

1. Add `get-character-entity` tool definition to `getToolDefinitions()`
2. Add `handleGetCharacterEntity` method
3. Update `get-character` description to mention lazy-loading
4. Optionally update `formatCharacterResponse` to return all items (not just 20)

#### Step-by-Step Instructions

**Step 1.1.1: Add Tool Definition**
Location: Inside `getToolDefinitions()` method, after `get-character` tool

```typescript
{
  name: 'get-character-entity',
  description: 'Retrieve full details for a specific entity from a character. Works for items (feats, equipment, spells), actions (strikes, special abilities), or effects/conditions. Returns complete description and all system data. Use this after get-character when you need detailed information about a specific entity.',
  inputSchema: {
    type: 'object',
    properties: {
      characterIdentifier: {
        type: 'string',
        description: 'Character name or ID',
      },
      entityIdentifier: {
        type: 'string',
        description: 'Entity name or ID (can be item ID, action name, spell name, or effect name)',
      },
    },
    required: ['characterIdentifier', 'entityIdentifier'],
  },
},
```

**Step 1.1.2: Add Handler Method**
Location: After `handleListCharacters` method

```typescript
async handleGetCharacterEntity(args: any): Promise<any> {
  const schema = z.object({
    characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
    entityIdentifier: z.string().min(1, 'Entity identifier cannot be empty'),
  });

  const { characterIdentifier, entityIdentifier } = schema.parse(args);

  this.logger.info('Getting character entity', { characterIdentifier, entityIdentifier });

  try {
    // First get the character
    const characterData = await this.foundryClient.query('foundry-mcp-bridge.getCharacterInfo', {
      characterName: characterIdentifier,
    });

    // Try to find the entity in different collections
    let entity = null;
    let entityType = null;

    // 1. Try to find as an item (by ID or name)
    entity = characterData.items?.find((i: any) =>
      i.id === entityIdentifier || i.name.toLowerCase() === entityIdentifier.toLowerCase()
    );
    if (entity) {
      entityType = 'item';
    }

    // 2. Try to find as an action (by name)
    if (!entity && characterData.actions) {
      entity = characterData.actions.find((a: any) =>
        a.name.toLowerCase() === entityIdentifier.toLowerCase()
      );
      if (entity) {
        entityType = 'action';
      }
    }

    // 3. Try to find as an effect (by name)
    if (!entity && characterData.effects) {
      entity = characterData.effects.find((e: any) =>
        e.name.toLowerCase() === entityIdentifier.toLowerCase()
      );
      if (entity) {
        entityType = 'effect';
      }
    }

    if (!entity) {
      throw new Error(`Entity "${entityIdentifier}" not found on character "${characterIdentifier}". Tried items, actions, and effects.`);
    }

    this.logger.debug('Successfully retrieved entity', {
      entityType,
      entityName: entity.name
    });

    // Return full entity details based on type
    if (entityType === 'item') {
      return {
        entityType: 'item',
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.system?.description?.value || entity.system?.description || '',
        traits: entity.system?.traits?.value || [],
        rarity: entity.system?.traits?.rarity || 'common',
        level: entity.system?.level?.value ?? entity.system?.level,
        actionType: entity.system?.actionType?.value,
        actions: entity.system?.actions?.value,
        quantity: entity.system?.quantity || 1,
        equipped: entity.system?.equipped,
        attunement: entity.system?.attunement,
        hasImage: !!entity.img,
        // Include full system data for advanced use cases
        system: entity.system,
      };
    } else if (entityType === 'action') {
      return {
        entityType: 'action',
        name: entity.name,
        type: entity.type,
        itemId: entity.itemId,
        traits: entity.traits || [],
        variants: entity.variants || [],
        ready: entity.ready,
        description: entity.description || 'Action from character strikes/abilities',
      };
    } else if (entityType === 'effect') {
      return {
        entityType: 'effect',
        id: entity.id,
        name: entity.name,
        description: entity.description || entity.name,
        traits: entity.traits || [],
        duration: entity.duration,
        // Include full effect data
        ...entity,
      };
    }

    return entity;

  } catch (error) {
    this.logger.error('Failed to get character entity', error);
    throw new Error(`Failed to retrieve entity "${entityIdentifier}" from character "${characterIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**Step 1.1.3: Optional - Update get-character Description**
Location: In `getToolDefinitions()`, update the `get-character` tool description:

Replace:

```typescript
description: 'Retrieve detailed information about a specific character by name or ID',
```

With:

```typescript
description: 'Retrieve character information optimized for minimal token usage. Returns: full stats (abilities, skills, saves, AC, HP), action names, active effects/conditions (name only), and ALL items with minimal metadata (name, type, equipped status) without descriptions. PF2e-specific: includes traits arrays for items/actions, action costs, rarity, and level. D&D 5e-specific: includes attunement status. Perfect for filtering (e.g., "deviant" trait feats, "fire" trait spells in PF2e), checking equipment, or identifying what to investigate further. Use get-character-entity to fetch full details for specific items, actions, spells, or effects.',
```

**Step 1.1.4: Optional - Return All Items (Not Just 20)**
Location: In `formatItems` method

Change from:

```typescript
private formatItems(items: any[]): any[] {
  return items.slice(0, 20).map(item => ({ // Limit to 20 items
```

To:

```typescript
private formatItems(items: any[]): any[] {
  return items.map(item => ({ // Return ALL items
```

And remove description truncation (keep minimal metadata only).

**Step 1.1.5: Optional - Add Actions to Response**
Location: In `formatCharacterResponse` method

Add after items/effects formatting:

```typescript
// Add actions with minimal data (name, traits, action cost only - no variants)
if (characterData.actions && characterData.actions.length > 0) {
  response.actions = this.formatActions(characterData.actions);
}
```

And add the `formatActions` method:

```typescript
private formatActions(actions: any[]): any[] {
  // Return minimal action data - just enough to identify and filter
  return actions.map(action => {
    const formatted: any = {
      name: action.name,
      type: action.type,
    };

    // Include traits if present (for filtering)
    if (action.traits && action.traits.length > 0) {
      formatted.traits = action.traits;
    }

    // Include action cost
    if (action.actions !== undefined) {
      formatted.actionCost = action.actions;
    }

    // Include itemId for cross-referencing
    if (action.itemId) {
      formatted.itemId = action.itemId;
    }

    return formatted;
  });
}
```

#### Verification Steps for Phase 1

**Test 1.1: Build Check**

```bash
cd /packages/mcp-server
npm run build
```

Expected: No compilation errors

**Test 1.2: Type Check**

```bash
npm run type-check
```

Expected: No type errors

---

## Phase 2: MCP Server - Token Manipulation Tools

### Task 2.1: Create TokenManipulationTools Class

**File:** `/packages/mcp-server/src/tools/token-manipulation.ts` (NEW FILE)

**Step 2.1.1: Create File**

```bash
touch packages/mcp-server/src/tools/token-manipulation.ts
```

**Step 2.1.2: Copy Complete Implementation**
Extract from broken branch:

```bash
git show claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB:packages/mcp-server/src/tools/token-manipulation.ts > packages/mcp-server/src/tools/token-manipulation.ts
```

**Step 2.1.3: Verify File Contents**
The file should contain:

- Imports (z, FoundryClient, Logger)
- TokenManipulationToolsOptions interface
- TokenManipulationTools class with:
  - Constructor
  - `getToolDefinitions()` - returns 6 tool definitions
  - `handleMoveToken()`
  - `handleUpdateToken()`
  - `handleDeleteTokens()`
  - `handleGetTokenDetails()`
  - `handleToggleTokenCondition()`
  - `handleGetAvailableConditions()`
  - `formatTokenDetails()` helper
  - `getDispositionName()` helper

**Total:** ~410 lines

#### Verification Steps for Phase 2

**Test 2.1: Build Check**

```bash
npm run build
```

Expected: No compilation errors

---

## Phase 3: MCP Server - Index.ts Integration

### Task 3.1: Register TokenManipulationTools

**File:** `/packages/mcp-server/src/index.ts`

**Step 3.1.1: Add Import**
Location: Top of file, with other tool imports

```typescript
import { TokenManipulationTools } from './tools/token-manipulation.js';
```

**Step 3.1.2: Instantiate Class**
Location: In server setup, after other tool instantiations

```typescript
const tokenManipulationTools = new TokenManipulationTools({
  foundryClient,
  logger,
});
```

**Step 3.1.3: Register Tool Definitions**
Location: Where tool definitions are collected

```typescript
const allTools = [
  ...characterTools.getToolDefinitions(),
  ...compendiumTools.getToolDefinitions(),
  ...sceneTools.getToolDefinitions(),
  ...actorCreationTools.getToolDefinitions(),
  ...questCreationTools.getToolDefinitions(),
  ...diceRollTools.getToolDefinitions(),
  ...campaignManagementTools.getToolDefinitions(),
  ...ownershipTools.getToolDefinitions(),
  ...tokenManipulationTools.getToolDefinitions(), // ADD THIS LINE
  ...mapGenerationTools.getToolDefinitions(),
  // ... DSA5 tools if present
];
```

**Step 3.1.4: Add Tool Handlers**
Location: In `CallToolRequestSchema` handler switch/case statement

```typescript
// Character tools
case 'get-character':
  return { content: [{ type: 'text', text: JSON.stringify(await characterTools.handleGetCharacter(request.params.arguments), null, 2) }] };
case 'get-character-entity':  // ADD THIS
  return { content: [{ type: 'text', text: JSON.stringify(await characterTools.handleGetCharacterEntity(request.params.arguments), null, 2) }] };
case 'list-characters':
  return { content: [{ type: 'text', text: JSON.stringify(await characterTools.handleListCharacters(request.params.arguments), null, 2) }] };

// ... other existing cases ...

// Token manipulation tools - ADD ALL THESE
case 'move-token':
  return { content: [{ type: 'text', text: JSON.stringify(await tokenManipulationTools.handleMoveToken(request.params.arguments), null, 2) }] };
case 'update-token':
  return { content: [{ type: 'text', text: JSON.stringify(await tokenManipulationTools.handleUpdateToken(request.params.arguments), null, 2) }] };
case 'delete-tokens':
  return { content: [{ type: 'text', text: JSON.stringify(await tokenManipulationTools.handleDeleteTokens(request.params.arguments), null, 2) }] };
case 'get-token-details':
  return { content: [{ type: 'text', text: JSON.stringify(await tokenManipulationTools.handleGetTokenDetails(request.params.arguments), null, 2) }] };
case 'toggle-token-condition':
  return { content: [{ type: 'text', text: JSON.stringify(await tokenManipulationTools.handleToggleTokenCondition(request.params.arguments), null, 2) }] };
case 'get-available-conditions':
  return { content: [{ type: 'text', text: JSON.stringify(await tokenManipulationTools.handleGetAvailableConditions(request.params.arguments), null, 2) }] };
```

#### Verification Steps for Phase 3

**Test 3.1: Build Check**

```bash
npm run build
```

Expected: No compilation errors, dist/ folder contains new files

**Test 3.2: Tool Count Verification**
Start MCP server and check tool list:

```bash
node packages/mcp-server/dist/index.js
```

Expected: 32 tools listed (26 baseline + 6 token + 1 character entity)

---

## Phase 4: Foundry Module - Handler Implementation

### Task 4.1: Add Token Manipulation Handlers

**File:** `/packages/foundry-module/scripts/mcp-bridge.js`

**Location:** Inside the WebRTC message handler's switch statement for `foundry-mcp-bridge.*` actions

**Step 4.1.1: Add moveToken Handler**

```javascript
case 'foundry-mcp-bridge.moveToken': {
  const { tokenId, x, y, animate } = args;

  // Validate token exists
  const token = canvas.tokens.get(tokenId);
  if (!token) {
    throw new Error(`Token ${tokenId} not found on current scene`);
  }

  // Update position
  await token.document.update({ x, y }, { animate: animate || false });

  return { success: true };
}
```

**Step 4.1.2: Add updateToken Handler**

```javascript
case 'foundry-mcp-bridge.updateToken': {
  const { tokenId, updates } = args;

  // Validate token exists
  const token = canvas.tokens.get(tokenId);
  if (!token) {
    throw new Error(`Token ${tokenId} not found on current scene`);
  }

  // Apply updates
  await token.document.update(updates);

  return { success: true };
}
```

**Step 4.1.3: Add deleteTokens Handler**

```javascript
case 'foundry-mcp-bridge.deleteTokens': {
  const { tokenIds } = args;

  const scene = game.scenes.active;
  if (!scene) {
    throw new Error('No active scene');
  }

  const deletedTokens = [];
  const errors = [];

  for (const tokenId of tokenIds) {
    try {
      const tokenDoc = scene.tokens.get(tokenId);
      if (tokenDoc) {
        await tokenDoc.delete();
        deletedTokens.push(tokenId);
      } else {
        errors.push({ tokenId, error: 'Token not found' });
      }
    } catch (err) {
      errors.push({ tokenId, error: err.message });
    }
  }

  return {
    success: true,
    deletedCount: deletedTokens.length,
    tokenIds: deletedTokens,
    errors: errors
  };
}
```

**Step 4.1.4: Add getTokenDetails Handler**

```javascript
case 'foundry-mcp-bridge.getTokenDetails': {
  const { tokenId } = args;

  const token = canvas.tokens.get(tokenId);
  if (!token) {
    throw new Error(`Token ${tokenId} not found on current scene`);
  }

  const tokenDoc = token.document;

  return {
    id: token.id,
    name: tokenDoc.name,
    x: tokenDoc.x,
    y: tokenDoc.y,
    width: tokenDoc.width,
    height: tokenDoc.height,
    rotation: tokenDoc.rotation,
    scale: tokenDoc.texture.scaleX,
    alpha: tokenDoc.alpha,
    hidden: tokenDoc.hidden,
    img: tokenDoc.texture.src,
    disposition: tokenDoc.disposition,
    elevation: tokenDoc.elevation,
    lockRotation: tokenDoc.lockRotation,
    actorId: token.actor?.id,
    actorLink: tokenDoc.actorLink,
    actorData: token.actor ? {
      name: token.actor.name,
      type: token.actor.type,
      img: token.actor.img
    } : null
  };
}
```

**Step 4.1.5: Add toggleTokenCondition Handler**

```javascript
case 'foundry-mcp-bridge.toggleTokenCondition': {
  const { tokenId, conditionId, active } = args;

  const token = canvas.tokens.get(tokenId);
  if (!token) {
    throw new Error(`Token ${tokenId} not found on current scene`);
  }

  if (!token.actor) {
    throw new Error(`Token ${tokenId} has no linked actor`);
  }

  // Find the condition in CONFIG.statusEffects
  const condition = CONFIG.statusEffects.find(e => e.id === conditionId);
  if (!condition) {
    throw new Error(`Condition ${conditionId} not found in game system`);
  }

  // Determine if we should activate or deactivate
  let shouldActivate;
  if (active !== undefined) {
    shouldActivate = active;
  } else {
    // Toggle current state
    const hasCondition = token.actor.effects.some(e =>
      e.statuses?.has(conditionId) || e.flags?.core?.statusId === conditionId
    );
    shouldActivate = !hasCondition;
  }

  // Apply or remove the condition
  await token.actor.toggleStatusEffect(conditionId, { active: shouldActivate });

  return {
    isActive: shouldActivate,
    conditionName: condition.name || condition.label || conditionId
  };
}
```

**Step 4.1.6: Add getAvailableConditions Handler**

```javascript
case 'foundry-mcp-bridge.getAvailableConditions': {
  const conditions = CONFIG.statusEffects.map(effect => ({
    id: effect.id,
    label: effect.name || effect.label || effect.id,
    icon: effect.icon
  }));

  return {
    conditions: conditions,
    gameSystem: game.system.id
  };
}
```

#### Verification Steps for Phase 4

**Test 4.1: Module Build**

```bash
cd packages/foundry-module
# If there's a build step, run it
```

**Test 4.2: Install Module in Foundry**

1. Copy module to Foundry's Data/modules folder
2. Enable module in Foundry
3. Reload Foundry
4. Check console for errors

**Test 4.3: Test Each Handler Manually**
Use browser console in Foundry:

```javascript
// Test getAvailableConditions
game.socket.emit('module.foundry-mcp-bridge', {
  action: 'foundry-mcp-bridge.getAvailableConditions',
  args: {},
});

// Test getTokenDetails (replace with real token ID)
game.socket.emit('module.foundry-mcp-bridge', {
  action: 'foundry-mcp-bridge.getTokenDetails',
  args: { tokenId: 'someTokenId' },
});
```

---

## Phase 5: Testing

### Task 5.1: Unit Tests

**Location:** Create test files in `/packages/mcp-server/test/`

**Step 5.1.1: Create Test File for Character Tools**
File: `packages/mcp-server/test/character-tools.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CharacterTools } from '../src/tools/character.js';

describe('CharacterTools - get-character-entity', () => {
  let characterTools: CharacterTools;
  let mockFoundryClient: any;
  let mockLogger: any;

  beforeEach(() => {
    mockFoundryClient = {
      query: vi.fn(),
    };
    mockLogger = {
      child: vi.fn(() => mockLogger),
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    characterTools = new CharacterTools({
      foundryClient: mockFoundryClient,
      logger: mockLogger,
    });
  });

  it('should retrieve item entity by ID', async () => {
    const mockCharacterData = {
      id: 'char1',
      name: 'Test Character',
      items: [
        {
          id: 'item1',
          name: 'Longsword',
          type: 'weapon',
          system: {
            description: { value: 'A sharp blade' },
            traits: { value: ['martial'], rarity: 'common' },
            level: { value: 1 },
          },
        },
      ],
    };

    mockFoundryClient.query.mockResolvedValue(mockCharacterData);

    const result = await characterTools.handleGetCharacterEntity({
      characterIdentifier: 'Test Character',
      entityIdentifier: 'item1',
    });

    expect(result.entityType).toBe('item');
    expect(result.name).toBe('Longsword');
    expect(result.description).toBe('A sharp blade');
  });

  it('should retrieve item entity by name (case-insensitive)', async () => {
    const mockCharacterData = {
      items: [{ id: 'item1', name: 'Longsword', type: 'weapon', system: {} }],
    };

    mockFoundryClient.query.mockResolvedValue(mockCharacterData);

    const result = await characterTools.handleGetCharacterEntity({
      characterIdentifier: 'Test',
      entityIdentifier: 'longsword', // lowercase
    });

    expect(result.name).toBe('Longsword');
  });

  it('should throw error if entity not found', async () => {
    mockFoundryClient.query.mockResolvedValue({ items: [] });

    await expect(
      characterTools.handleGetCharacterEntity({
        characterIdentifier: 'Test',
        entityIdentifier: 'nonexistent',
      })
    ).rejects.toThrow('Entity "nonexistent" not found');
  });
});
```

**Step 5.1.2: Create Test File for Token Tools**
File: `packages/mcp-server/test/token-manipulation-tools.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenManipulationTools } from '../src/tools/token-manipulation.js';

describe('TokenManipulationTools', () => {
  let tokenTools: TokenManipulationTools;
  let mockFoundryClient: any;
  let mockLogger: any;

  beforeEach(() => {
    mockFoundryClient = {
      query: vi.fn(),
    };
    mockLogger = {
      child: vi.fn(() => mockLogger),
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    };

    tokenTools = new TokenManipulationTools({
      foundryClient: mockFoundryClient,
      logger: mockLogger,
    });
  });

  describe('move-token', () => {
    it('should move token successfully', async () => {
      mockFoundryClient.query.mockResolvedValue({ success: true });

      const result = await tokenTools.handleMoveToken({
        tokenId: 'token1',
        x: 100,
        y: 200,
        animate: true,
      });

      expect(result.success).toBe(true);
      expect(result.newPosition).toEqual({ x: 100, y: 200 });
      expect(result.animated).toBe(true);
    });

    it('should default animate to false', async () => {
      mockFoundryClient.query.mockResolvedValue({ success: true });

      const result = await tokenTools.handleMoveToken({
        tokenId: 'token1',
        x: 100,
        y: 200,
      });

      expect(result.animated).toBe(false);
    });
  });

  describe('update-token', () => {
    it('should validate disposition values', async () => {
      mockFoundryClient.query.mockResolvedValue({ success: true });

      await expect(
        tokenTools.handleUpdateToken({
          tokenId: 'token1',
          updates: { disposition: 5 }, // Invalid
        })
      ).rejects.toThrow();
    });

    it('should validate rotation range', async () => {
      mockFoundryClient.query.mockResolvedValue({ success: true });

      await expect(
        tokenTools.handleUpdateToken({
          tokenId: 'token1',
          updates: { rotation: 400 }, // > 360
        })
      ).rejects.toThrow();
    });
  });

  describe('get-available-conditions', () => {
    it('should return conditions list', async () => {
      mockFoundryClient.query.mockResolvedValue({
        conditions: [
          { id: 'prone', label: 'Prone', icon: 'icons/prone.png' },
          { id: 'blinded', label: 'Blinded', icon: 'icons/blinded.png' },
        ],
        gameSystem: 'dnd5e',
      });

      const result = await tokenTools.handleGetAvailableConditions({});

      expect(result.conditions).toHaveLength(2);
      expect(result.gameSystem).toBe('dnd5e');
    });
  });
});
```

**Step 5.1.3: Run Unit Tests**

```bash
cd packages/mcp-server
npm test
```

### Task 5.2: Integration Tests

**Step 5.2.1: Test with D&D5e System**

Prerequisites:

- Foundry VTT running
- D&D5e world loaded
- Test character created
- Tokens on scene

Test Script:

```javascript
// In Claude Desktop, test each tool:

1. Test get-character-entity:
   "Show me the details of Valeros's Longsword"

2. Test get-available-conditions:
   "What status conditions are available in this game?"

3. Test move-token:
   "Move token [ID] to coordinates 500, 500 with animation"

4. Test get-token-details:
   "Tell me about token [ID]"

5. Test toggle-token-condition:
   "Apply the Prone condition to token [ID]"

6. Test update-token:
   "Make token [ID] hidden from players"

7. Test delete-tokens:
   "Delete token [ID]"
```

**Step 5.2.2: Test with PF2e System**

Repeat above tests with PF2e-specific content:

- PF2e character with feats/traits
- PF2e conditions (more extensive than D&D5e)

**Step 5.2.3: Test with DSA5 System (CRITICAL)**

Repeat all tests with DSA5:

- DSA5 character (Held)
- DSA5 items (Ausrüstung)
- DSA5 conditions (Status)

Special focus:

- Verify condition system works with DSA5's unique status effects
- Check character entity retrieval with DSA5 item structure
- Test tokens with DSA5 actors

### Task 5.3: Error Handling Tests

**Test 5.3.1: Invalid Inputs**

```javascript
// Test invalid token IDs
- move-token with nonexistent token ID
- update-token with invalid disposition value
- toggle-token-condition with invalid condition ID

// Test invalid character/entity IDs
- get-character-entity with nonexistent character
- get-character-entity with nonexistent entity
```

**Test 5.3.2: Edge Cases**

```javascript
// Test boundary conditions
- Rotation: 0, 360, negative values
- Disposition: -1, 0, 1
- Empty arrays for delete-tokens
- Tokens without actors
- Unlinked vs linked tokens
```

---

## Phase 6: Documentation Updates

### Task 6.1: Update README.md

**File:** `/README.md`

**Step 6.1.1: Update Tool Count**
Change from "25 tools" or "26 tools" to "32 tools"

**Step 6.1.2: Add Token Manipulation Section**
Add after "Campaign Management":

```markdown
### Token Manipulation

- **move-token**: Move tokens on the scene with optional animation
- **update-token**: Update token properties (visibility, size, rotation, disposition)
- **delete-tokens**: Remove one or more tokens from the scene
- **get-token-details**: Get detailed information about a token
- **toggle-token-condition**: Apply or remove status effects (Prone, Blinded, etc.)
- **get-available-conditions**: List all available conditions for the current game system
```

**Step 6.1.3: Add get-character-entity**
Add to Character Management section:

```markdown
- **get-character-entity**: Retrieve full details for specific items, spells, feats, or effects
```

### Task 6.2: Update CHANGELOG.md

**File:** `/CHANGELOG.md`

**Step 6.2.1: Add v0.6.3 Entry**
At the top of the file:

```markdown
## [0.6.3] - 2024-XX-XX

### Added

- **7 New MCP Tools:**
  - `get-character-entity` - Deep-dive into character items, actions, and effects with full descriptions
  - `move-token` - Move tokens with optional animation
  - `update-token` - Update token properties (visibility, disposition, size, rotation, elevation, name)
  - `delete-tokens` - Bulk token deletion
  - `get-token-details` - Comprehensive token inspection
  - `toggle-token-condition` - Apply/remove status effects (Prone, Poisoned, Blinded, etc.)
  - `get-available-conditions` - Discover available conditions for current game system

### Changed

- Updated `get-character` tool to use lazy-loading pattern (returns minimal item metadata)
- Character API now returns all items (not limited to 20)
- Character API includes action names with traits for filtering

### Fixed

- Migrated stable token manipulation features from v0.6.2 development branch
- Improved character entity retrieval performance

### Notes

- This release combines the stable DSA5 support from v0.6.1 with new token manipulation features
- All new tools are compatible with D&D5e, PF2e, and DSA5
- Total MCP tools: 32 (26 from v0.6.1 + 6 token tools + 1 character entity tool)
```

### Task 6.3: Update Claude.md

**File:** `/Claude.md`

**Step 6.3.1: Add Migration Notes**

```markdown
## v0.6.3 Migration (Current)

Successfully migrated 7 tools from v0.6.2 development branch:

- Token manipulation tools (6 new tools)
- Character entity deep-dive tool (1 new tool)

### Token Manipulation Capabilities

The MCP bridge now supports comprehensive token management:

- Movement and positioning
- Property updates (visibility, disposition, size)
- Status effect/condition management
- Token inspection and deletion

### Character API Enhancement

- Lazy-loading pattern for character data
- `get-character` returns minimal metadata for all items
- `get-character-entity` fetches full details on demand
- Reduces token usage while maintaining full functionality
```

### Task 6.4: Create/Update Token Documentation

**Option A: Create TOKEN_TOOLS.md**

```markdown
# Token Manipulation Tools

Comprehensive guide to the 6 token manipulation tools...
(Include examples, use cases, system-specific notes)
```

**Option B: Add to README.md**
Expand the Token Manipulation section with examples.

---

## Phase 7: Final Verification & Deployment

### Task 7.1: Full System Test

**Step 7.1.1: Clean Build**

```bash
# Clean all build artifacts
rm -rf packages/mcp-server/dist
rm -rf packages/foundry-module/dist  # if applicable

# Rebuild
npm install
npm run build
```

**Step 7.1.2: Version Bump**
Update package.json versions:

```bash
# In packages/mcp-server/package.json
"version": "0.6.3"

# In packages/foundry-module/module.json
"version": "0.6.3"
```

**Step 7.1.3: Test All 32 Tools**
Create comprehensive test checklist:

- [ ] All 26 original tools still work
- [ ] 6 token tools work with D&D5e
- [ ] 6 token tools work with PF2e
- [ ] 6 token tools work with DSA5
- [ ] get-character-entity works with all systems

### Task 7.2: Git Workflow

**Step 7.2.1: Commit Changes**

```bash
git add .
git commit -m "feat: Add 7 MCP tools for token manipulation and character entities (v0.6.3)

- Add get-character-entity for detailed item/action/effect inspection
- Add 6 token manipulation tools (move, update, delete, details, conditions)
- Update CharacterTools to support lazy-loading pattern
- Add TokenManipulationTools class with full DSA5 compatibility
- Update documentation (README, CHANGELOG, Claude.md)
- Add comprehensive unit and integration tests

Migrated from claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB
Total tools: 32 (26 baseline + 6 token + 1 entity)
Compatible with D&D5e, PF2e, and DSA5"
```

**Step 7.2.2: Merge to Baseline**

```bash
git checkout claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9
git merge --no-ff migrate-token-tools-v0.6.3
git tag v0.6.3
```

**Step 7.2.3: Push Changes**

```bash
git push origin claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9
git push origin v0.6.3
```

### Task 7.3: Release

**Step 7.3.1: Build Installers**

```bash
# Windows installer
npm run build:installer:windows

# Mac installer
npm run build:installer:mac
```

**Step 7.3.2: Create GitHub Release**

- Tag: v0.6.3
- Title: "v0.6.3 - Token Manipulation & Character Entity Tools"
- Attach installers
- Copy CHANGELOG v0.6.3 entry to release notes

---

## Rollback Plan

If critical issues are discovered:

**Step R.1: Immediate Rollback**

```bash
git checkout claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9
git reset --hard v0.6.1  # or last known good commit
```

**Step R.2: Document Issues**
Create issue in GitHub with:

- Description of problem
- Steps to reproduce
- Affected systems (D&D5e/PF2e/DSA5)
- Error logs

**Step R.3: Fix and Re-Migrate**

- Isolate problematic tool(s)
- Fix issues
- Re-run migration for specific tools

---

## Success Criteria

Migration is considered successful when:

- [ ] All 32 tools listed in MCP server
- [ ] All tools build without errors
- [ ] All tools pass unit tests
- [ ] All tools tested with D&D5e (no errors)
- [ ] All tools tested with PF2e (no errors)
- [ ] All tools tested with DSA5 (no errors)
- [ ] Documentation updated (README, CHANGELOG, Claude.md)
- [ ] No regression in existing 26 tools
- [ ] Git history is clean with meaningful commits
- [ ] v0.6.3 tag created and pushed
- [ ] Installers built and tested

---

## Timeline Estimate

| Phase       | Tasks                     | Estimated Time  | Notes                          |
| ----------- | ------------------------- | --------------- | ------------------------------ |
| **Phase 1** | Character tool update     | 1 hour          | Straightforward code addition  |
| **Phase 2** | Token tools file creation | 30 minutes      | Copy file from broken branch   |
| **Phase 3** | Index.ts integration      | 1 hour          | Careful handler registration   |
| **Phase 4** | Foundry module handlers   | 2-3 hours       | Most complex phase             |
| **Phase 5** | Testing                   | 4-6 hours       | Comprehensive across 3 systems |
| **Phase 6** | Documentation             | 2 hours         | Updates to 3-4 files           |
| **Phase 7** | Verification & deployment | 2 hours         | Final checks and release       |
| **TOTAL**   |                           | **12-16 hours** | ~2 days with breaks            |

---

## Contact & Support

If issues arise during migration:

1. Check RISK_ANALYSIS.md for known risks and mitigations
2. Review MISSING_TOOLS.md for implementation details
3. Consult broken branch commit history for context
4. Create detailed issue in GitHub

---

## Post-Migration Tasks

After successful migration:

- [ ] Update project roadmap (DSA5_ROADMAP.md) with Phase 11
- [ ] Add token tool tests to dsa5-mcp-test-report.md
- [ ] Document any discovered bugs in dsa5-mcp-bug-report-remaining-issues.md
- [ ] Consider creating tutorial video for token manipulation
- [ ] Update Patreon post with new features
- [ ] Announce v0.6.3 on relevant forums/Discord
