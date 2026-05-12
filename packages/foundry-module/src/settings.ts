import { MODULE_ID, DEFAULT_CONFIG } from './constants.js';
import type { BridgeConfig } from './socket-bridge.js';

export class ModuleSettings {
  private moduleId: string = MODULE_ID;

  /**
   * Register all module settings with Foundry
   */
  registerSettings(): void {
    // ============================================================================
    // SETTINGS MENU - Detailed Configuration Dialog
    // ============================================================================

    // Enhanced Creature Index submenu
    (game.settings as any).registerMenu(this.moduleId, 'enhancedIndexMenu', {
      name: 'Enhanced Creature Index',
      label: 'Configure Enhanced Index',
      hint: 'The Enhanced Creature Index pre-computes creature statistics for instant filtering by Challenge Rating, creature type, and abilities. This enables AI models to quickly find creatures matching specific criteria without loading every compendium entry.',
      icon: 'fas fa-search-plus',
      type: class extends FormApplication {
        static get defaultOptions() {
          return foundry.utils.mergeObject(super.defaultOptions, {
            title: 'Enhanced Creature Index Settings',
            template: `modules/${MODULE_ID}/templates/enhanced-index-menu.html`,
            width: 500,
            height: 'auto',
            resizable: false,
            closeOnSubmit: false,
          } as any);
        }

        getData(): any {
          return {
            enableEnhancedCreatureIndex: game.settings.get(
              MODULE_ID,
              'enableEnhancedCreatureIndex'
            ),
            autoRebuildIndex: game.settings.get(MODULE_ID, 'autoRebuildIndex'),
          };
        }

        activateListeners(html: JQuery) {
          super.activateListeners(html);
          html.find('.rebuild-index-btn').click(() => {
            const bridge = (globalThis as any).foundryMCPBridge;
            if (bridge?.dataAccess?.rebuildEnhancedCreatureIndex) {
              ui.notifications?.info('Rebuilding enhanced creature index...');
              bridge.dataAccess.rebuildEnhancedCreatureIndex();
            }
          });
        }

        async _updateObject(_event: Event, formData: any) {
          await game.settings.set(
            MODULE_ID,
            'enableEnhancedCreatureIndex',
            formData.enableEnhancedCreatureIndex
          );
          await game.settings.set(MODULE_ID, 'autoRebuildIndex', formData.autoRebuildIndex);
        }
      },
      restricted: true,
    });

    // Map Generation Service submenu
    (game.settings as any).registerMenu(this.moduleId, 'mapGenerationSettings', {
      name: 'Map Generation Service Configuration',
      label: 'Configure Map Generation',
      hint: 'Configure your map generation service for AI-powered battlemap creation. Currently supports ComfyUI installations with plans for future cloud services.',
      icon: 'fas fa-cogs',
      type: class extends FormApplication {
        static get defaultOptions() {
          return foundry.utils.mergeObject(super.defaultOptions, {
            title: 'Map Generation Service Settings',
            template: `modules/${MODULE_ID}/templates/comfyui-settings.html`,
            width: 500,
            height: 'auto',
            resizable: false,
            closeOnSubmit: false,
          } as any);
        }

        getData(): any {
          return {
            autoStartService: game.settings.get(MODULE_ID, 'mapGenAutoStart') || true,
            mapGenQuality: game.settings.get(MODULE_ID, 'mapGenQuality') || 'low',
            connectionStatus: this.getConnectionStatus(),
            connectionStatusText: this.getConnectionStatusText(),
          };
        }

        getConnectionStatus(): string {
          const bridge = (globalThis as any).foundryMCPBridge;
          return bridge?.comfyuiManager ? 'unknown' : 'stopped';
        }

        getConnectionStatusText(): string {
          return 'Click "Check Status" to verify service';
        }

        activateListeners(html: JQuery) {
          super.activateListeners(html);

          // Service control buttons
          html.find('#check-status-btn').click(async () => {
            await this.checkServiceStatus();
          });

          html.find('#start-service-btn').click(async () => {
            await this.startService();
          });

          html.find('#stop-service-btn').click(async () => {
            await this.stopService();
          });
        }

        async checkServiceStatus() {
          const bridge = (globalThis as any).foundryMCPBridge;
          if (bridge?.comfyuiManager) {
            try {
              const status = await bridge.comfyuiManager.checkStatus();
              this.updateStatusDisplay(status);
            } catch (error) {
              console.error('Status check failed:', error);
              this.updateStatusDisplay({ status: 'error', message: 'Status check failed' });
            }
          }
        }

        async startService() {
          const bridge = (globalThis as any).foundryMCPBridge;
          if (bridge?.comfyuiManager) {
            try {
              const result = await bridge.comfyuiManager.startService();
              this.updateStatusDisplay(result);
            } catch (error) {
              console.error('Service start failed:', error);
              this.updateStatusDisplay({ status: 'error', message: 'Service start failed' });
            }
          }
        }

        async stopService() {
          const bridge = (globalThis as any).foundryMCPBridge;
          if (bridge?.comfyuiManager) {
            try {
              const result = await bridge.comfyuiManager.stopService();
              this.updateStatusDisplay(result);
            } catch (error) {
              console.error('Service stop failed:', error);
              this.updateStatusDisplay({ status: 'error', message: 'Service stop failed' });
            }
          }
        }

        updateStatusDisplay(status: any) {
          const statusElement = this.element.find('#connection-status');
          const statusText = this.element.find('#status-text');

          // Remove all status classes
          statusElement.removeClass('running stopped starting error unknown');

          // Add current status class
          statusElement.addClass(status.status);
          statusText.text(this.getStatusText(status.status));
        }

        getStatusText(status: string): string {
          const statusMap: { [key: string]: string } = {
            running: 'Service Running',
            stopped: 'Service Stopped',
            starting: 'Service Starting...',
            error: 'Service Error',
            unknown: 'Status Unknown',
          };
          return statusMap[status] || 'Unknown';
        }

        async _updateObject(_event: Event, formData: any) {
          await game.settings.set(MODULE_ID, 'mapGenAutoStart', formData.autoStartService);
          await game.settings.set(MODULE_ID, 'mapGenQuality', formData.mapGenQuality);
          ui.notifications?.info('Map generation service settings saved successfully');
        }
      },
      restricted: true,
    });

    // ============================================================================
    // SECTION 1: BASIC SETTINGS
    // ============================================================================

    game.settings.register(this.moduleId, 'enabled', {
      name: 'Enable MCP Bridge',
      hint: 'Master switch to enable/disable the MCP bridge connection',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
      onChange: this.onEnabledChange.bind(this),
    });

    game.settings.register(this.moduleId, 'connectionType', {
      name: 'Connection Type',
      hint: 'Auto: Smart selection (HTTPS→WebRTC, HTTP→WebSocket). WebRTC: Encrypted P2P (works over internet). WebSocket: Traditional (localhost only).',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        auto: 'Auto (Recommended)',
        webrtc: 'WebRTC (Internet)',
        websocket: 'WebSocket (Local Only)',
      },
      default: 'auto',
      onChange: this.onConnectionChange.bind(this),
    });

