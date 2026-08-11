import { describe, expect, it, vi } from 'vitest';
import { WebRTCPeer } from './webrtc-peer.js';

function createLogger() {
  const logger: any = {
    child: vi.fn(() => logger),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger;
}

function createBufferedAmountEvent() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return { unSubscribe: () => listeners.delete(listener) };
    },
    emit() {
      for (const listener of [...listeners]) listener();
    },
  };
}

describe('WebRTCPeer outbound transport', () => {
  it('serializes concurrent sends until Werift drains each message', async () => {
    const logger = createLogger();
    const peer = new WebRTCPeer({
      config: { stunServers: [] },
      logger,
      onMessage: vi.fn(),
    } as any);
    const bufferedAmountLow = createBufferedAmountEvent();
    const sent: string[] = [];
    let sendsInFlight = 0;
    let maxSendsInFlight = 0;

    const dataChannel: any = {
      readyState: 'open',
      bufferedAmount: 0,
      bufferedAmountLowThreshold: 0,
      bufferedAmountLow,
      send(payload: string) {
        sendsInFlight++;
        maxSendsInFlight = Math.max(maxSendsInFlight, sendsInFlight);
        sent.push(JSON.parse(payload).id);
        this.bufferedAmount += payload.length;

        setTimeout(() => {
          this.bufferedAmount = 0;
          sendsInFlight--;
          bufferedAmountLow.emit();
        }, 5);
      },
    };

    (peer as any).dataChannel = dataChannel;
    (peer as any).isConnected = true;

    await Promise.all([
      peer.sendMessage({ type: 'mcp-query', id: 'query-1' }),
      peer.sendMessage({ type: 'mcp-query', id: 'query-2' }),
      peer.sendMessage({ type: 'mcp-query', id: 'query-3' }),
      peer.sendMessage({ type: 'mcp-query', id: 'query-4' }),
    ]);

    expect(sent).toEqual(['query-1', 'query-2', 'query-3', 'query-4']);
    expect(maxSendsInFlight).toBe(1);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
