/**
 * System Adapter Architecture
 *
 * Exports all types, registries, and utilities for the multi-system support.
 */

// Core types and interfaces
export type {
  SystemId,
  SystemMetadata,
  SystemCreatureIndex,
  SystemAdapter,
  IndexBuilder,
  DnD5eCreatureIndex,
  PF2eCreatureIndex,
  GenericCreatureIndex,
  AnyCreatureIndex
} from './types.js';

// System registry (MCP server context)
export {
  SystemRegistry,
  getSystemRegistry,
  resetSystemRegistry
} from './system-registry.js';

// Index builder registry (Foundry browser context)
export {
  IndexBuilderRegistry,
  getIndexBuilderRegistry,
  resetIndexBuilderRegistry
} from './index-builder-registry.js';
