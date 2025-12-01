# Adding New Game Systems to Foundry MCP

This guide explains how to add support for new game systems (like DSA5, Call of Cthulhu, etc.) to the Foundry VTT MCP integration using the Registry pattern introduced in v0.6.0.

## Overview

The v0.6.0 refactor introduced a modular architecture that allows adding new game systems **without editing core files**. You create three files for your system, register the adapter, and you're done!

## Architecture

### Registry Pattern Components

1. **SystemAdapter** - Handles creature indexing, filtering, and character stats extraction (MCP server side)
2. **IndexBuilder** - Builds enhanced creature index from Foundry compendiums (Foundry browser side)
3. **SystemRegistry** - Manages registered adapters
4. **IndexBuilderRegistry** - Manages registered index builders

### Files You Need to Create

For a new system named `mysystem`, create these 3 files:

```
packages/mcp-server/src/systems/mysystem/
├── adapter.ts         # Implements SystemAdapter interface
├── filters.ts         # Filter schemas and matching logic
└── index-builder.ts   # Implements IndexBuilder interface
```

## Step-by-Step Guide

### 1. Create Filter Schemas

**File:** `packages/mcp-server/src/systems/mysystem/filters.ts`

Define what users can filter by when searching creatures:

```typescript
import { z } from 'zod';

// Define creature types for your system
export const MySystemCreatureTypes = [
  'type1',
  'type2',
  'type3'
] as const;

export type MySystemCreatureType = typeof MySystemCreatureTypes[number];

// Define filter schema
export const MySystemFiltersSchema = z.object({
  // Your system's power metric (e.g., CR, Level, Challenge Points)
  powerLevel: z.union([
    z.number(),
    z.object({
      min: z.number().optional(),
      max: z.number().optional()
    })
  ]).optional(),

  creatureType: z.enum(MySystemCreatureTypes).optional(),
  size: z.string().optional(),
  // Add system-specific filters here
});

export type MySystemFilters = z.infer<typeof MySystemFiltersSchema>;

// Filter matching logic
export function matchesMySystemFilters(creature: any, filters: MySystemFilters): boolean {
  // Check if creature matches each filter
  if (filters.powerLevel !== undefined) {
    const level = creature.systemData?.powerLevel;
    if (level === undefined) return false;

    if (typeof filters.powerLevel === 'number') {
      if (level !== filters.powerLevel) return false;
    } else {
      const min = filters.powerLevel.min ?? 0;
      const max = filters.powerLevel.max ?? 30;
      if (level < min || level > max) return false;
    }
  }

  // Add more filter checks here...

  return true;
}

// Human-readable filter description
export function describeMySystemFilters(filters: MySystemFilters): string {
  const parts: string[] = [];

  if (filters.powerLevel !== undefined) {
    if (typeof filters.powerLevel === 'number') {
      parts.push(`Level ${filters.powerLevel}`);
    } else {
      parts.push(`Level ${filters.powerLevel.min}-${filters.powerLevel.max}`);
    }
  }

  if (filters.creatureType) parts.push(filters.creatureType);

  return parts.length > 0 ? parts.join(', ') : 'no filters';
}
```

### 2. Create Index Builder

**File:** `packages/mcp-server/src/systems/mysystem/index-builder.ts`

Handles building the enhanced creature index from Foundry compendiums:

