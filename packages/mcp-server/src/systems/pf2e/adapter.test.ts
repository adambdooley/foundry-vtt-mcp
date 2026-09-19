import { describe, it, expect } from 'vitest';
import { PF2eAdapter } from './adapter.js';

describe('PF2eAdapter.extractCharacterStats languages', () => {
  const adapter = new PF2eAdapter();

  it('exposes known languages and free-text details', () => {
    const stats = adapter.extractCharacterStats({
      name: 'Ilvenna Voss',
      type: 'npc',
      system: {
        details: {
          languages: {
            value: ['taldane', 'shadowtongue', 'osiriani'],
            details: 'halting Osiriani',
          },
        },
      },
    });
    expect(stats.languages).toEqual({
      value: ['taldane', 'shadowtongue', 'osiriani'],
      details: 'halting Osiriani',
    });
  });

  it('omits languages when none are set', () => {
    const stats = adapter.extractCharacterStats({
      name: 'Mute',
      type: 'npc',
      system: { details: { languages: { value: [], details: '' } } },
    });
    expect(stats.languages).toBeUndefined();
  });

  it('applies to player characters, not just NPCs', () => {
    const stats = adapter.extractCharacterStats({
      name: 'Cyrus',
      type: 'character',
      system: { details: { languages: { value: ['taldane', 'necril'] } } },
    });
    expect(stats.languages).toEqual({ value: ['taldane', 'necril'] });
  });
});
