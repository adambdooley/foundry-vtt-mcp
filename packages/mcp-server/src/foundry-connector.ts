import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { Logger } from './logger.js';
import { Config } from './config.js';
import { WebRTCPeer } from './webrtc-peer.js';

export interface FoundryConnectorOptions {
  config: Config['foundry'];
  logger: Logger;
}

interface PendingQuery {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class FoundryConnector {
  private wss: WebSocketServer | null = null;
  private httpServer: any;
  private logger: Logger;
  private config: Config['foundry'];
  private isStarted = false;
  private foundrySocket: WebSocket | null = null;
  private webrtcPeer: WebRTCPeer | null = null;
  private activeConnectionType: 'websocket' | 'webrtc' | null = null;
  private pendingQueries = new Map<string, PendingQuery>();
  private queryIdCounter = 0;

  constructor({ config, logger }: FoundryConnectorOptions) {
    this.config = config;
    this.logger = logger.child({ component: 'FoundryConnector' });
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      this.logger.debug('Foundry connector already started');
      return;
    }

    this.logger.info('Starting Foundry connector WebSocket server', {
      port: this.config.port,
      protocol: this.config.protocol || 'ws',
      remoteMode: this.config.remoteMode || false
    });

    // Create HTTP server for WebSocket upgrade
    this.httpServer = createServer();

