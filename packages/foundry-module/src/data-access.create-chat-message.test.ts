import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoundryDataAccess } from './data-access.js';

function setupFoundry(options: { polyglot?: boolean } = {}) {
  const scene: any = { id: 'scene-1', tokens: new Map() };

  // A placeable Token and its TokenDocument are different objects: only the
  // document has `.parent` (the scene), and only the placeable is drawn on the canvas.
  const tokenDoc: any = { id: 'tok-1', name: 'Wenet', parent: scene };
  const placeable: any = { id: 'tok-1', name: 'Wenet', document: tokenDoc };
  tokenDoc.object = placeable;

  const actor: any = {
    id: 'actor-1',
    name: 'Wenet',
    getActiveTokens: vi.fn(() => [placeable]),
  };
  tokenDoc.actor = actor;
  scene.tokens.set(tokenDoc.id, tokenDoc);

  const actors = Object.assign([actor], {
    get: (id: string) => (id === actor.id ? actor : undefined),
    getName: (name: string) => (name === actor.name ? actor : undefined),
  });

  const create = vi.fn(async (data: any) => ({ id: 'msg-1', ...data }));
  // Mirrors core's ChatMessage.#getSpeakerFromToken: the scene comes from `token.parent`,
  // which a placeable Token does not have.
  const getSpeaker = vi.fn(({ token, actor: speakingActor }: any) =>
    token
      ? { scene: token.parent?.id || null, token: token.id, alias: token.name }
      : { scene: null, actor: speakingActor?.id, alias: speakingActor?.name }
  );
  const broadcast = vi.fn().mockResolvedValue(undefined);
  const callAll = vi.fn();

  vi.stubGlobal('Hooks', { on: vi.fn(), callAll });
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'world-1' },
    user: { id: 'gm', name: 'Gamemaster' },
    actors,
    scenes: [scene],
    users: [
      { id: 'gm', name: 'Gamemaster' },
      { id: 'user-2', name: 'Catterick' },
    ],
    modules: {
      get: (id: string) => (id === 'polyglot' && options.polyglot ? { active: true } : undefined),
    },
  });
  vi.stubGlobal('canvas', { scene, hud: { bubbles: { broadcast } } });
  vi.stubGlobal('ChatMessage', { create, getSpeaker });
  vi.stubGlobal('CONST', { CHAT_MESSAGE_STYLES: { IC: 2 } });

  return {
    dataAccess: new FoundryDataAccess(),
    create,
    getSpeaker,
    broadcast,
    callAll,
    tokenDoc,
    placeable,
  };
}

describe('FoundryDataAccess.createChatMessage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gives a chat-log line a speaker on the current scene, so its bubble can render', async () => {
    const { dataAccess, create, getSpeaker, tokenDoc } = setupFoundry();

    await dataAccess.createChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Sit down.',
      chatLog: true,
    });

    // A placeable here yields scene: null, and core's sayBubble() then skips the bubble.
    expect(getSpeaker.mock.calls[0][0].token).toBe(tokenDoc);
    expect(create.mock.calls[0][0].speaker.scene).toBe('scene-1');
  });

  it('broadcasts a bubble over the placeable token by default, posting no message', async () => {
    const { dataAccess, create, broadcast, placeable } = setupFoundry();

    const result = await dataAccess.createChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Sit down.',
    });

    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast.mock.calls[0][0]).toBe(placeable);
    expect(create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, id: null, delivery: 'bubble' });
  });

  it('addresses one specific token by id', async () => {
    const { dataAccess, broadcast, placeable } = setupFoundry();

    await dataAccess.createChatMessage({ tokenId: 'tok-1', content: 'Mind the step.' });

    expect(broadcast.mock.calls[0][0]).toBe(placeable);
  });

  // Core draws a message's bubble only when it is created in the in-character mode, which
  // is what the chat box uses for a line typed as a token (ChatMessage#_preCreate sets
  // chatBubble from messageMode === "ic"; foundry.mjs v14). Polyglot then scrambles that
  // bubble from the message's own language flag.
  it('creates a chat-log line in character, so Foundry draws its bubble as for a typed line', async () => {
    const { dataAccess, create, broadcast } = setupFoundry();

    await dataAccess.createChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Short line.',
      chatLog: true,
    });

    expect(create.mock.calls[0][1]).toEqual({ messageMode: 'ic' });
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('creates a whisper outside the in-character mode, so no bubble shows it to the table', async () => {
    const { dataAccess, create } = setupFoundry();

    await dataAccess.createChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Come alone.',
      whisperTo: ['Catterick'],
    });

    expect(create.mock.calls[0][1]?.messageMode).toBeUndefined();
    expect(create.mock.calls[0][1]?.chatBubble).not.toBe(true);
  });

  it('broadcasts a bubble exactly as written, with no padding, so Foundry times it', async () => {
    const { dataAccess, broadcast } = setupFoundry();

    await dataAccess.createChatMessage({ actorIdentifier: 'Wenet', content: 'Mind the step.' });

    expect(broadcast.mock.calls[0][1]).toBe('Mind the step.');
  });

  it('whispers without a bubble, addressed to the resolved user', async () => {
    const { dataAccess, create, broadcast } = setupFoundry();

    const result = await dataAccess.createChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Come alone.',
      whisperTo: ['Catterick'],
    });

    expect(create.mock.calls[0][0].whisper).toEqual(['user-2']);
    expect(broadcast).not.toHaveBeenCalled();
    expect(result).toMatchObject({ delivery: 'whisper', whisperedTo: 1 });
  });

  it('refuses a whisper to nobody rather than posting it publicly', async () => {
    const { dataAccess, create, broadcast } = setupFoundry();

    await expect(
      dataAccess.createChatMessage({
        actorIdentifier: 'Wenet',
        content: 'Come alone.',
        whisperTo: ['NoSuchPlayer'],
      })
    ).rejects.toThrow(/No matching players/);
    expect(create).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("hands the language to Polyglot's bubble class when Polyglot is active", async () => {
    const { dataAccess, broadcast } = setupFoundry({ polyglot: true });

    const result = await dataAccess.createChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Not by me.',
      language: 'necril',
    });

    expect(broadcast.mock.calls[0][2]).toMatchObject({ language: 'necril' });
    expect(broadcast.mock.calls[0][1]).not.toContain('(in necril)');
    expect(result.polyglotApplied).toBe(true);
  });

  // Without Polyglot, Foundry has no notion of a spoken language, so the line plays as
  // written, the same as any other bubble; polyglotApplied tells the caller it wasn't used.
  it('plays the line unmarked when Polyglot is absent, as Foundry itself would', async () => {
    const { dataAccess, broadcast } = setupFoundry();

    const result = await dataAccess.createChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Not by me.',
      language: 'necril',
    });

    expect(broadcast.mock.calls[0][1]).toContain('Not by me.');
    expect(broadcast.mock.calls[0][1]).not.toContain('(in necril)');
    expect(broadcast.mock.calls[0][2].language).toBeUndefined();
    expect(result.polyglotApplied).toBe(false);
  });

  it('leaves a chat-log line unmarked when Polyglot is absent', async () => {
    const { dataAccess, create, broadcast } = setupFoundry();

    await dataAccess.createChatMessage({
      actorIdentifier: 'Wenet',
      content: 'Not by me.',
      language: 'necril',
      chatLog: true,
    });

    expect(create.mock.calls[0][0].content).toBe('Not by me.');
  });
});
