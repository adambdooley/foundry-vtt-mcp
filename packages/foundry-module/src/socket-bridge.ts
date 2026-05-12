import { MODULE_ID, CONNECTION_STATES } from './constants.js';
import { WebRTCConnection, type WebRTCConfig } from './webrtc-connection.js';

export interface BridgeConfig {
  enabled: boolean;
  serverHost: string;
  serverPort: number;
  namespace: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  connectionTimeout: number;
  debugLogging: boolean;
  connectionType?: 'auto' | 'webrtc' | 'websocket'; // Connection type: auto (HTTPS→WebRTC, HTTP→WebSocket), webrtc, websocket
}

/**
 * Browser-compatible socket bridge that supports both WebSocket and WebRTC
 */
export class SocketBridge {
  private ws: WebSocket | null = null;
  private webrtc: WebRTCConnection | null = null;
  private connectionState: string = CONNECTION_STATES.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: any = null;
  private activeConnectionType: 'websocket' | 'webrtc' | null = null;

  constructor(private config: BridgeConfig) {
    this.maxReconnectAttempts = config.reconnectAttempts;
  }

  async connect(): Promise<void> {
    if (
      this.connectionState === CONNECTION_STATES.CONNECTED ||
      this.connectionState === CONNECTION_STATES.CONNECTING
    ) {
      return;
    }

    this.connectionState = CONNECTION_STATES.CONNECTING;
    this.log('Connecting to MCP server...');

    // Determine connection type
    const connectionType = this.determineConnectionType();
    this.log(`Using connection type: ${connectionType}`);

    if (connectionType === 'webrtc') {
      await this.connectWebRTC();
    } else {
      await this.connectWebSocket();
    }
  }

  private determineConnectionType(): 'websocket' | 'webrtc' {
    const configType = this.config.connectionType || 'auto';

    if (configType === 'auto') {
      // Use WebRTC for HTTPS (secure), WebSocket for HTTP (localhost)
      // WebRTC provides P2P encrypted channel without needing SSL certificates
      const isHttps = window.location.protocol === 'https:';
      const type = isHttps ? 'webrtc' : 'websocket';
      this.log(`Auto-detected connection type: ${type} (page is ${window.location.protocol})`);
      return type;
    }

    // Use explicit connection type from config
    return configType as 'websocket' | 'webrtc';
  }