    game.settings.register(this.moduleId, 'serverHost', {
      name: 'Websocket Server Host',
      hint: 'IP address for local Websocket Server connections to the MCP Server (usually localhost). Not used for Remote Connections',
      scope: 'world',
      config: true,
      type: String,
      default: DEFAULT_CONFIG.MCP_HOST,
      onChange: this.onConnectionChange.bind(this),
    });

    game.settings.register(this.moduleId, 'serverPort', {
      name: 'Server Port',
      hint: 'Port number for MCP server communication',
      scope: 'world',
      config: false,
      type: Number,
      default: DEFAULT_CONFIG.MCP_PORT,
      onChange: this.onConnectionChange.bind(this),
    });

    // ============================================================================
    // SECTION 2: WRITE PERMISSIONS
    // ============================================================================

    game.settings.register(this.moduleId, 'allowWriteOperations', {
      name: 'Allow Write Operations',
      hint: 'Let AI model create actors, NPCs, and modify world content. Reading is always allowed.',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });

    // ============================================================================
    // SECTION 3: SAFETY CONTROLS - Limits on AI model's Actions
    // ============================================================================

    game.settings.register(this.moduleId, 'maxActorsPerRequest', {
      name: 'Max Actors Per Request',
      hint: 'Maximum number of actors AI model can create in a single request',
      scope: 'world',
      config: true,
      type: Number,
      default: 10,
      range: {
        min: 1,
        max: 50,
        step: 1,
      },
    });

    // Removed 'enableWriteAuditLog' setting as it provides no rollback functionality
    // and only creates log entries without user-actionable features

