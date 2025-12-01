/**
 * Index Builder Registry
 *
 * Registry for enhanced creature index builders. This runs in Foundry's
 * browser context (foundry-module), separate from the SystemRegistry
 * which runs in the MCP server (Node.js).
 */

import { IndexBuilder, SystemId } from './types.js';

/**
 * Registry for index builders
 */
export class IndexBuilderRegistry {
  private builders: Map<SystemId, IndexBuilder> = new Map();

  /**
   * Register an index builder
   * @param builder - Index builder to register
   */
  register(builder: IndexBuilder): void {
    const systemId = builder.getSystemId();
    if (this.builders.has(systemId)) {
      console.warn(`Index builder already registered: ${systemId}. Overwriting.`);
    }
    this.builders.set(systemId, builder);
    console.log(`Registered index builder for system: ${systemId}`);
  }

  /**
   * Get builder for a specific system ID
   * @param systemId - System ID to look up
   * @returns Index builder or null if not found
   */
  getBuilder(systemId: string): IndexBuilder | null {
    const builder = this.builders.get(systemId as SystemId);
    if (!builder) {
      console.warn(`No index builder found for system: ${systemId}`);
      return null;
    }
    return builder;
  }

  /**
   * Get all registered builders
   */
  getAllBuilders(): IndexBuilder[] {
    return Array.from(this.builders.values());
  }

  /**
   * Check if a system has a registered builder
   * @param systemId - System ID to check
   */
  hasBuilder(systemId: string): boolean {
    return this.builders.has(systemId as SystemId);
  }

  /**
   * Get list of all supported system IDs
   */
  getSupportedSystems(): SystemId[] {
    return Array.from(this.builders.keys());
  }

  /**
   * Clear all registered builders (useful for testing)
   */
  clear(): void {
    this.builders.clear();
    console.log('Cleared all index builders');
  }
}

// Singleton instance (browser context)
let registryInstance: IndexBuilderRegistry | null = null;

/**
 * Get the global index builder registry instance
 */
export function getIndexBuilderRegistry(): IndexBuilderRegistry {
  if (!registryInstance) {
    registryInstance = new IndexBuilderRegistry();
  }
  return registryInstance;
}

/**
 * Reset the global registry (for testing)
 */
export function resetIndexBuilderRegistry(): void {
  registryInstance = null;
}
