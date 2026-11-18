import { describe, expect, it, vi } from 'vitest';
import { CharacterTools } from './character.js';

function makeTools() {
  const logger: any = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  logger.child = () => logger;
  return new CharacterTools({ foundryClient: { query: vi.fn() } as any, logger });
}

const items = [
  { id: 'a', name: 'Pistols', type: 'skill', system: { rating: 5 } },
  { id: 'b', name: 'Rope', type: 'gear', system: { quantity: 2 } },
];

describe('CharacterTools.formatItems with adapter.formatItemDetails', () => {
  it('merges adapter-provided fields into each item', () => {
    const adapter: any = {
      formatItemDetails: (item: any) =>
        item.type === 'skill' ? { rating: item.system.rating } : {},
    };
    const out = (makeTools() as any).formatItems(items, adapter);
    expect(out[0]).toEqual({ id: 'a', name: 'Pistols', type: 'skill', rating: 5 });
    expect(out[1]).toEqual({ id: 'b', name: 'Rope', type: 'gear', quantity: 2 });
  });

  it('keeps the generic shape when the adapter has no hook', () => {
    const out = (makeTools() as any).formatItems(items, {});
    expect(out[0]).toEqual({ id: 'a', name: 'Pistols', type: 'skill' });
  });
});