    // Create WebSocket server
    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: this.config.namespace || '/'
    });

    // Handle WebSocket connections (both signaling and direct WebSocket)
    this.wss.on('connection', (ws) => {
      this.logger.info('Client connected via WebSocket');

      // Optimistically treat as direct WebSocket connection until we receive a WebRTC offer.
      this.foundrySocket = ws;
      this.activeConnectionType = 'websocket';

      ws.on('close', () => {
        this.logger.info('Client disconnected');
        if (this.activeConnectionType === 'websocket' && this.foundrySocket === ws) {
          this.foundrySocket = null;
          this.activeConnectionType = null;
          // Reject all pending queries
          this.pendingQueries.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(new Error('Connection closed'));
          });
          this.pendingQueries.clear();
        }
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());

          // Check if this is WebRTC signaling
          if (message.type === 'webrtc-offer') {
            if (this.foundrySocket === ws) {
              // Revert optimistic WebSocket assignment when switching to WebRTC mode
              this.foundrySocket = null;
              this.activeConnectionType = null;
            }
            await this.handleWebRTCOffer(message.offer, ws);
          } else {
            // Regular WebSocket message
            if (!this.foundrySocket) {
              this.foundrySocket = ws;
              this.activeConnectionType = 'websocket';
              this.logger.info('Foundry module connected via WebSocket (direct)');
            }
            await this.handleMessage(message);
          }
        } catch (error) {
          this.logger.error('Failed to parse message', error);
        }
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket error', error);
      });
    });

    // Start the HTTP server
    await new Promise<void>((resolve, reject) => {
      this.httpServer.listen(this.config.port, () => {
        this.isStarted = true;
        this.logger.info('Foundry connector listening', { port: this.config.port });
        resolve();
      });

      this.httpServer.on('error', (error: Error) => {
        this.logger.error('Failed to start Foundry connector', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info('Stopping Foundry connector...');

    // Reject all pending queries
    this.pendingQueries.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Server shutting down'));
    });
    this.pendingQueries.clear();

    if (this.foundrySocket) {
      this.foundrySocket.close();
      this.foundrySocket = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => {
          resolve();
        });
      });
      this.httpServer = null;
    }

    this.isStarted = false;
    this.logger.info('Foundry connector stopped');
  }

  private async handleMessage(message: any): Promise<void> {
    if (message.type === 'mcp-response' && message.id) {
      const pending = this.pendingQueries.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingQueries.delete(message.id);

        if (message.data.success) {
          this.logger.debug('Query response received', { id: message.id, hasData: !!message.data.data });
          pending.resolve(message.data.data);
        } else {
          this.logger.error('Query failed', { id: message.id, error: message.data.error });
          pending.reject(new Error(message.data.error || 'Query failed'));
        }
      }
      return;
    }

    if (message.type === 'pong') {
      const pending = this.pendingQueries.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingQueries.delete(message.id);
        pending.resolve(message.data);
      }
      return;
    }

    if (message.type === 'bridge-ready') {
      const { userId, userName, worldId, worldName } = message.data || {};
      this.logger.info('Foundry module ready', {
        userId,
        userName,
        worldId,
        worldName
      });
      return;
    }

    const comfyHandlers = (globalThis as any).backendComfyUIHandlers;
    if (comfyHandlers?.handleMessage) {
      this.logger.debug('Routing message to backend ComfyUI handlers', { type: message.type });
      try {
        await comfyHandlers.handleMessage(message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to forward message to backendComfyUIHandlers', {
          type: message.type,
          error: errorMessage
        });
      }
      return;
    }

    this.logger.debug('Received unknown message type', { type: message.type });
  }

  private async handleWebRTCOffer(offer: any, signalingWs: WebSocket): Promise<void> {
    try {
      this.logger.info('Handling WebRTC offer for signaling');

      // Create WebRTC peer
      this.webrtcPeer = new WebRTCPeer({
        config: this.config.webrtc,
        logger: this.logger,
        onMessage: this.handleMessage.bind(this)
      });

      // Handle offer and get answer
      const answer = await this.webrtcPeer.handleOffer(offer);

      // Send answer back via signaling WebSocket
      signalingWs.send(JSON.stringify({
        type: 'webrtc-answer',
        answer: answer
      }));

      this.activeConnectionType = 'webrtc';
      this.logger.info('WebRTC connection established');

      // Close signaling WebSocket after handshake
      setTimeout(() => {
        signalingWs.close();
      }, 1000);

    } catch (error) {
      this.logger.error('Failed to handle WebRTC offer', error);
      signalingWs.send(JSON.stringify({
        type: 'webrtc-error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  async query(method: string, data?: any): Promise<any> {
    if (!this.foundrySocket || this.foundrySocket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Foundry VTT module');
    }

    const queryId = `query-${++this.queryIdCounter}`;
    this.logger.debug('Sending query to Foundry', { method, data, queryId });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error(`Query timeout: ${method}`));
      }, 10000); // 10 second timeout

      this.pendingQueries.set(queryId, { resolve, reject, timeout });

      const message = {
        type: 'mcp-query',
        id: queryId,
        data: { method, data }
      };

      this.foundrySocket!.send(JSON.stringify(message));
    });
  }

  sendToFoundry(message: any): void {
    if (this.activeConnectionType === 'webrtc' && this.webrtcPeer) {
      this.webrtcPeer.sendMessage(message);
    } else if (this.activeConnectionType === 'websocket' && this.foundrySocket && this.foundrySocket.readyState === WebSocket.OPEN) {
      this.foundrySocket.send(JSON.stringify(message));
    } else {
      throw new Error('Not connected to Foundry VTT module');
    }
  }

  isConnected(): boolean {
    if (!this.isStarted) return false;

    if (this.activeConnectionType === 'webrtc') {
      return this.webrtcPeer !== null && this.webrtcPeer.getIsConnected();
    } else if (this.activeConnectionType === 'websocket') {
      return this.foundrySocket !== null && this.foundrySocket.readyState === WebSocket.OPEN;
    }

    return false;
  }

  getConnectionInfo(): any {
    return {
      started: this.isStarted,
      connected: this.isConnected(),
      readyState: this.foundrySocket?.readyState || 'CLOSED',
      config: {
        port: this.config.port,
        namespace: this.config.namespace
      }
    };
  }

  /**
   * Send a message to the connected Foundry module
   */
  sendMessage(message: any): void {
    if (!this.foundrySocket || this.foundrySocket.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Foundry VTT module');
    }

    try {
      this.foundrySocket.send(JSON.stringify(message));
      this.logger.debug('Sent message to Foundry module', { type: message.type });
    } catch (error) {
      this.logger.error('Failed to send message to Foundry module', error);
      throw error;
    }
  }

  /**
   * Broadcast a message to all connected Foundry clients (alias for sendMessage for single connection)
   */
  broadcastMessage(message: any): void {
    this.sendMessage(message);
  }
}