```typescript
import type { IndexBuilder, SystemCreatureIndex } from '../types.js';

// Define your system's creature index structure
export interface MySystemCreatureIndex extends SystemCreatureIndex {
  system: 'mysystem';
  systemData: {
    powerLevel?: number;      // Your system's power metric
    creatureType?: string;
    size?: string;
    // Add system-specific fields here
  };
}

export class MySystemIndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'foundry-mcp-bridge') {
    this.moduleId = moduleId;
  }

  getSystemId() {
    return 'mysystem' as const;
  }

  async buildIndex(packs: any[], force = false): Promise<MySystemCreatureIndex[]> {
    const startTime = Date.now();
    const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
    const creatures: MySystemCreatureIndex[] = [];
    let totalErrors = 0;

    console.log(`[${this.moduleId}] Building MySystem creature index from ${actorPacks.length} packs...`);

    for (const pack of actorPacks) {
      const result = await this.extractDataFromPack(pack);
      creatures.push(...result.creatures);
      totalErrors += result.errors;
    }

    const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[${this.moduleId}] MySystem index complete! ${creatures.length} creatures in ${buildTimeSeconds}s`);

    return creatures;
  }

  async extractDataFromPack(pack: any): Promise<{ creatures: MySystemCreatureIndex[]; errors: number }> {
    const creatures: MySystemCreatureIndex[] = [];
    let errors = 0;

    try {
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        if (doc.type !== 'npc' && doc.type !== 'character') continue;

        const result = this.extractCreatureData(doc, pack);
        if (result) {
          creatures.push(result.creature);
          errors += result.errors;
        }
      }
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to load documents from ${pack.metadata.label}:`, error);
      errors++;
    }

    return { creatures, errors };
  }

  extractCreatureData(doc: any, pack: any): { creature: MySystemCreatureIndex; errors: number } | null {
    try {
      const system = doc.system || {};

      // Extract your system's data paths
      const powerLevel = system.details?.level?.value ?? 0;
      const creatureType = system.details?.type?.value ?? 'unknown';
      const size = system.traits?.size?.value ?? 'medium';

      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img,
          system: 'mysystem',
          systemData: {
            powerLevel: Number(powerLevel),
            creatureType,
            size
          }
        },
        errors: 0
      };
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract data from ${doc.name}:`, error);
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img || '',
          system: 'mysystem',
          systemData: {
            powerLevel: 0,
            creatureType: 'unknown',
            size: 'medium'
          }
        },
        errors: 1
      };
    }
  }
}
```

### 3. Create System Adapter

**File:** `packages/mcp-server/src/systems/mysystem/adapter.ts`

Implements the SystemAdapter interface:

```typescript
import type { SystemAdapter, SystemMetadata, SystemCreatureIndex } from '../types.js';
import { MySystemFiltersSchema, matchesMySystemFilters, describeMySystemFilters, type MySystemFilters } from './filters.js';

export class MySystemAdapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'mysystem',
      name: 'mysystem',
      displayName: 'My Game System',
      version: '1.0.0',
      description: 'Support for My Game System with power levels and creature types',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true
      }
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'mysystem';
  }

  extractCreatureData(doc: any, pack: any): { creature: SystemCreatureIndex; errors: number } | null {
    throw new Error('extractCreatureData should be called from MySystemIndexBuilder');
  }

  getFilterSchema() {
    return MySystemFiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, any>): boolean {
    const validated = MySystemFiltersSchema.safeParse(filters);
    if (!validated.success) return false;
    return matchesMySystemFilters(creature, validated.data as MySystemFilters);
  }

  getDataPaths(): Record<string, string | null> {
    return {
      // Your system's data paths
      powerLevel: 'system.details.level.value',
      creatureType: 'system.details.type.value',
      size: 'system.traits.size.value',
      hitPoints: 'system.attributes.hp',
      armorClass: 'system.attributes.ac.value',
      // Set to null for paths that don't exist in your system
      challengeRating: null,
      level: null
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): any {
    const formatted: any = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel
      }
    };

    if (creature.systemData) {
      formatted.stats = {
        powerLevel: creature.systemData.powerLevel,
        creatureType: creature.systemData.creatureType,
        size: creature.systemData.size
      };
    }

    if (creature.img) {
      formatted.hasImage = true;
    }

    return formatted;
  }

  formatCreatureForDetails(creature: SystemCreatureIndex): any {
    const formatted = this.formatCreatureForList(creature);
    formatted.detailedStats = creature.systemData;
    if (creature.img) formatted.img = creature.img;
    return formatted;
  }

  describeFilters(filters: Record<string, any>): string {
    const validated = MySystemFiltersSchema.safeParse(filters);
    if (!validated.success) return 'invalid filters';
    return describeMySystemFilters(validated.data as MySystemFilters);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    return creature.systemData?.powerLevel;
  }

  extractCharacterStats(actorData: any): any {
    const system = actorData.system || {};
    const stats: any = {};

    stats.name = actorData.name;
    stats.type = actorData.type;

    // Extract your system's character stats
    const powerLevel = system.details?.level?.value ?? system.level;
    if (powerLevel !== undefined) stats.powerLevel = Number(powerLevel);

    const hp = system.attributes?.hp;
    if (hp) {
      stats.hitPoints = {
        current: hp.value ?? 0,
        max: hp.max ?? 0
      };
    }

    // Add more stat extraction here...

    return stats;
  }
}
```

### 4. Register Your Adapter

**File:** `packages/mcp-server/src/backend.ts`

Add your adapter registration in the initialization section:

```typescript
// Import your adapter
const { MySystemAdapter } = await import('./systems/mysystem/adapter.js');