    // Enhanced Creature Index settings (configured via submenu only)
    game.settings.register(this.moduleId, 'enableEnhancedCreatureIndex', {
      scope: 'world',
      config: false, // Hidden from main config, accessible via submenu only
      type: Boolean,
      default: true,
    });

    game.settings.register(this.moduleId, 'autoRebuildIndex', {
      scope: 'world',
      config: false, // Hidden from main config, accessible via submenu only
      type: Boolean,
      default: true,
    });

    // Map Generation Service settings (configured via submenu only)
    // ComfyUI always runs on localhost:31411 (same machine as MCP server)
    game.settings.register(this.moduleId, 'mapGenAutoStart', {
      name: 'Auto-start Map Generation Service',
      scope: 'world',
      config: false, // Hidden from main config, accessible via submenu only
      type: Boolean,
      default: true,
    });

    game.settings.register(this.moduleId, 'mapGenQuality', {
      name: 'Generation Quality',
      hint: 'Higher quality = better detail but slower generation. Generation time depends on your hardware.',
      scope: 'world',
      config: false, // Hidden from main config, accessible via submenu only
      type: String,
      choices: {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
      },
      default: 'low',
    });

    // ============================================================================
    // SECTION 4: CONNECTION BEHAVIOR
    // ============================================================================

    game.settings.register(this.moduleId, 'enableNotifications', {
      name: 'Show Connection Messages',
      hint: 'Display notifications when connecting/disconnecting from AI model',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });

    game.settings.register(this.moduleId, 'autoReconnectEnabled', {
      name: 'Auto-Reconnect on Disconnect',
      hint: 'Automatically try to reconnect if the connection to AI model is lost',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });

    game.settings.register(this.moduleId, 'heartbeatInterval', {
      name: 'Connection Check Frequency',
      hint: 'How often to check if AI model is still connected (seconds)',
      scope: 'world',
      config: true,
      type: Number,
      default: 30,
      range: {
        min: 10,
        max: 120,
        step: 5,
      },
    });

    // Non-configurable settings for internal state
    game.settings.register(this.moduleId, 'lastConnectionState', {
      scope: 'world',
      config: false,
      type: String,
      default: 'disconnected',
    });

    game.settings.register(this.moduleId, 'lastActivity', {
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });

    // Track when we last showed the MCP server notification to avoid spam
    game.settings.register(this.moduleId, 'lastMCPServerNotification', {
      scope: 'world',
      config: false,
      type: String,
      default: '',
    });

    // Roll state storage for persistent roll button states
    game.settings.register(this.moduleId, 'rollStates', {
      scope: 'world',
      config: false,
      type: Object,
      default: {},
      onChange: this.onRollStatesChanged.bind(this),
    });

