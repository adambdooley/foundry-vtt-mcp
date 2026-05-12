# Missing Tools - Detailed Analysis

## Executive Summary

This document provides an in-depth analysis of the 7 MCP tools present in the broken branch (`claude/update-docs-v0.6.2-01Kba6k5nEDbUNjHDrkhUniB`) that are missing from the baseline branch (`claude/dsa5-system-adapter-01QvdK2JiF6vRxwsjJQGT1F9`).

**Tools to Migrate:**

1. **get-character-entity** - Character entity deep-dive (character.ts)
2. **move-token** - Token positioning with animation (token-manipulation.ts)
3. **update-token** - Token property updates (token-manipulation.ts)
4. **delete-tokens** - Bulk token deletion (token-manipulation.ts)
5. **get-token-details** - Token inspection (token-manipulation.ts)
6. **toggle-token-condition** - Status effect management (token-manipulation.ts)
7. **get-available-conditions** - Condition discovery (token-manipulation.ts)

**File Locations:**

- `/packages/mcp-server/src/tools/character.ts` - 1 new tool
- `/packages/mcp-server/src/tools/token-manipulation.ts` - 6 new tools (NEW FILE)

---

## Tool Category 1: Character Enhancement (1 Tool)

### Tool #1: get-character-entity

**File:** `packages/mcp-server/src/tools/character.ts`
**Category:** Character
**Priority:** MEDIUM
**Complexity:** LOW
**Risk Level:** LOW

#### Purpose

Provides lazy-loading pattern for character data. The main `get-character` tool returns minimal item/action/effect metadata to reduce token usage. This tool fetches complete details for a specific entity when needed.

#### Use Case

```
User: "Tell me about Valeros's Flaming Longsword"
1. Claude calls get-character("Valeros") → gets item list with minimal data
2. Finds item with name "Flaming Longsword" (id: "abc123")
3. Claude calls get-character-entity("Valeros", "Flaming Longsword") → gets full description, stats, traits
4. Returns complete answer to user
```

#### Input Schema

```typescript
{
  characterIdentifier: string,  // Character name or ID
  entityIdentifier: string       // Entity name or ID (item/action/effect)
}
```

#### Output Schema

```typescript
// For items:
{
  entityType: 'item',
  id: string,
  name: string,
  type: string,
  description: string,           // FULL description text
  traits: string[],              // PF2e traits array
  rarity: string,                // common/uncommon/rare/unique
  level: number,
  actionType: string,            // action/reaction/free
  actions: number,               // action cost (1/2/3)
  quantity: number,
  equipped: boolean,
  attunement: string,            // D&D 5e attuned status
  hasImage: boolean,
  system: object                 // Complete system data
}

// For actions:
{
  entityType: 'action',
  name: string,
  type: string,
  itemId: string,               // Reference to source item
  traits: string[],
  variants: array,              // Attack variants (e.g., MAP penalties)
  ready: boolean,
  description: string
}

// For effects:
{
  entityType: 'effect',
  id: string,
  name: string,
  description: string,
  traits: string[],
  duration: object,
  ...fullEffectData
}
```

#### Implementation Code (from broken branch)

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

