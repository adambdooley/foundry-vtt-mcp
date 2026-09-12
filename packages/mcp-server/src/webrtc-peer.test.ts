/**
 * WebRTCPeer chunk-reassembly tests.
 *
 * Regression cover for #89: a large response is split into chunks, and if one of
 * them never arrives the waiting query used to hang until its own timeout with no
 * explanation. The peer now rejects that query itself by handing the connector the
 * `mcp-response` failure shape it already understands.
 *
 * `handleChunkedMessage` is private, so it's driven through a cast — these tests
 * exercise the real reassembly logic, no transport involved.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebRTCPeer } from './webrtc-peer.js';

function makePeer() {
  const logger: any = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  const onMessage = vi.fn(async () => {});
  const peer = new WebRTCPeer({
    config: {} as any,
    logger,
    onMessage,
  });
  return { peer, onMessage, logger };
}

function chunkOf(overrides: Record<string, unknown> = {}) {
  return {
    type: 'chunked-message',
    chunkId: 'chunk-test-1',
    chunkIndex: 0,
    totalChunks: 2,
    chunk: '{"partial":',
    originalType: 'mcp-response',
    originalId: 'query-42',
    ...overrides,
  };
}

const peers: WebRTCPeer[] = [];
function peer() {
  const made = makePeer();
  peers.push(made.peer);
  return made;
}
afterEach(() => {
  // disconnect() clears the chunk-cleanup interval, otherwise vitest hangs.
  peers.splice(0).forEach(p => p.disconnect());
  vi.restoreAllMocks();
});

describe('WebRTCPeer chunk reassembly', () => {
  it('delivers the reassembled message once every chunk arrives', async () => {
    const { peer: p, onMessage } = peer();
    const payload = JSON.stringify({ type: 'mcp-response', id: 'query-42', data: { ok: true } });
    const half = Math.ceil(payload.length / 2);

    await (p as any).handleChunkedMessage(
      chunkOf({ chunkIndex: 0, chunk: payload.slice(0, half) })
    );
    expect(onMessage).not.toHaveBeenCalled();

    await (p as any).handleChunkedMessage(chunkOf({ chunkIndex: 1, chunk: payload.slice(half) }));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0]).toMatchObject({
      type: 'mcp-response',
      id: 'query-42',
      data: { ok: true },
    });
  });

  it('rejects the waiting query when the reassembled payload is not valid JSON (#89)', async () => {
    const { peer: p, onMessage } = peer();

    await (p as any).handleChunkedMessage(chunkOf({ chunkIndex: 0, chunk: 'not json' }));
    await (p as any).handleChunkedMessage(chunkOf({ chunkIndex: 1, chunk: ' still not json' }));

    expect(onMessage).toHaveBeenCalledTimes(1);
    const failure = onMessage.mock.calls[0][0];
    expect(failure).toMatchObject({ type: 'mcp-response', id: 'query-42' });
    expect(failure.data.success).toBe(false);
    expect(failure.data.error).toMatch(/reassemble/i);
  });

  it('does not deliver or reject while chunks are still outstanding', async () => {
    const { peer: p, onMessage } = peer();

    await (p as any).handleChunkedMessage(chunkOf({ chunkIndex: 0, totalChunks: 3 }));

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores a chunk whose totalChunks disagrees with the set already in flight', async () => {
    const { peer: p, onMessage } = peer();

    await (p as any).handleChunkedMessage(chunkOf({ chunkIndex: 0, totalChunks: 2 }));
    await (p as any).handleChunkedMessage(chunkOf({ chunkIndex: 1, totalChunks: 5 }));

    expect(onMessage).not.toHaveBeenCalled();
  });
});
