import { MODULE_ID, CONNECTION_STATES } from './constants.js';

export interface WebRTCConfig {
  serverHost: string;
  serverPort: number;
  namespace: string;
  stunServers: string[];
  connectionTimeout: number;
  debugLogging: boolean;
}

/**
 * WebRTC peer connection for browser-to-server communication
 * Uses HTTP POST for signaling (localhost exception allows HTTP from HTTPS)
 * Then establishes encrypted WebRTC DataChannel for P2P connection without SSL certificates
 */
export class WebRTCConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private connectionState: string = CONNECTION_STATES.DISCONNECTED;
  private messageHandler: ((message: any) => Promise<void>) | null = null;

  constructor(private config: WebRTCConfig) {}

  async connect(onMessage: (message: any) => Promise<void>): Promise<void> {
    if (
      this.connectionState === CONNECTION_STATES.CONNECTED ||
      this.connectionState === CONNECTION_STATES.CONNECTING
    ) {
      return;
    }

    this.connectionState = CONNECTION_STATES.CONNECTING;
    this.messageHandler = onMessage;
    this.log('Starting WebRTC connection...');

    try {
      // Step 1: Create WebRTC peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.stunServers.map(url => ({ urls: url })),
      });

      // Step 2: Create data channel
      this.dataChannel = this.peerConnection.createDataChannel('foundry-mcp', {
        ordered: true,
        maxRetransmits: 10,
      });

      this.setupDataChannelHandlers();
      this.setupPeerConnectionHandlers();

      // Step 3: Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Step 4: Wait for ICE gathering
      await this.waitForIceGathering();

      // Step 5: Send offer to server via signaling WebSocket
      await this.sendSignalingOffer(this.peerConnection.localDescription!);

      this.log('WebRTC connection initiated');
    } catch (error) {
      this.log(`WebRTC connection failed: ${error}`);
      this.connectionState = CONNECTION_STATES.DISCONNECTED;
      throw error;
    }
  }

  private setupDataChannelHandlers(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      this.log('WebRTC data channel opened');
      this.connectionState = CONNECTION_STATES.CONNECTED;
    };

    this.dataChannel.onclose = () => {
      this.log('WebRTC data channel closed');
      this.connectionState = CONNECTION_STATES.DISCONNECTED;
    };

    this.dataChannel.onerror = error => {
      this.log(`WebRTC data channel error: ${error}`);
    };

    this.dataChannel.onmessage = async event => {
      try {
        const message = JSON.parse(event.data);
        if (this.messageHandler) {
          await this.messageHandler(message);
        }
      } catch (error) {
        this.log(`Failed to parse WebRTC message: ${error}`);
      }
    };
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return;

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      this.log(`ICE connection state: ${state}`);

      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.connectionState = CONNECTION_STATES.DISCONNECTED;
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      this.log(`Peer connection state: ${state}`);
    };
  }

  private async waitForIceGathering(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('ICE gathering timeout'));
      }, this.config.connectionTimeout * 1000);

      if (this.peerConnection?.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve();
        return;
      }

      this.peerConnection!.onicegatheringstatechange = () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      };
    });
  }

  private async sendSignalingOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    // Use HTTP POST for signaling to dedicated WebRTC signaling port (31416)
    // For HTTPS pages, browsers allow HTTP POST to localhost (security exception)
    // The MCP server must be running on the same machine as the browser
    const isHttps = window.location.protocol === 'https:';
    const signalingHost = isHttps ? 'localhost' : this.config.serverHost;
    const protocol = 'http'; // Always http:// - localhost exception allows this from HTTPS
    const WEBRTC_SIGNALING_PORT = 31416; // Dedicated port for WebRTC signaling
    const httpUrl = `${protocol}://${signalingHost}:${WEBRTC_SIGNALING_PORT}/webrtc-offer`;

    this.log(`Sending WebRTC offer via HTTP POST: ${httpUrl} (HTTPS page: ${isHttps})`);

    try {
      const response = await fetch(httpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offer }),
        signal: AbortSignal.timeout(this.config.connectionTimeout * 1000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const { answer } = await response.json();

      if (!answer) {
        throw new Error('No answer received from server');
      }

      this.log('Received WebRTC answer from server via HTTP');
      await this.peerConnection?.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`Signaling via HTTP failed: ${errorMsg}`);
      throw error; // Re-throw original error instead of wrapping
    }
  }

  disconnect(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.log('WebRTC connection closed');
  }

  sendMessage(message: any): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.log('Cannot send message - data channel not open');
      return;
    }

    try {
      const json = JSON.stringify(message);
      const size = json.length;

      // WebRTC SCTP constants (keep in sync with server config.ts WEBRTC_CONSTANTS)
      const MAX_MESSAGE_SIZE = 65536; // 64KB - SCTP hard limit
      const CHUNK_SIZE = 50 * 1024; // 50KB - safe threshold for chunking

      if (size > CHUNK_SIZE) {
        // Split large message into chunks
        const totalChunks = Math.ceil(json.length / CHUNK_SIZE);
        const chunkId = `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        this.log(
          `Chunking large message: ${size} bytes → ${totalChunks} chunks (type: ${message.type})`
        );

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, json.length);
          const chunk = json.substring(start, end);

          const chunkMessage = {
            type: 'chunked-message',
            chunkId: chunkId,
            chunkIndex: i,
            totalChunks: totalChunks,
            chunk: chunk,
            originalType: message.type,
            originalId: message.id,
          };

          const chunkJson = JSON.stringify(chunkMessage);

          // Verify chunk doesn't exceed SCTP maxMessageSize (safety check)
          if (chunkJson.length > MAX_MESSAGE_SIZE) {
            throw new Error(
              `Chunk ${i + 1}/${totalChunks} size ${chunkJson.length} exceeds ` +
                `SCTP maxMessageSize of ${MAX_MESSAGE_SIZE} bytes. ` +
                `Original message may be too large to chunk safely.`
            );
          }

          this.dataChannel.send(chunkJson);
          this.log(`Sent chunk ${i + 1}/${totalChunks} (${chunkJson.length} bytes)`);
        }

        this.log(`Successfully sent all ${totalChunks} chunks for ${message.type}`);
      } else {
        // Send as single message
        this.dataChannel.send(json);
        this.log(`Sent WebRTC message: ${message.type} (${size} bytes)`);
      }
    } catch (error) {
      this.log(`Failed to send WebRTC message: ${error}`);
      throw error; // Re-throw so caller knows send failed
    }
  }

  isConnected(): boolean {
    return this.connectionState === CONNECTION_STATES.CONNECTED;
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  private log(message: string): void {
    if (this.config.debugLogging) {
      console.log(`[${MODULE_ID}] WebRTC: ${message}`);
    }
  }
}