#### Tool Definition Code

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
}
```

#### Dependencies

- **FoundryClient** - Existing, used for `getCharacterInfo` query
- **Logger** - Existing
- **Zod** - Existing (schema validation)
- **No new dependencies**

#### DSA5 Compatibility

✅ **FULLY COMPATIBLE**

- Works with any game system
- Entity structure is system-agnostic
- DSA5 items/effects/actions follow same pattern as D&D5e/PF2e

#### Migration Complexity: LOW

- **Code Change:** Add 1 method to existing CharacterTools class
- **Testing Required:** Test with D&D5e, PF2e, and DSA5 characters
- **Breaking Changes:** None (additive only)

---

## Tool Category 2: Token Manipulation (6 Tools)

**NEW FILE REQUIRED:** `packages/mcp-server/src/tools/token-manipulation.ts`

### Overview

All 6 token tools are in a new `TokenManipulationTools` class in a new file. This is a clean addition with no modifications to existing code.

**Class Structure:**

```typescript
export class TokenManipulationTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: TokenManipulationToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'TokenManipulationTools' });
  }

  getToolDefinitions() {
    /* Returns array of 6 tool definitions */
  }

  async handleMoveToken(args: any): Promise<any> {
    /* Implementation */
  }
  async handleUpdateToken(args: any): Promise<any> {
    /* Implementation */
  }
  async handleDeleteTokens(args: any): Promise<any> {
    /* Implementation */
  }
  async handleGetTokenDetails(args: any): Promise<any> {
    /* Implementation */
  }
  async handleToggleTokenCondition(args: any): Promise<any> {
    /* Implementation */
  }
  async handleGetAvailableConditions(args: any): Promise<any> {
    /* Implementation */
  }
}
```

---

### Tool #2: move-token

**Category:** Token Manipulation
**Priority:** HIGH
**Complexity:** LOW
**Risk Level:** LOW

#### Purpose

Move a token to a new position on the current scene, with optional animation.

#### Input Schema

```typescript
{
  tokenId: string,      // Required: Token ID
  x: number,            // Required: New X coordinate (pixels)
  y: number,            // Required: New Y coordinate (pixels)
  animate: boolean      // Optional: Animate movement (default: false)
}
```

#### Output Schema

```typescript
{
  success: true,
  tokenId: string,
  newPosition: { x: number, y: number },
  animated: boolean
}
```

#### Implementation Code

```typescript
async handleMoveToken(args: any): Promise<any> {
  const schema = z.object({
    tokenId: z.string(),
    x: z.number(),
    y: z.number(),
    animate: z.boolean().optional().default(false),
  });

  const { tokenId, x, y, animate } = schema.parse(args);

  this.logger.info('Moving token', { tokenId, x, y, animate });

  try {
    const result = await this.foundryClient.query('foundry-mcp-bridge.moveToken', {
      tokenId,
      x,
      y,
      animate,
    });

    this.logger.debug('Token moved successfully', { tokenId });

    return {
      success: true,
      tokenId,
      newPosition: { x, y },
      animated: animate,
    };

  } catch (error) {
    this.logger.error('Failed to move token', error);
    throw new Error(`Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

#### Foundry Module Requirement

**Required:** Foundry module must implement `foundry-mcp-bridge.moveToken` handler
**File:** `packages/foundry-module/scripts/mcp-bridge.js`
**Implementation needed:**

```javascript
case 'foundry-mcp-bridge.moveToken': {
  const { tokenId, x, y, animate } = args;
  const token = canvas.tokens.get(tokenId);
  if (!token) throw new Error(`Token ${tokenId} not found`);

  await token.document.update({ x, y }, { animate });
  return { success: true };
}
```

#### DSA5 Compatibility

✅ **FULLY COMPATIBLE** - Tokens are system-agnostic

---

### Tool #3: update-token

**Category:** Token Manipulation
**Priority:** HIGH
**Complexity:** MEDIUM
**Risk Level:** MEDIUM

#### Purpose

Update various properties of a token (visibility, disposition, size, rotation, elevation, name).

#### Input Schema

```typescript
{
  tokenId: string,      // Required: Token ID
  updates: {            // Required: Properties to update
    x?: number,
    y?: number,
    width?: number,     // Grid units
    height?: number,    // Grid units
    rotation?: number,  // 0-360 degrees
    hidden?: boolean,
    disposition?: -1 | 0 | 1,  // hostile/neutral/friendly
    name?: string,
    elevation?: number,
    lockRotation?: boolean
  }
}
```

#### Output Schema

```typescript
{
  success: true,
  tokenId: string,
  updated: true,
  appliedUpdates: object  // Echo of what was updated
}
```

#### Implementation Code

```typescript
async handleUpdateToken(args: any): Promise<any> {
  const schema = z.object({
    tokenId: z.string(),
    updates: z.object({
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      rotation: z.number().min(0).max(360).optional(),
      hidden: z.boolean().optional(),
      disposition: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
      name: z.string().optional(),
      elevation: z.number().optional(),
      lockRotation: z.boolean().optional(),
    }),
  });

  const { tokenId, updates } = schema.parse(args);

  this.logger.info('Updating token', { tokenId, updates });

  try {
    const result = await this.foundryClient.query('foundry-mcp-bridge.updateToken', {
      tokenId,
      updates,
    });

    this.logger.debug('Token updated successfully', { tokenId, result });

    return {
      success: true,
      tokenId,
      updated: true,
      appliedUpdates: updates,
    };

  } catch (error) {
    this.logger.error('Failed to update token', error);
    throw new Error(`Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

#### Foundry Module Requirement

```javascript
case 'foundry-mcp-bridge.updateToken': {
  const { tokenId, updates } = args;
  const token = canvas.tokens.get(tokenId);
  if (!token) throw new Error(`Token ${tokenId} not found`);

  await token.document.update(updates);
  return { success: true };
}
```

#### DSA5 Compatibility

✅ **FULLY COMPATIBLE**

---

### Tool #4: delete-tokens

**Category:** Token Manipulation
**Priority:** HIGH
**Complexity:** LOW
**Risk Level:** MEDIUM (destructive operation)

#### Purpose

Delete one or more tokens from the current scene. Supports bulk deletion.

#### Input Schema

```typescript
{
  tokenIds: string[]    // Required: Array of token IDs (min 1)
}
```

#### Output Schema

```typescript
{
  success: boolean,
  deletedCount: number,
  tokenIds: string[],   // IDs of successfully deleted tokens
  errors: object[]      // Any errors encountered
}
```

#### Implementation Code

```typescript
async handleDeleteTokens(args: any): Promise<any> {
  const schema = z.object({
    tokenIds: z.array(z.string()).min(1),
  });

  const { tokenIds } = schema.parse(args);

  this.logger.info('Deleting tokens', { count: tokenIds.length, tokenIds });

  try {
    const result = await this.foundryClient.query('foundry-mcp-bridge.deleteTokens', {
      tokenIds,
    });

    this.logger.debug('Tokens deleted successfully', {
      deleted: result.deletedCount,
      requested: tokenIds.length,
    });

    return {
      success: result.success,
      deletedCount: result.deletedCount,
      tokenIds: result.tokenIds,
      errors: result.errors,
    };

  } catch (error) {
    this.logger.error('Failed to delete tokens', error);
    throw new Error(`Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

#### Foundry Module Requirement

```javascript
case 'foundry-mcp-bridge.deleteTokens': {
  const { tokenIds } = args;
  const scene = game.scenes.active;
  if (!scene) throw new Error('No active scene');

  const deletedTokens = [];
  const errors = [];

  for (const tokenId of tokenIds) {
    try {
      const token = scene.tokens.get(tokenId);
      if (token) {
        await token.delete();
        deletedTokens.push(tokenId);
      }
    } catch (err) {
      errors.push({ tokenId, error: err.message });
    }
  }

  return {
    success: true,
    deletedCount: deletedTokens.length,
    tokenIds: deletedTokens,
    errors
  };
}
```

#### DSA5 Compatibility

✅ **FULLY COMPATIBLE**

#### Safety Considerations

⚠️ **DESTRUCTIVE OPERATION**

- Should confirm before deleting multiple tokens
- No undo mechanism in Foundry (relies on Foundry's history)
- Consider adding confirmation prompt in tool description

---

### Tool #5: get-token-details

**Category:** Token Manipulation
**Priority:** HIGH
**Complexity:** MEDIUM
**Risk Level:** LOW

#### Purpose

Get comprehensive information about a specific token, including position, appearance, linked actor data, and status effects.

#### Input Schema

```typescript
{
  tokenId: string; // Required: Token ID
}
```

#### Output Schema

```typescript
{
  id: string,
  name: string,
  position: { x: number, y: number },
  size: { width: number, height: number },
  appearance: {
    rotation: number,
    scale: number,
    alpha: number,
    hidden: boolean,
    img: string
  },
  behavior: {
    disposition: 'hostile' | 'neutral' | 'friendly',
    elevation: number,
    lockRotation: boolean
  },
  actor: {
    id: string,
    name: string,
    type: string,
    img: string,
    isLinked: boolean
  } | null
}
```

#### Implementation Code

```typescript
async handleGetTokenDetails(args: any): Promise<any> {
  const schema = z.object({
    tokenId: z.string(),
  });

  const { tokenId } = schema.parse(args);

  this.logger.info('Getting token details', { tokenId });

  try {
    const tokenData = await this.foundryClient.query('foundry-mcp-bridge.getTokenDetails', {
      tokenId,
    });

    this.logger.debug('Retrieved token details', { tokenId, hasActorData: !!tokenData.actorData });

    return this.formatTokenDetails(tokenData);

  } catch (error) {
    this.logger.error('Failed to get token details', error);
    throw new Error(`Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

private formatTokenDetails(tokenData: any): any {
  return {
    id: tokenData.id,
    name: tokenData.name,
    position: {
      x: tokenData.x,
      y: tokenData.y,
    },
    size: {
      width: tokenData.width,
      height: tokenData.height,
    },
    appearance: {
      rotation: tokenData.rotation,
      scale: tokenData.scale,
      alpha: tokenData.alpha,
      hidden: tokenData.hidden,
      img: tokenData.img,
    },
    behavior: {
      disposition: this.getDispositionName(tokenData.disposition),
      elevation: tokenData.elevation,
      lockRotation: tokenData.lockRotation,
    },
    actor: tokenData.actorData ? {
      id: tokenData.actorId,
      name: tokenData.actorData.name,
      type: tokenData.actorData.type,
      img: tokenData.actorData.img,
      isLinked: tokenData.actorLink,
    } : null,
  };
}

private getDispositionName(disposition: number): string {
  switch (disposition) {
    case -1:
      return 'hostile';
    case 0:
      return 'neutral';
    case 1:
      return 'friendly';
    default:
      return 'unknown';
  }
}
```

#### Foundry Module Requirement

```javascript
case 'foundry-mcp-bridge.getTokenDetails': {
  const { tokenId } = args;
  const token = canvas.tokens.get(tokenId);
  if (!token) throw new Error(`Token ${tokenId} not found`);

  return {
    id: token.id,
    name: token.name,
    x: token.x,
    y: token.y,
    width: token.width,
    height: token.height,
    rotation: token.rotation,
    scale: token.scale,
    alpha: token.alpha,
    hidden: token.hidden,
    img: token.texture.src,
    disposition: token.disposition,
    elevation: token.elevation,
    lockRotation: token.lockRotation,
    actorId: token.actor?.id,
    actorLink: token.actorLink,
    actorData: token.actor ? {
      name: token.actor.name,
      type: token.actor.type,
      img: token.actor.img
    } : null
  };
}
```

#### DSA5 Compatibility

✅ **FULLY COMPATIBLE**

---

### Tool #6: toggle-token-condition

**Category:** Token Manipulation
**Priority:** HIGH
**Complexity:** HIGH
**Risk Level:** MEDIUM

#### Purpose

Apply or remove status effects/conditions on tokens (e.g., Prone, Poisoned, Blinded). System-aware - uses different condition sets for D&D5e, PF2e, and DSA5.

#### Input Schema

```typescript
{
  tokenId: string,        // Required: Token ID
  conditionId: string,    // Required: Condition ID (e.g., "prone", "poisoned")
  active?: boolean        // Optional: true=add, false=remove, undefined=toggle
}
```

#### Output Schema

```typescript
{
  success: true,
  tokenId: string,
  conditionId: string,
  isActive: boolean,      // Current state after toggle
  conditionName: string
}
```

#### Implementation Code

```typescript
async handleToggleTokenCondition(args: any): Promise<any> {
  const schema = z.object({
    tokenId: z.string(),
    conditionId: z.string(),
    active: z.boolean().optional(),
  });

  const { tokenId, conditionId, active } = schema.parse(args);

  this.logger.info('Toggling token condition', { tokenId, conditionId, active });

  try {
    const result = await this.foundryClient.query('foundry-mcp-bridge.toggleTokenCondition', {
      tokenId,
      conditionId,
      active,
    });

    this.logger.debug('Token condition toggled successfully', { tokenId, conditionId, result });

    return {
      success: true,
      tokenId,
      conditionId,
      isActive: result.isActive,
      conditionName: result.conditionName,
    };

  } catch (error) {
    this.logger.error('Failed to toggle token condition', error);
    throw new Error(`Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

#### Foundry Module Requirement

```javascript
case 'foundry-mcp-bridge.toggleTokenCondition': {
  const { tokenId, conditionId, active } = args;
  const token = canvas.tokens.get(tokenId);
  if (!token) throw new Error(`Token ${tokenId} not found`);

  const condition = CONFIG.statusEffects.find(e => e.id === conditionId);
  if (!condition) throw new Error(`Condition ${conditionId} not found`);

  // Toggle logic
  let isActive;
  if (active !== undefined) {
    isActive = active;
  } else {
    // Toggle current state
    isActive = !token.actor.effects.some(e => e.statuses.has(conditionId));
  }

  if (isActive) {
    await token.actor.toggleStatusEffect(conditionId, { active: true });
  } else {
    await token.actor.toggleStatusEffect(conditionId, { active: false });
  }

  return {
    isActive,
    conditionName: condition.name
  };
}
```

#### DSA5 Compatibility

⚠️ **SYSTEM-SPECIFIC TESTING REQUIRED**

**D&D 5e Conditions:** Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious

**PF2e Conditions:** Blinded, Broken, Clumsy, Concealed, Confused, Controlled, Dazzled, Deafened, Doomed, Drained, Dying, Encumbered, Enfeebled, Fascinated, Fatigued, Flat-Footed, Fleeing, Friendly, Frightened, Grabbed, Helpful, Hidden, Hostile, Immobilized, Indifferent, Invisible, Observed, Paralyzed, Persistent Damage, Petrified, Prone, Quickened, Restrained, Sickened, Slowed, Stunned, Stupefied, Unconscious, Undetected, Unfriendly, Unnoticed, Wounded

**DSA5 Conditions:** Must verify DSA5 system's condition implementation

- DSA5 may use different status effect names
- Testing required with DSA5 world

---

### Tool #7: get-available-conditions

**Category:** Token Manipulation
**Priority:** HIGH
**Complexity:** LOW
**Risk Level:** LOW

#### Purpose

Retrieve a list of all available status effects/conditions for the current game system. This helps Claude know which conditions can be applied with `toggle-token-condition`.

#### Input Schema

```typescript
{
} // No parameters
```

#### Output Schema

```typescript
{
  success: true,
  conditions: Array<{
    id: string,
    label: string,
    icon: string
  }>,
  gameSystem: string  // "dnd5e" | "pf2e" | "dsa5"
}
```

#### Implementation Code

```typescript
async handleGetAvailableConditions(args: any): Promise<any> {
  this.logger.info('Getting available conditions');

  try {
    const result = await this.foundryClient.query('foundry-mcp-bridge.getAvailableConditions', {});

    this.logger.debug('Retrieved available conditions', { count: result.conditions?.length });

    return {
      success: true,
      conditions: result.conditions,
      gameSystem: result.gameSystem,
    };

  } catch (error) {
    this.logger.error('Failed to get available conditions', error);
    throw new Error(`Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

#### Foundry Module Requirement

```javascript
case 'foundry-mcp-bridge.getAvailableConditions': {
  const conditions = CONFIG.statusEffects.map(effect => ({
    id: effect.id,
    label: effect.name || effect.label,
    icon: effect.icon
  }));

  return {
    conditions,
    gameSystem: game.system.id
  };
}
```

#### DSA5 Compatibility

✅ **SHOULD WORK** - Returns system-specific conditions

---

## Summary Table

| Tool                     | File                  | Lines of Code | Dependencies    | DSA5 Compat | Risk   | Priority |
| ------------------------ | --------------------- | ------------- | --------------- | ----------- | ------ | -------- |
| get-character-entity     | character.ts          | ~100          | None (existing) | ✅ Full     | LOW    | MEDIUM   |
| move-token               | token-manipulation.ts | ~40           | FoundryModule   | ✅ Full     | LOW    | HIGH     |
| update-token             | token-manipulation.ts | ~50           | FoundryModule   | ✅ Full     | MEDIUM | HIGH     |
| delete-tokens            | token-manipulation.ts | ~45           | FoundryModule   | ✅ Full     | MEDIUM | HIGH     |
| get-token-details        | token-manipulation.ts | ~80           | FoundryModule   | ✅ Full     | LOW    | HIGH     |
| toggle-token-condition   | token-manipulation.ts | ~40           | FoundryModule   | ⚠️ Test     | MEDIUM | HIGH     |
| get-available-conditions | token-manipulation.ts | ~30           | FoundryModule   | ✅ Full     | LOW    | HIGH     |

**Total Complexity:** ~385 lines of new code across 2 files

---

## Foundry Module Integration Requirements

All 7 tools require **Foundry module updates** to add handlers in `packages/foundry-module/scripts/mcp-bridge.js`:

### Required Handlers

1. `foundry-mcp-bridge.moveToken` - Move token with animation
2. `foundry-mcp-bridge.updateToken` - Update token properties
3. `foundry-mcp-bridge.deleteTokens` - Bulk delete tokens
4. `foundry-mcp-bridge.getTokenDetails` - Get token info
5. `foundry-mcp-bridge.toggleTokenCondition` - Apply/remove conditions
6. `foundry-mcp-bridge.getAvailableConditions` - List available conditions

**Note:** `get-character-entity` uses existing `foundry-mcp-bridge.getCharacterInfo` handler - no module changes needed.

---

## MCP Server Index.ts Integration

The new `TokenManipulationTools` class must be registered in `/packages/mcp-server/src/index.ts`:

```typescript
import { TokenManipulationTools } from './tools/token-manipulation.js';

// In setup function:
const tokenManipulationTools = new TokenManipulationTools({
  foundryClient,
  logger,
});

// Register tools:
const allTools = [
  ...characterTools.getToolDefinitions(),
  ...compendiumTools.getToolDefinitions(),
  ...tokenManipulationTools.getToolDefinitions(),  // ADD THIS
  // ... other tools
];

// Add handlers:
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // ... existing handlers
  case 'move-token':
    return tokenManipulationTools.handleMoveToken(request.params.arguments);
  case 'update-token':
    return tokenManipulationTools.handleUpdateToken(request.params.arguments);
  case 'delete-tokens':
    return tokenManipulationTools.handleDeleteTokens(request.params.arguments);
  case 'get-token-details':
    return tokenManipulationTools.handleGetTokenDetails(request.params.arguments);
  case 'toggle-token-condition':
    return tokenManipulationTools.handleToggleTokenCondition(request.params.arguments);
  case 'get-available-conditions':
    return tokenManipulationTools.handleGetAvailableConditions(request.params.arguments);
  case 'get-character-entity':
    return characterTools.handleGetCharacterEntity(request.params.arguments);
});
```

---

## Key Implementation Notes

### 1. Character Tool Changes (character.ts)

**Existing Changes in Broken Branch:**

- Updated `get-character` description to mention lazy-loading pattern
- Added `get-character-entity` tool definition
- Added `handleGetCharacterEntity` method
- Modified `formatCharacterResponse` to include actions array (minimal data)

**Differences from Baseline:**

- Baseline character.ts limits items to 20 with truncated descriptions
- Broken branch returns ALL items with minimal metadata (no descriptions)
- Broken branch adds actions array to response

### 2. Token Manipulation (token-manipulation.ts)

**Entirely New File:**

- 410 lines total
- Self-contained class
- No dependencies on other tools
- Clean integration point

### 3. Type Safety

All tools use Zod for runtime type validation:

```typescript
const schema = z.object({
  tokenId: z.string(),
  // ... other fields
});

const validatedArgs = schema.parse(args);
```

### 4. Error Handling

Consistent error handling pattern across all tools:

```typescript
try {
  // Implementation
} catch (error) {
  this.logger.error('Failed to ...', error);
  throw new Error(`Failed to ...: ${error instanceof Error ? error.message : 'Unknown error'}`);
}
```

---

## Testing Requirements

### Unit Tests Needed

1. **get-character-entity**
   - Test with D&D5e character items
   - Test with PF2e character feats/spells
   - Test with DSA5 character items
   - Test entity not found errors
   - Test ID vs name lookups

2. **Token Manipulation Tools**
   - Mock FoundryClient responses
   - Test input validation (Zod schemas)
   - Test error handling
   - Test all disposition values (-1, 0, 1)
   - Test rotation bounds (0-360)
   - Test bulk deletion

### Integration Tests Needed

1. **Foundry Module Integration**
   - Test each handler in live Foundry instance
   - Test with D&D5e system
   - Test with PF2e system
   - **Test with DSA5 system** (critical)
   - Test condition application (system-specific)

2. **End-to-End Tests**
   - Create test world with all 3 systems
   - Test token movement
   - Test token updates
   - Test condition toggling
   - Test bulk deletion
   - Test character entity retrieval

---

## Migration Checklist

### MCP Server Changes

- [ ] Add `get-character-entity` to CharacterTools class
- [ ] Create `token-manipulation.ts` file
- [ ] Implement TokenManipulationTools class
- [ ] Register TokenManipulationTools in index.ts
- [ ] Add tool handlers to CallToolRequestSchema handler
- [ ] Update TypeScript types if needed

### Foundry Module Changes

- [ ] Add `moveToken` handler
- [ ] Add `updateToken` handler
- [ ] Add `deleteTokens` handler
- [ ] Add `getTokenDetails` handler
- [ ] Add `toggleTokenCondition` handler
- [ ] Add `getAvailableConditions` handler
- [ ] Test all handlers in Foundry

### Testing

- [ ] Unit tests for all 7 tools
- [ ] Integration tests with D&D5e
- [ ] Integration tests with PF2e
- [ ] Integration tests with DSA5
- [ ] Condition testing for all systems
- [ ] Error handling tests

### Documentation

- [ ] Update README.md tool count (32)
- [ ] Add token manipulation category to README
- [ ] Update CHANGELOG.md (v0.6.3)
- [ ] Document token tools in detail
- [ ] Update Claude.md with token capabilities

---

## Conclusion

The 7 missing tools represent a **well-architected addition** to the MCP server:

**Strengths:**

- ✅ Clean separation (new file for token tools)
- ✅ Consistent patterns (same as existing tools)
- ✅ Good error handling
- ✅ Type safety with Zod
- ✅ System-agnostic design (mostly)

**Risks:**

- ⚠️ Condition system may need DSA5-specific testing
- ⚠️ Destructive operations (delete-tokens) need safeguards
- ⚠️ Foundry module must be updated simultaneously

**Recommendation:**
Migrate all 7 tools as a cohesive unit. The implementation quality is high, and the tools provide significant value for gameplay scenarios.