// Register it
systemRegistry.register(new MySystemAdapter());
```

That's it! Your system is now supported.

## Testing Your System

1. **Build the project:**
   ```bash
   npm run build
   npm run bundle:server
   ```

2. **Test in Foundry:**
   - Launch a world using your game system
   - Enable the Foundry MCP Bridge module
   - Rebuild the enhanced creature index
   - Test the following MCP tools:
     - `search-compendium` - Should support your filters
     - `list-creatures-by-criteria` - Should search indexed creatures
     - `get-character` - Should extract character stats correctly

3. **Verify logging:**
   Check backend logs for:
   ```
   System registry initialized { supportedSystems: ['dnd5e', 'pf2e', 'mysystem'] }
   ```

## Real-World Examples

### D&D 5e Adapter
- **Power metric:** Challenge Rating (CR) 0-30
- **Key fields:** creatureType, size, alignment, hasLegendaryActions
- **Files:** `packages/mcp-server/src/systems/dnd5e/`

### Pathfinder 2e Adapter
- **Power metric:** Level -1 to 25+
- **Key fields:** traits (array), rarity, size, alignment
- **Files:** `packages/mcp-server/src/systems/pf2e/`

### DSA5 Example (Requested by Community)
- **Power metric:** Challenge Points or Level
- **Key fields:** 8 characteristics (mu/kl/in/ch/ff/ge/ko/kk), wounds, AsP, KaP
- **Expected files:** `packages/mcp-server/src/systems/dsa5/`

## Tips & Best Practices

1. **Study existing adapters** - D&D 5e and PF2e are excellent reference implementations
2. **Fallback values** - Always provide fallback values in extractCreatureData to avoid null crashes
3. **Error handling** - Return error counts instead of throwing, so partial builds complete
4. **Logging** - Use console.log/warn for browser context, logger for Node.js context
5. **Test with real data** - Use actual compendium packs from your game system

## Supported MCP Tools

These 7 tools automatically support your new system once registered:

1. **search-compendium** - Uses your filter schema
2. **list-creatures-by-criteria** - Uses enhanced creature index
3. **get-compendium-item** - Uses system paths
4. **create-actor-from-compendium** - Uses system data extraction
5. **get-character** - Uses extractCharacterStats()
6. **list-characters** - Works with any actor type
7. **list-compendium-packs** - System-agnostic (no changes needed)

The remaining 18 tools are system-agnostic and work unchanged.

## Contributing Your Adapter

If you've created an adapter for a popular game system, consider contributing it back to the project:

1. Fork the repository
2. Create a feature branch: `feature/add-mysystem-support`
3. Add your 3 adapter files
4. Update backend.ts to register your adapter
5. Add tests (optional but appreciated)
6. Submit a pull request

## Troubleshooting

### "System adapter not found"
- Check that your adapter is registered in backend.ts
- Verify `canHandle()` returns true for your system ID

### "Enhanced creature index not supported"
- Ensure your IndexBuilder is registered (if using index-based tools)
- Check that `getSystemId()` matches your system ID exactly

### Filters not working
- Verify filter schema matches your system's data structure
- Check `matchesFilters()` logic matches your data paths
- Test filter validation with `MySystemFiltersSchema.safeParse()`

## Version History

- **v0.6.0** - Registry pattern introduced, D&D 5e and PF2e extracted to adapters
- **v0.5.5** - Multi-system support (D&D 5e + PF2e) with if/else pattern
- **Earlier** - D&D 5e only

## Questions?

- Check existing adapters: `packages/mcp-server/src/systems/dnd5e/` and `systems/pf2e/`
- Review SystemAdapter interface: `packages/mcp-server/src/systems/types.ts`
- Open an issue on GitHub for help with specific game systems
