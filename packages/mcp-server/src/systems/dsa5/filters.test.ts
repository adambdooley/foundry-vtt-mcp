/**
 * DSA5 Filter Tests
 *
 * Simple tests to validate filter logic
 */

import {
  matchesDSA5Filters,
  describeDSA5Filters,
  isValidDSA5Species,
  isValidExperienceLevel,
} from './filters.js';
import type { DSA5Filters } from './filters.js';

// Test creature data
const testCreature = {
  id: 'test-goblin-1',
  name: 'Goblin Krieger',
  type: 'character',
  systemData: {
    level: 2,
    species: 'goblin',
    culture: 'Bergstamm',
    size: 'small',
    hasSpells: false,
    experiencePoints: 1200,
  },
};

const testSpellcaster = {
  id: 'test-magier-1',
  name: 'Elf Magier',
  type: 'character',
  systemData: {
    level: 5,
    species: 'elf',
    culture: 'Auelfen',
    size: 'medium',
    hasSpells: true,
    experiencePoints: 4000,
  },
};

console.log('=== DSA5 Filter Tests ===\n');

// Test 1: Level filter (exact)
console.log('Test 1: Level filter (exact)');
const filter1: DSA5Filters = { level: 2 };
console.log(`Filter: ${describeDSA5Filters(filter1)}`);
console.log(`Matches Goblin (Level 2): ${matchesDSA5Filters(testCreature, filter1)}`); // true
console.log(`Matches Magier (Level 5): ${matchesDSA5Filters(testSpellcaster, filter1)}`); // false
console.log('');

// Test 2: Level range filter
console.log('Test 2: Level range filter');
const filter2: DSA5Filters = { level: { min: 2, max: 5 } };
console.log(`Filter: ${describeDSA5Filters(filter2)}`);
console.log(`Matches Goblin (Level 2): ${matchesDSA5Filters(testCreature, filter2)}`); // true
console.log(`Matches Magier (Level 5): ${matchesDSA5Filters(testSpellcaster, filter2)}`); // true
console.log('');

// Test 3: Species filter
console.log('Test 3: Species filter');
const filter3: DSA5Filters = { species: 'goblin' };
console.log(`Filter: ${describeDSA5Filters(filter3)}`);
console.log(`Matches Goblin: ${matchesDSA5Filters(testCreature, filter3)}`); // true
console.log(`Matches Elf: ${matchesDSA5Filters(testSpellcaster, filter3)}`); // false
console.log('');

// Test 4: Has spells filter
console.log('Test 4: Has spells filter');
const filter4: DSA5Filters = { hasSpells: true };
console.log(`Filter: ${describeDSA5Filters(filter4)}`);
console.log(`Matches Goblin (no spells): ${matchesDSA5Filters(testCreature, filter4)}`); // false
console.log(`Matches Magier (has spells): ${matchesDSA5Filters(testSpellcaster, filter4)}`); // true
console.log('');

// Test 5: Combined filters
console.log('Test 5: Combined filters');
const filter5: DSA5Filters = {
  level: { min: 1, max: 3 },
  size: 'small',
  hasSpells: false,
};
console.log(`Filter: ${describeDSA5Filters(filter5)}`);
console.log(`Matches Goblin: ${matchesDSA5Filters(testCreature, filter5)}`); // true
console.log(`Matches Magier: ${matchesDSA5Filters(testSpellcaster, filter5)}`); // false
console.log('');

// Test 6: Experience points filter
console.log('Test 6: Experience points filter');
const filter6: DSA5Filters = { experiencePoints: { min: 1000, max: 2000 } };
console.log(`Filter: ${describeDSA5Filters(filter6)}`);
console.log(`Matches Goblin (1200 AP): ${matchesDSA5Filters(testCreature, filter6)}`); // true
console.log(`Matches Magier (4000 AP): ${matchesDSA5Filters(testSpellcaster, filter6)}`); // false
console.log('');

// Test 7: Validation helpers
console.log('Test 7: Validation helpers');
console.log(`isValidDSA5Species('goblin'): ${isValidDSA5Species('goblin')}`); // true
console.log(`isValidDSA5Species('unicorn'): ${isValidDSA5Species('unicorn')}`); // false
console.log(`isValidExperienceLevel(3): ${isValidExperienceLevel(3)}`); // true
console.log(`isValidExperienceLevel(0): ${isValidExperienceLevel(0)}`); // false
console.log(`isValidExperienceLevel(8): ${isValidExperienceLevel(8)}`); // false
console.log('');

console.log('=== All Tests Completed ===');
