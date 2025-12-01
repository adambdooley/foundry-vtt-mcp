/**
 * System Registry
 *
 * Central registry for managing system adapters. Allows dynamic registration
 * of game system support without modifying core files.
 */

import { SystemAdapter, SystemId } from './types.js';
import { Logger } from '../logger.js';

/**
 * Registry for system adapters
 */
export class SystemRegistry {
  private adapters: Map<SystemId, SystemAdapter> = new Map();
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Register a system adapter
   * @param adapter - System adapter to register
   */
  register(adapter: SystemAdapter): void {
    const metadata = adapter.getMetadata();
    if (this.adapters.has(metadata.id)) {
      if (this.logger) {
        this.logger.warn(`System adapter already registered: ${metadata.id}. Overwriting.`);
      }
    }
    this.adapters.set(metadata.id, adapter);
    if (this.logger) {
      this.logger.info(`Registered system adapter: ${metadata.displayName} (${metadata.id})`);
    }
  }

  /**
   * Get adapter for a specific system ID
   * @param systemId - Foundry system ID to look up
   * @returns System adapter or null if not found
   */
  getAdapter(systemId: string): SystemAdapter | null {
    // First try exact match
    const exactMatch = this.adapters.get(systemId as SystemId);
    if (exactMatch) {
      return exactMatch;
    }

    // Then try canHandle() for each adapter (handles aliases)
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(systemId)) {
        return adapter;
      }
    }

    if (this.logger) {
      this.logger.warn(`No adapter found for system: ${systemId}`);
    }
    return null;
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): SystemAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check if a system is supported
   * @param systemId - Foundry system ID
   */
  isSupported(systemId: string): boolean {
    return this.getAdapter(systemId) !== null;
  }

  /**
   * Get list of all supported system IDs
   */
  getSupportedSystems(): SystemId[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get metadata for all registered systems
   */
  getAllMetadata() {
    return this.getAllAdapters().map((adapter) => adapter.getMetadata());
  }

  /**
   * Clear all registered adapters (useful for testing)
   */
  clear(): void {
    this.adapters.clear();
    if (this.logger) {
      this.logger.debug('Cleared all system adapters');
    }
  }
}

// Singleton instance
let registryInstance: SystemRegistry | null = null;

/**
 * Get the global system registry instance
 */
export function getSystemRegistry(logger?: Logger): SystemRegistry {
  if (!registryInstance) {
    registryInstance = new SystemRegistry(logger);
  }
  return registryInstance;
}

/**
 * Reset the global registry (for testing)
 */
export function resetSystemRegistry(): void {
  registryInstance = null;
}