  private async connectWebRTC(): Promise<void> {
    this.activeConnectionType = 'webrtc';

    const webrtcConfig: WebRTCConfig = {
      serverHost: this.config.serverHost,
      serverPort: this.config.serverPort,
      namespace: this.config.namespace,
      stunServers: [], // Empty for localhost - must match server configuration
      connectionTimeout: this.config.connectionTimeout,
      debugLogging: this.config.debugLogging,
    };

    this.webrtc = new WebRTCConnection(webrtcConfig);

    try {
      await this.webrtc.connect(this.handleMessage.bind(this));
      this.connectionState = CONNECTION_STATES.CONNECTED;
      this.reconnectAttempts = 0;
      this.log('Connected via WebRTC');
    } catch (error) {
      this.log(`WebRTC connection failed: ${error}`);
      this.connectionState = CONNECTION_STATES.DISCONNECTED;
      this.scheduleReconnect();
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    this.activeConnectionType = 'websocket';

    // WebSocket for HTTP localhost connections only
    const protocol = 'ws';
    const host = this.config.serverHost;
    this.log(`Using WebSocket (${protocol}://${host}:${this.config.serverPort})`);

    const wsUrl = `${protocol}://${host}:${this.config.serverPort}${this.config.namespace}`;

    return new Promise((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        this.log('Connection timeout');
        this.connectionState = CONNECTION_STATES.DISCONNECTED;
        reject(new Error('Connection timeout'));
      }, this.config.connectionTimeout * 1000);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.connectionState = CONNECTION_STATES.CONNECTED;
          this.reconnectAttempts = 0;
          this.log('Connected to MCP server via WebSocket');
          this.setupEventHandlers();
          resolve();
        };

        this.ws.onerror = error => {
          clearTimeout(connectTimeout);
          // Use more informative message for connection failures
          const isFirstAttempt = this.reconnectAttempts === 0;
          const errorMsg = isFirstAttempt
            ? "MCP server not available (this is normal if server isn't running)"
            : `Connection error after ${this.reconnectAttempts} attempts: ${error}`;
          this.log(errorMsg);
          this.connectionState = CONNECTION_STATES.DISCONNECTED;
          this.scheduleReconnect();
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = event => {
          this.log(`Disconnected: ${event.reason || 'Connection closed'}`);
          this.connectionState = CONNECTION_STATES.DISCONNECTED;

          if (event.wasClean) {
            // Clean disconnect, don't reconnect
            return;
          }

          this.scheduleReconnect();
        };
      } catch (error) {
        clearTimeout(connectTimeout);
        this.log(`Failed to create WebSocket: ${error}`);
        this.connectionState = CONNECTION_STATES.DISCONNECTED;
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.webrtc) {
      this.webrtc.disconnect();
      this.webrtc = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }

    this.activeConnectionType = null;
    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.log('Disconnected from MCP server');
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        this.log(`Failed to parse message: ${error}`);
      }
    };
  }

  private async handleMessage(message: any): Promise<void> {
    try {
      if (message.type === 'mcp-query') {
        await this.handleMCPQuery(message.data, response => {
          this.sendMessage({
            type: 'mcp-response',
            id: message.id,
            data: response,
          });
        });
      } else if (message.type === 'ping') {
        this.sendMessage({
          type: 'pong',
          id: message.id,
          data: { timestamp: Date.now(), status: 'ok' },
        });
      } else if (message.type === 'job-completed') {
        await this.handleJobCompleted(message.data);
      } else if (message.type === 'map-generation-progress') {
        this.handleProgressUpdate(message.data);
      }
    } catch (error) {
      console.error(`[foundry-mcp-bridge] ERROR in handleMessage:`, error);
      this.log(`Error handling message: ${error}`);
    }
  }

  private handleProgressUpdate(data: any): void {
    try {
      if (!data) {
        // Silently ignore empty progress updates (can happen during initialization)
        return;
      }
      const { progress, status, queueInfo } = data;

      // Build progress message
      let message = `🎨 Generating battlemap: ${progress}%`;

      if (queueInfo) {
        const { currentStep, totalSteps, estimatedTimeRemaining } = queueInfo;
        if (currentStep !== undefined && totalSteps !== undefined) {
          message += ` (Step ${currentStep}/${totalSteps})`;
        }
        if (estimatedTimeRemaining) {
          const minutes = Math.floor(estimatedTimeRemaining / 60);
          const seconds = Math.floor(estimatedTimeRemaining % 60);
          if (minutes > 0) {
            message += ` - ${minutes}m ${seconds}s remaining`;
          } else {
            message += ` - ${seconds}s remaining`;
          }
        }
      }

      if (status) {
        message += ` - ${status}`;
      }

      // Show as banner notification
      ui.notifications?.info(message);

      this.log(`Progress: ${message}`);
    } catch (error) {
      console.error(`[foundry-mcp-bridge] Error handling progress update:`, error);
    }
  }

  private async handleMCPQuery(data: any, callback: (response: any) => void): Promise<void> {
    try {
      this.log(`Handling MCP query: ${data.method}`);

      // Check if the query handler exists in CONFIG.queries
      const queryKey = data.method; // Method already includes full path like 'foundry-mcp-bridge.listActors'
      const handler = CONFIG.queries[queryKey];

      if (!handler || typeof handler !== 'function') {
        throw new Error(`No handler found for query: ${data.method}`);
      }

      // Execute the query handler
      const result = await handler(data.data || {});

      this.log(`Query completed: ${data.method}`);
      callback({ success: true, data: result });
    } catch (error) {
      this.log(
        `Query failed: ${data.method} - ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      callback({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleJobCompleted(data: any): Promise<void> {
    try {
      console.log(`[foundry-mcp-bridge] Map generation completed, creating scene...`);
      console.log(`[foundry-mcp-bridge] Job completion data:`, data);

      // Handle mapgen-style data structure
      if (!data.result) {
        console.error(`[foundry-mcp-bridge] ERROR: No scene result data provided`);
        throw new Error('No scene result data provided');
      }

      if (!data.image_path) {
        console.error(`[foundry-mcp-bridge] ERROR: No image path provided for scene creation`);
        throw new Error('No image path provided for scene creation');
      }

      // Use the complete scene data from backend (like mapgen does)
      const sceneData = data.result;

      console.log(`[foundry-mcp-bridge] Scene data to create:`, sceneData);
      console.log(`[foundry-mcp-bridge] Scene name: "${sceneData.name}"`);

      // Ensure "AI Generated Maps" folder exists and get its ID
      console.log(`[foundry-mcp-bridge] Ensuring AI Generated Maps folder exists...`);
      const folderId = await this.ensureAIMapsFolderExists();
      console.log(`[foundry-mcp-bridge] Folder ID:`, folderId);

      // Add folder to scene data
      if (folderId) {
        sceneData.folder = folderId;
        console.log(`[foundry-mcp-bridge] Added folder ID to scene data`);
      }

      // Create the scene using the complete payload from backend
      console.log(`[foundry-mcp-bridge] Attempting to create scene...`);
      const scene = await (globalThis as any).Scene.create(sceneData);
      console.log(`[foundry-mcp-bridge] Scene created successfully:`, scene);

      // CRITICAL: Foundry v13 bug workaround (like working mapgen system)
      if (!scene.img && sceneData.img) {
        await scene.update({
          img: sceneData.img,
          background: { src: sceneData.img },
        });
      }

      if (sceneData.walls && sceneData.walls.length > 0) {
        await this.createSceneWalls(scene, sceneData.walls);
      }

      ui.notifications?.info(`Scene "${sceneData.name}" created successfully!`);

      // Auto-activate the scene if enabled
      const autoActivate = true; // You might want to make this configurable
      if (autoActivate) {
        await scene.activate();
        ui.notifications?.info(`Switched to "${sceneData.name}" - Ready for token placement!`);
      }

      this.log(`Scene "${sceneData.name}" created and activated`);
    } catch (error) {
      this.log(
        `Failed to create scene from generated map: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      ui.notifications?.error(
        `Failed to create scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async createSceneWalls(scene: any, wallsData: any[]): Promise<void> {
    if (!wallsData || !Array.isArray(wallsData) || wallsData.length === 0) {
      this.log('No wall data provided');
      return;
    }

    try {
      this.log(`Creating ${wallsData.length} walls for scene ${scene.name}`);

      // Filter out walls with invalid coordinates
      const validWalls = wallsData.filter((wall: any) => {
        if (!wall.c || !Array.isArray(wall.c) || wall.c.length !== 4) {
          this.log(`Invalid wall coordinates: ${JSON.stringify(wall)}`);
          return false;
        }
        if (!wall.c.every((coord: any) => typeof coord === 'number' && !isNaN(coord))) {
          this.log(`Invalid coordinate values: ${JSON.stringify(wall.c)}`);
          return false;
        }
        return true;
      });

      this.log(`${validWalls.length} valid walls out of ${wallsData.length} total`);

      const wallDocuments = validWalls.map((wall: any) => ({
        c: wall.c, // Wall coordinates [x1, y1, x2, y2]
        move: wall.movement || 0,
        sense: wall.sight || 0,
        doorSound: '',
        dir: wall.direction || 0,
        door: wall.door || 0,
        ds: wall.doorState || 0,
        flags: wall.flags || {},
      }));

      if (wallDocuments.length > 0) {
        await scene.createEmbeddedDocuments('Wall', wallDocuments);
        ui.notifications?.info(`Created ${wallDocuments.length} walls in scene "${scene.name}"`);
      } else {
        this.log('No valid walls to create');
        ui.notifications?.warn('No valid walls could be created from detection data');
      }
    } catch (error) {
      this.log(
        `Failed to create walls: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      ui.notifications?.warn(
        `Some walls could not be created: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Ensure "AI Generated Maps" folder exists for organizing generated scenes
   */
  private async ensureAIMapsFolderExists(): Promise<string | null> {
    try {
      const folderName = 'AI Generated Maps';

      // Check if folder already exists
      const existingFolder = (globalThis as any).game.folders.find(
        (f: any) => f.type === 'Scene' && f.name === folderName
      );

      if (existingFolder) {
        this.log(`AI Generated Maps folder already exists with ID: ${existingFolder.id}`);
        return existingFolder.id;
      }

      // Create the folder
      this.log('Creating AI Generated Maps folder...');
      const folder = await (globalThis as any).Folder.create({
        name: folderName,
        type: 'Scene',
        description: 'Scenes created by AI Map Generation',
        color: '#4a90e2', // Nice blue color
        sorting: 'a', // Sort alphabetically
      });

      if (folder) {
        this.log(`Created AI Generated Maps folder with ID: ${folder.id}`);
        return folder.id;
      }

      this.log('Failed to create AI Generated Maps folder');
      return null;
    } catch (error) {
      this.log(
        `Error managing AI Generated Maps folder: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log(`Max reconnection attempts reached (${this.maxReconnectAttempts})`);
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    this.reconnectAttempts++;

    this.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    this.connectionState = CONNECTION_STATES.RECONNECTING;

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        // Connection failed, scheduleReconnect will be called again from connect()
      }
    }, delay);
  }

  private sendMessage(message: any): void {
    if (this.connectionState !== CONNECTION_STATES.CONNECTED) {
      this.log(`Cannot send message - not connected`);
      return;
    }

    try {
      if (this.activeConnectionType === 'webrtc' && this.webrtc) {
        this.webrtc.sendMessage(message);
      } else if (this.activeConnectionType === 'websocket' && this.ws) {
        this.ws.send(JSON.stringify(message));
      } else {
        this.log('No active connection to send message');
        return;
      }
      this.log(`Sent message via ${this.activeConnectionType}: ${message.type}`);
    } catch (error) {
      this.log(`Failed to send message: ${error}`);
    }
  }

  emitToServer(event: string, data?: any): void {
    this.sendMessage({
      type: event,
      data: data,
      timestamp: Date.now(),
    });
  }

  isConnected(): boolean {
    return this.connectionState === CONNECTION_STATES.CONNECTED;
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  getConnectionInfo(): any {
    return {
      type: this.activeConnectionType,
      state: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      config: {
        host: this.config.serverHost,
        port: this.config.serverPort,
        namespace: this.config.namespace,
      },
    };
  }

  private log(message: string): void {
    if (this.config.debugLogging) {
      console.log(`[${MODULE_ID}] Socket Bridge: ${message}`);
    }
  }
}
