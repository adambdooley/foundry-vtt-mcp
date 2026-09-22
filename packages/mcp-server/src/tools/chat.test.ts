/**
 * create-chat-message tool tests.
 *
 * These cover the MCP tool layer: schema shape, validation, and forwarding to
 * the bridge query. Delivery itself (bubbles, chat-log lines, whispers, the
 * duration padding and Polyglot tagging) runs browser-side and is covered in
 * foundry-module/src/data-access.create-chat-message.test.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import { ChatTools } from './chat.js';

function makeTools(queryImpl?: (method: string, data: any) => unknown) {
  const query = vi.fn(queryImpl ?? (async () => ({ success: true, id: 'msg1' })));
  const logger: any = {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: () => logger,
  };
  const foundryClient: any = { query };
  const tools = new ChatTools({ foundryClient, logger });
  return { tools, query };
}

function definition() {
  const { tools } = makeTools();
  return tools.getToolDefinitions().find(d => d.name === 'create-chat-message')!;
}

describe('create-chat-message tool definition', () => {
  it('advertises the speaker, delivery, language, whisper and passthrough fields', () => {
    const props = definition().inputSchema.properties as Record<string, any>;
    expect(props.actorIdentifier).toBeDefined();
    expect(props.tokenId).toBeDefined();
    expect(props.content).toBeDefined();
    expect(props.language).toBeDefined();
    expect(props.chatLog).toBeDefined();
    expect(props.whisperTo).toBeDefined();
  });

  // Bubble timing is Foundry's own; a caller that needs more control uses a companion module.
  it('offers no bubble duration, leaving timing to Foundry', () => {
    const props = definition().inputSchema.properties as Record<string, any>;
    expect(props.bubbleDurationMs).toBeUndefined();
  });

  it('requires only content, since either identifier may name the speaker', () => {
    expect(definition().inputSchema.required).toEqual(['content']);
  });
});

describe('handleCreateChatMessage', () => {
  it('forwards every field to the bridge query untouched', async () => {
    const { tools, query } = makeTools();
    await tools.handleCreateChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Drink is the same either way.',
      language: 'common',
      chatLog: true,
    });

    expect(query).toHaveBeenCalledWith(
      'foundry-mcp-bridge.createChatMessage',
      expect.objectContaining({
        actorIdentifier: 'Wenet',
        content: 'Drink is the same either way.',
        language: 'common',
        chatLog: true,
      })
    );
  });

  it('forwards a token id, which is how duplicate tokens are told apart', async () => {
    const { tools, query } = makeTools();
    await tools.handleCreateChatMessage({ tokenId: 'tok_a1f', content: 'Snake eyes again.' });

    expect(query).toHaveBeenCalledWith(
      'foundry-mcp-bridge.createChatMessage',
      expect.objectContaining({ tokenId: 'tok_a1f' })
    );
  });

  it('forwards whisper targets', async () => {
    const { tools, query } = makeTools();
    await tools.handleCreateChatMessage({
      actorIdentifier: 'Sahreg the Dirge Screamer',
      content: 'Ask Wenet for the funeral director.',
      whisperTo: ['Refrain'],
    });

    expect(query).toHaveBeenCalledWith(
      'foundry-mcp-bridge.createChatMessage',
      expect.objectContaining({ whisperTo: ['Refrain'] })
    );
  });

  it('returns whatever the bridge returned', async () => {
    const ack = { success: true, id: 'msg9', delivery: 'bubble' };
    const { tools } = makeTools(async () => ack);
    await expect(
      tools.handleCreateChatMessage({ tokenId: 'tok_a1f', content: 'x' })
    ).resolves.toEqual(ack);
  });

  it('rejects a call naming no speaker', async () => {
    const { tools, query } = makeTools();
    await expect(tools.handleCreateChatMessage({ content: 'x' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects empty content', async () => {
    const { tools, query } = makeTools();
    await expect(
      tools.handleCreateChatMessage({ actorIdentifier: 'Wenet', content: '' })
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('wraps a bridge failure with the speaker that failed', async () => {
    const { tools } = makeTools(async () => {
      throw new Error('no token on scene');
    });
    await expect(
      tools.handleCreateChatMessage({ actorIdentifier: 'Wenet', content: 'x' })
    ).rejects.toThrow(/Wenet.*no token on scene/);
  });
});
