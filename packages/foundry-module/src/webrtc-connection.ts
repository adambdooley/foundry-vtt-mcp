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
 * Uses WebRTC DataChannel for encrypted P2P connection without SSL certificates
 */
export class WebRTCConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private connectionState: string = CONNECTION_STATES.DISCONNECTED;
  private signalingWs: WebSocket | null = null;
  private messageHandler: ((message: any) => Promise<void>) | null = null;
  private onConnectedCallback: (() => void) | null = null;

  constructor(private config: WebRTCConfig) {}

  async connect(
    onMessage: (message: any) => Promise<void>,
    onConnected?: () => void
  ): Promise<void> {
    if (this.connectionState === CONNECTION_STATES.CONNECTED ||
        this.connectionState === CONNECTION_STATES.CONNECTING) {
      return;
    }

    this.connectionState = CONNECTION_STATES.CONNECTING;
    this.messageHandler = onMessage;
    this.onConnectedCallback = onConnected ?? null;
    this.log('Starting WebRTC connection...');

    try {
      // Step 1: Create WebRTC peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.stunServers.map(url => ({ urls: url }))
      });

      // Step 2: Create data channel
      this.dataChannel = this.peerConnection.createDataChannel('foundry-mcp', {
        ordered: true,
        maxRetransmits: 10
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

      // Close signaling WebSocket (no longer needed)
      if (this.signalingWs) {
        this.signalingWs.close();
        this.signalingWs = null;
      }

      if (this.onConnectedCallback) {
        this.onConnectedCallback();
      }
    };

    this.dataChannel.onclose = () => {
      this.log('WebRTC data channel closed');
      this.connectionState = CONNECTION_STATES.DISCONNECTED;
    };

    this.dataChannel.onerror = (error) => {
      this.log(`WebRTC data channel error: ${error}`);
    };

    this.dataChannel.onmessage = async (event) => {
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
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${this.config.serverHost}:${this.config.serverPort}${this.config.namespace}`;

      this.log(`Opening signaling WebSocket: ${wsUrl}`);
      this.signalingWs = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        this.signalingWs?.close();
        reject(new Error('Signaling timeout'));
      }, this.config.connectionTimeout * 1000);

      this.signalingWs.onopen = () => {
        this.log('Signaling WebSocket opened, sending WebRTC offer');
        this.signalingWs?.send(JSON.stringify({
          type: 'webrtc-offer',
          offer: offer
        }));
      };

      this.signalingWs.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'webrtc-answer') {
            this.log('Received WebRTC answer from server');
            clearTimeout(timeout);

            await this.peerConnection?.setRemoteDescription(
              new RTCSessionDescription(message.answer)
            );

            resolve();
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      };

      this.signalingWs.onerror = (error) => {
        clearTimeout(timeout);
        this.log(`Signaling WebSocket error: ${error}`);
        reject(new Error('Signaling failed'));
      };
    });
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

    if (this.signalingWs) {
      this.signalingWs.close();
      this.signalingWs = null;
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
      this.dataChannel.send(JSON.stringify(message));
      this.log(`Sent WebRTC message: ${message.type}`);
    } catch (error) {
      this.log(`Failed to send WebRTC message: ${error}`);
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