    // Button to message ID mapping for ChatMessage updates
    game.settings.register(this.moduleId, 'buttonMessageMap', {
      scope: 'world',
      config: false,
      type: Object,
      default: {},
    });
  }

  /**
   * Handle roll states setting changes - fires on all clients for world-scoped settings
   */
  private onRollStatesChanged(_newValue: any): void {
    // No action needed - ChatMessage.update() handles state synchronization automatically
  }

  /**
   * Update connection status display in settings
   */
  updateConnectionStatusDisplay(connected: boolean, _toolCount: number): void {
    try {
      const statusText = connected
        ? `✅ Connected`
        : `❌ Disconnected - Use connection panel to connect`;

      // Update the hint for the enabled setting to show status
      const enabledSetting = (game.settings as any).settings.get(`${this.moduleId}.enabled`);
      if (enabledSetting) {
        enabledSetting.hint = `${enabledSetting.hint.split(' |')[0]} | Status: ${statusText}`;
      }
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to update status display:`, error);
    }
  }

  /**
   * Get current bridge configuration from settings
   */
  getBridgeConfig(): BridgeConfig {
    const connectionType = this.getSetting('connectionType');

    return {
      enabled: this.getSetting('enabled'),
      serverHost: this.getSetting('serverHost'),
      serverPort: this.getSetting('serverPort'),
      namespace: '/foundry-mcp', // Fixed namespace - no user configuration needed
      reconnectAttempts: DEFAULT_CONFIG.RECONNECT_ATTEMPTS, // Use sensible default
      reconnectDelay: DEFAULT_CONFIG.RECONNECT_DELAY, // Use sensible default
      connectionTimeout: DEFAULT_CONFIG.CONNECTION_TIMEOUT, // Use sensible default
      debugLogging: false, // Always false - use browser console for debugging
      connectionType: connectionType as 'auto' | 'webrtc' | 'websocket',
    };
  }

  /**
   * Get a specific setting value
   */
  getSetting(key: string): any {
    return game.settings.get(this.moduleId, key);
  }

  /**
   * Set a specific setting value
   */
  async setSetting(key: string, value: any): Promise<any> {
    return game.settings.set(this.moduleId, key, value);
  }

  /**
   * Get all settings as an object
   */
  getAllSettings(): Record<string, any> {
    const settingKeys = [
      // Basic Settings
      'enabled',
      'serverHost',
      'serverPort',
      'connectionType',
      // Permissions
      'allowWriteOperations',
      // Safety Controls
      'maxActorsPerRequest',
      // Enhanced Creature Index
      'enableEnhancedCreatureIndex',
      'autoRebuildIndex',
      // Connection Behavior
      'enableNotifications',
      'autoReconnectEnabled',
      'heartbeatInterval',
    ];

    const settings: Record<string, any> = {};
    for (const key of settingKeys) {
      settings[key] = this.getSetting(key);
    }

    return settings;
  }

  /**
   * Validate settings for consistency
   */
  validateSettings(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const host = this.getSetting('serverHost');
    if (!host || typeof host !== 'string' || host.trim().length === 0) {
      errors.push('Server host cannot be empty');
    }

    const port = this.getSetting('serverPort');
    if (!port || typeof port !== 'number' || port < 1024 || port > 65535) {
      errors.push('Server port must be between 1024 and 65535');
    }

    const maxActors = this.getSetting('maxActorsPerRequest');
    if (!maxActors || typeof maxActors !== 'number' || maxActors < 1 || maxActors > 10) {
      errors.push('Max actors per request must be between 1 and 10');
    }

    const heartbeat = this.getSetting('heartbeatInterval');
    if (!heartbeat || typeof heartbeat !== 'number' || heartbeat < 10 || heartbeat > 120) {
      errors.push('Heartbeat interval must be between 10 and 120 seconds');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Handle enabled setting change
   */
  private onEnabledChange(enabled: boolean): void {
    // Trigger bridge state change through global event
    if (window.foundryMCPBridge) {
      if (enabled) {
        window.foundryMCPBridge.start?.();
      } else {
        window.foundryMCPBridge.stop?.();
      }
    }
  }

  /**
   * Handle connection setting changes
   */
  private onConnectionChange(): void {
    // If bridge is running, restart it with new settings
    if (window.foundryMCPBridge && this.getSetting('enabled')) {
      window.foundryMCPBridge.restart?.();
    }
  }

  /**
   * Create settings migration for version updates
   */
  /**
   * Get write operation permissions
   */
  getWritePermissions(): {
    allowWriteOperations: boolean;
    maxActorsPerRequest: number;
  } {
    return {
      allowWriteOperations: this.getSetting('allowWriteOperations'),
      maxActorsPerRequest: this.getSetting('maxActorsPerRequest'),
    };
  }

  /**
   * Check if AI model is allowed to perform write operations
   */
  isWriteOperationAllowed(_operation?: string): boolean {
    // Simplified - single permission covers all write operations
    return this.getSetting('allowWriteOperations');
  }

  migrateSettings(_fromVersion: string, _toVersion: string): void {
    // Add migration logic here for future versions
    // For now, no migrations needed as this is initial version
  }

  /**
   * Reset all settings to defaults
   */
  async resetToDefaults(): Promise<void> {
    const settingKeys = [
      // Basic Settings
      'enabled',
      'serverHost',
      'serverPort',
      'connectionType',
      // Permissions
      'allowWriteOperations',
      // Safety Controls
      'maxActorsPerRequest',
      // Enhanced Creature Index
      'enableEnhancedCreatureIndex',
      'autoRebuildIndex',
      // Connection Behavior
      'enableNotifications',
      'autoReconnectEnabled',
      'heartbeatInterval',
    ];

    for (const key of settingKeys) {
      // Get the default value from the setting registration
      const setting = (game.settings as any).settings.get(`${this.moduleId}.${key}`);
      if (setting && 'default' in setting) {
        await this.setSetting(key, setting.default);
      }
    }

    ui.notifications.info('MCP Bridge settings have been reset to defaults');
  }
}
