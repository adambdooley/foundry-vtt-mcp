// Shared constants for Foundry MCP Integration

/**
 * Module constants
 */
export const MODULE_ID = 'foundry-mcp-bridge';
export const MODULE_TITLE = 'Foundry MCP Bridge';

/**
 * Socket event names
 */
export const SOCKET_EVENTS = {
  MCP_QUERY: 'mcp-query',
  MCP_RESPONSE: 'mcp-response',
  BRIDGE_STATUS: 'bridge-status',
  PING: 'ping',
  PONG: 'pong',
} as const;

/**
 * MCP method names
 */
export const MCP_METHODS = {
  GET_CHARACTER_INFO: 'getCharacterInfo',
  SEARCH_COMPENDIUM: 'searchCompendium',
  GET_SCENE_INFO: 'getSceneInfo',
  GET_WORLD_INFO: 'getWorldInfo',
  GET_AVAILABLE_PACKS: 'getAvailablePacks',
  PING: 'ping',
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  MCP_HOST: 'localhost',
  MCP_PORT: 31415,
  CONNECTION_TIMEOUT: 10,
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 1000,
  LOG_LEVEL: 'info',
} as const;

/**
 * Supported compendium pack types
 */
export const PACK_TYPES = {
  ACTOR: 'Actor',
  ITEM: 'Item',
  SCENE: 'Scene',
  JOURNAL_ENTRY: 'JournalEntry',
  MACRO: 'Macro',
  ROLL_TABLE: 'RollTable',
  PLAYLIST: 'Playlist',
  CARDS: 'Cards',
} as const;

/**
 * Token dispositions
 */
export const TOKEN_DISPOSITIONS = {
  HOSTILE: -1,
  NEUTRAL: 0,
  FRIENDLY: 1,
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  NOT_INITIALIZED: 'Data provider not initialized',
  NOT_CONNECTED: 'Not connected to Foundry VTT',
  CHARACTER_NOT_FOUND: 'Character not found',
  SCENE_NOT_FOUND: 'Scene not found',
  ACCESS_DENIED: 'Access denied - feature is disabled',
  QUERY_TIMEOUT: 'Query timeout',
  UNKNOWN_METHOD: 'Unknown method',
  BRIDGE_NOT_RUNNING: 'MCP Bridge is not running',
} as const;

/**
 * Log levels
 */
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
} as const;

/**
 * Connection states
 */
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
} as const;
