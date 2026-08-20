/**
 * Game System Detection Utilities
 *
 * Detects the Foundry VTT game system (D&D 5e, Pathfinder 2e, etc.) and provides
 * system-specific data path mappings for cross-system compatibility.
 */

import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

/**
 * Supported game systems
 */
export type GameSystem = 'dnd5e' | 'pf2e' | 'cosmere-rpg' | 'dsa5' | 'wfrp4e' | 'mgt2e' | 'other';

/**
 * Cache for system detection (avoid repeated queries)
 */
let cachedSystem: GameSystem | null = null;
let cachedSystemId: string | null = null;

/**
 * Detect the active Foundry game system
 * Results are cached to avoid repeated queries
 */
export async function detectGameSystem(
  foundryClient: FoundryClient,
  logger?: Logger
): Promise<GameSystem> {
  if (cachedSystem) {
    return cachedSystem;
  }

  try {
    const worldInfo = await foundryClient.query('foundry-mcp-bridge.getWorldInfo');
    // In Foundry v13+, worldInfo.system is an object { id, version }.
    // In older versions it may be a plain string. Handle both.
    const systemRaw = worldInfo.system;
    const systemId =
      typeof systemRaw === 'string' ? systemRaw.toLowerCase() : (systemRaw?.id ?? '').toLowerCase();

    cachedSystemId = systemId;

    if (systemId === 'dnd5e') {
      cachedSystem = 'dnd5e';
    } else if (systemId === 'pf2e') {
      cachedSystem = 'pf2e';
    } else if (systemId === 'cosmere-rpg') {
      cachedSystem = 'cosmere-rpg';
    } else if (systemId === 'mgt2e') {
      cachedSystem = 'mgt2e';
    } else if (systemId === 'dsa5') {
      cachedSystem = 'dsa5';
    } else if (systemId === 'wfrp4e') {
      cachedSystem = 'wfrp4e';
    } else {
      cachedSystem = 'other';
    }

    if (logger) {
      logger.info('Game system detected', { systemId, detectedAs: cachedSystem });
    }

    return cachedSystem;
  } catch (error) {
    if (logger) {
      logger.warn('Failed to detect game system, will retry on next call', { error });
    }
    // Do NOT cache on error — Foundry may not be connected yet.
    // Return 'other' for this call but allow retry next time.
    return 'other';
  }
}

/**
 * Get the raw system ID string (e.g., "dnd5e", "pf2e", "coc7")
 */
export function getCachedSystemId(): string | null {
  return cachedSystemId;
}

/**
 * Clear cached system detection (useful for testing or world switches)
 */
export function clearSystemCache(): void {
  cachedSystem = null;
  cachedSystemId = null;
}

/**
 * System-specific data paths for creature/actor stats
 */
export const SystemPaths = {
  dnd5e: {
    // D&D 5e specific paths
    challengeRating: 'system.details.cr',
    creatureType: 'system.details.type.value',
    size: 'system.traits.size',
    alignment: 'system.details.alignment',
    level: 'system.details.level.value', // For NPCs/characters
    hitPoints: 'system.attributes.hp',
    armorClass: 'system.attributes.ac.value',
    abilities: 'system.abilities',
    skills: 'system.skills',
    spells: 'system.spells',
    legendaryActions: 'system.resources.legact',
    legendaryResistances: 'system.resources.legres',
  },
  pf2e: {
    // Pathfinder 2e specific paths
    level: 'system.details.level.value',
    creatureType: 'system.traits.value', // Array of traits
    size: 'system.traits.size.value',
    alignment: 'system.details.alignment.value',
    rarity: 'system.traits.rarity',
    traits: 'system.traits.value', // All traits as array
    hitPoints: 'system.attributes.hp',
    armorClass: 'system.attributes.ac.value',
    abilities: 'system.abilities',
    skills: 'system.skills',
    perception: 'system.perception',
    saves: 'system.saves',
    // PF2e doesn't have CR or legendary actions
    challengeRating: null,
    legendaryActions: null,
  },
} as const;

/**
 * Get system-specific data paths based on detected system.
 *
 * Returns null for systems without registered paths (cosmere-rpg, dsa5, other).
 * Callers must branch on `system` for those — falling back to dnd5e paths
 * silently produces wrong values when called against a non-dnd5e actor.
 */
export function getSystemPaths(system: GameSystem) {
  if (system === 'dnd5e') {
    return SystemPaths.dnd5e;
  } else if (system === 'pf2e') {
    return SystemPaths.pf2e;
  }
  return null;
}

/**
 * Extract a value from system data using a path string
 * Handles both simple and nested paths (e.g., "system.details.cr")
 */
export function extractSystemValue(data: any, path: string | null): any {
  if (!path || !data) {
    return undefined;
  }

  const parts = path.split('.');
  let value = data;

  for (const part of parts) {
    if (value === undefined || value === null) {
      return undefined;
    }
    value = value[part];
  }

  return value;
}

/**
 * Get creature level/CR based on system
 * Returns a normalized level value for D&D 5e, PF2e, and Cosmere RPG.
 */
export function getCreatureLevel(actorData: any, system: GameSystem): number | undefined {
  if (system === 'dnd5e') {
    // D&D 5e: Try CR first, then level
    const cr = extractSystemValue(actorData, SystemPaths.dnd5e.challengeRating);
    if (cr !== undefined) return Number(cr);

    const level = extractSystemValue(actorData, SystemPaths.dnd5e.level);
    if (level !== undefined) return Number(level);
  } else if (system === 'pf2e') {
    // PF2e: Level is the primary metric
    const level = extractSystemValue(actorData, SystemPaths.pf2e.level);
    if (level !== undefined) return Number(level);
  } else if (system === 'cosmere-rpg') {
    // Cosmere: tier (1-4) for adversaries, level for player characters
    const tier = extractSystemValue(actorData, 'system.tier');
    if (typeof tier === 'number') return tier;

    const level = extractSystemValue(actorData, 'system.level');
    if (typeof level === 'number') return level;
  }

  return undefined;
}

/**
 * Get creature type/traits based on system
 */
export function getCreatureType(actorData: any, system: GameSystem): string | string[] | undefined {
  if (system === 'dnd5e') {
    // D&D 5e: Single creature type string
    return extractSystemValue(actorData, SystemPaths.dnd5e.creatureType);
  } else if (system === 'pf2e') {
    // PF2e: Array of traits
    const traits = extractSystemValue(actorData, SystemPaths.pf2e.traits);
    return Array.isArray(traits) ? traits : undefined;
  }

  return undefined;
}

/**
 * Check if creature has spellcasting based on system
 */
export function hasSpellcasting(actorData: any, system: GameSystem): boolean {
  if (system === 'dnd5e') {
    // D&D 5e: Check for spells object or spellcasting level
    const spells = extractSystemValue(actorData, SystemPaths.dnd5e.spells);
    const spellLevel = extractSystemValue(actorData, 'system.details.spellLevel');
    return !!(spells || spellLevel);
  } else if (system === 'pf2e') {
    // PF2e: Check for spellcasting entries
    const spellcasting = extractSystemValue(actorData, 'system.spellcasting');
    return spellcasting && Object.keys(spellcasting).length > 0;
  }

  return false;
}

/**
 * Format system-specific error messages
 */
export function formatSystemError(system: GameSystem, systemId: string | null): string {
  if (system === 'other') {
    return `This tool currently supports D&D 5e and Pathfinder 2e. Your world uses system: "${systemId || 'unknown'}". Please use a supported system or request support for additional systems.`;
  }
  return 'Unknown system error';
}
