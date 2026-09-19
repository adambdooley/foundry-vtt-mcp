import { describe, it, expect } from 'vitest';
import { PF2eAdapter } from './adapter.js';

// Fixtures mirror the shape Foundry sends for PF2e actors:
// system.details.languages = { value: <language slugs>, details: <free text> }.
// PF2e stores the world's "Common" language under the slug `common`.
describe('PF2eAdapter.extractCharacterStats languages', () => {
  const adapter = new PF2eAdapter();

  it('exposes known languages and free-text details', () => {
    const stats = adapter.extractCharacterStats({
      name: 'Test NPC',
      type: 'npc',
      system: {
        details: {
          level: { value: 3 },
          languages: {
            value: ['common', 'draconic'],
            details: 'telepathy 100 feet',
          },
        },
      },
    });
    expect(stats.level).toBe(3);
    expect(stats.languages).toEqual({
      value: ['common', 'draconic'],
      details: 'telepathy 100 feet',
    });
  });

  it('omits languages when none are set', () => {
    const stats = adapter.extractCharacterStats({
      name: 'Test NPC',
      type: 'npc',
      system: { details: { languages: { value: [], details: '' } } },
    });
    expect(stats.languages).toBeUndefined();
  });

  it('applies to player characters, not just NPCs', () => {
    const stats = adapter.extractCharacterStats({
      name: 'Test Character',
      type: 'character',
      system: { details: { languages: { value: ['common', 'elven'] } } },
    });
    expect(stats.languages).toEqual({ value: ['common', 'elven'] });
  });
});
