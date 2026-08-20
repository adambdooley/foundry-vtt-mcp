/**
 * DSA5 System Adapter
 *
 * Implements SystemAdapter interface for DSA5 (Das Schwarze Auge 5) support.
 * Handles creature indexing, filtering, formatting, and data extraction.
 */

import type {
  SystemAdapter,
  SystemMetadata,
  SystemCreatureIndex,
  DSA5CreatureIndex,
} from '../types.js';
import {
  DSA5FiltersSchema,
  matchesDSA5Filters,
  describeDSA5Filters,
  type DSA5Filters,
} from './filters.js';
import { FIELD_PATHS, getExperienceLevel, EIGENSCHAFT_NAMES } from './constants.js';

/**
 * DSA5 system adapter
 */
export class DSA5Adapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'dsa5',
      name: 'dsa5',
      displayName: 'Das Schwarze Auge 5',
      version: '1.0.0',
      description:
        'Support for DSA5 (Das Schwarze Auge 5. Edition) with Eigenschaften, Talente, Erfahrungsgrade, and LeP/AsP/KaP resources',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true, // Uses Experience Level (Erfahrungsgrad 1-7)
      },
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'dsa5';
  }

  /**
   * Extract creature data from Foundry document for indexing
   * This is called by the index builder in Foundry's browser context
   */
  extractCreatureData(
    doc: any,
    pack: any
  ): { creature: SystemCreatureIndex; errors: number } | null {
    // Implementation is in index-builder.ts since it runs in browser
    // This method is here for type compliance but delegates to IndexBuilder
    throw new Error('extractCreatureData should be called from DSA5IndexBuilder, not the adapter');
  }

  getFilterSchema() {
    return DSA5FiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, any>): boolean {
    // Validate filters match DSA5 schema
    const validated = DSA5FiltersSchema.safeParse(filters);
    if (!validated.success) {
      return false;
    }

    return matchesDSA5Filters(creature, validated.data as DSA5Filters);
  }

  getDataPaths(): Record<string, string | null> {
    return {
      // DSA5 specific paths
      level: FIELD_PATHS.DETAILS_EXPERIENCE_TOTAL, // Level is calculated from AP
      species: FIELD_PATHS.DETAILS_SPECIES,
      culture: FIELD_PATHS.DETAILS_CULTURE,
      profession: FIELD_PATHS.DETAILS_CAREER, // IMPORTANT: 'career' not 'profession'
      size: FIELD_PATHS.STATUS_SIZE,

      // Characteristics (Eigenschaften)
      characteristics: FIELD_PATHS.CHARACTERISTICS,
      mu: FIELD_PATHS.CHAR_MU,
      kl: FIELD_PATHS.CHAR_KL,
      in: FIELD_PATHS.CHAR_IN,
      ch: FIELD_PATHS.CHAR_CH,
      ff: FIELD_PATHS.CHAR_FF,
      ge: FIELD_PATHS.CHAR_GE,
      ko: FIELD_PATHS.CHAR_KO,
      kk: FIELD_PATHS.CHAR_KK,

      // Status values
      wounds: FIELD_PATHS.STATUS_WOUNDS,
      lifePoints: FIELD_PATHS.STATUS_WOUNDS_CURRENT, // wounds.current has actual LeP
      astralenergy: FIELD_PATHS.STATUS_ASTRAL,
      karmaenergy: FIELD_PATHS.STATUS_KARMA,
      speed: FIELD_PATHS.STATUS_SPEED,
      initiative: FIELD_PATHS.STATUS_INITIATIVE,
      dodge: FIELD_PATHS.STATUS_DODGE,
      armor: FIELD_PATHS.STATUS_ARMOR,

      // Tradition
      tradition: FIELD_PATHS.TRADITION,

      // D&D5e-specific paths don't exist in DSA5
      challengeRating: null,
      creatureType: null,
      alignment: null,
      hitPoints: null,
      armorClass: null,
      legendaryActions: null,
      legendaryResistances: null,

      // PF2e-specific paths don't exist in DSA5
      perception: null,
      saves: null,
      rarity: null,
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): any {
    const dsa5Creature = creature as DSA5CreatureIndex;
    const formatted: any = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel,
      },
    };

    // Add DSA5 specific stats
    if (dsa5Creature.systemData) {
      const stats: any = {};

      if (dsa5Creature.systemData.level !== undefined) {
        stats.level = dsa5Creature.systemData.level;

        // Add experience level name (e.g., "Erfahren")
        const expLevel = getExperienceLevel(dsa5Creature.systemData.experiencePoints ?? 0);
        stats.experienceLevel = expLevel.name;
      }

      if (dsa5Creature.systemData.species) {
        stats.species = dsa5Creature.systemData.species;
      }

      if (dsa5Creature.systemData.culture) {
        stats.culture = dsa5Creature.systemData.culture;
      }

      if (dsa5Creature.systemData.size) {
        stats.size = dsa5Creature.systemData.size;
      }

      if (dsa5Creature.systemData.lifePoints) {
        stats.lifePoints = dsa5Creature.systemData.lifePoints;
      }

      if (dsa5Creature.systemData.meleeDefense) {
        stats.meleeDefense = dsa5Creature.systemData.meleeDefense;
      }

      if (dsa5Creature.systemData.hasSpells) {
        stats.spellcaster = true;
      }

      if (Object.keys(stats).length > 0) {
        formatted.stats = stats;
      }
    }

    if (creature.img) {
      formatted.hasImage = true;
    }

    return formatted;
  }

  formatCreatureForDetails(creature: SystemCreatureIndex): any {
    const dsa5Creature = creature as DSA5CreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    // Add additional details
    if (dsa5Creature.systemData) {
      const expLevel = getExperienceLevel(dsa5Creature.systemData.experiencePoints ?? 0);

      formatted.detailedStats = {
        level: dsa5Creature.systemData.level,
        experienceLevel: {
          name: expLevel.name,
          nameEn: expLevel.nameEn,
          level: expLevel.level,
          apRange: `${expLevel.min}-${expLevel.max === Infinity ? '∞' : expLevel.max}`,
        },
        experiencePoints: dsa5Creature.systemData.experiencePoints,
        species: dsa5Creature.systemData.species,
        culture: dsa5Creature.systemData.culture,
        profession: dsa5Creature.systemData.profession,
        size: dsa5Creature.systemData.size,
        lifePoints: dsa5Creature.systemData.lifePoints,
        meleeDefense: dsa5Creature.systemData.meleeDefense,
        rangedDefense: dsa5Creature.systemData.rangedDefense,
        armor: dsa5Creature.systemData.armor,
        hasSpells: dsa5Creature.systemData.hasSpells,
        hasAstralEnergy: dsa5Creature.systemData.hasAstralEnergy,
        hasKarmaEnergy: dsa5Creature.systemData.hasKarmaEnergy,
        traits: dsa5Creature.systemData.traits || [],
        rarity: dsa5Creature.systemData.rarity,
      };
    }

    if (creature.img) {
      formatted.img = creature.img;
    }

    return formatted;
  }

  describeFilters(filters: Record<string, any>): string {
    const validated = DSA5FiltersSchema.safeParse(filters);
    if (!validated.success) {
      return 'ungültige Filter';
    }

    return describeDSA5Filters(validated.data as DSA5Filters);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const dsa5Creature = creature as DSA5CreatureIndex;

    // DSA5: Use Experience Level (Erfahrungsgrad 1-7)
    if (dsa5Creature.systemData?.level !== undefined) {
      return dsa5Creature.systemData.level;
    }

    return undefined;
  }

  /**
   * Extract character statistics from actor data
   */
  extractCharacterStats(actorData: any): any {
    const system = actorData.system || {};
    const stats: any = {};

    // Basic info
    stats.name = actorData.name;
    stats.type = actorData.type;

    // Experience and Level
    const totalAP = system.details?.experience?.total ?? 0;
    const spentAP = system.details?.experience?.spent ?? 0;

    if (totalAP > 0) {
      const expLevel = getExperienceLevel(totalAP);
      stats.experience = {
        total: totalAP,
        spent: spentAP,
        available: totalAP - spentAP,
        level: expLevel.level,
        levelName: expLevel.name,
        levelNameEn: expLevel.nameEn,
      };
    }

    // LeP (Lebensenergie) - wounds.current contains actual current LeP
    const wounds = system.status?.wounds;
    if (wounds) {
      stats.lifePoints = {
        current: wounds.current ?? 0,
        max: wounds.max ?? 0,
      };
    }

    // AsP (Astralenergie)
    const astral = system.status?.astralenergy;
    if (astral && astral.max > 0) {
      stats.astralEnergy = {
        current: astral.value ?? 0,
        max: astral.max ?? 0,
      };
    }

    // KaP (Karmaenergie)
    const karma = system.status?.karmaenergy;
    if (karma && karma.max > 0) {
      stats.karmaEnergy = {
        current: karma.value ?? 0,
        max: karma.max ?? 0,
      };
    }

    // Eigenschaften (Characteristics: MU, KL, IN, CH, FF, GE, KO, KK)
    if (system.characteristics) {
      stats.characteristics = {};
      for (const [key, eigenschaft] of Object.entries(system.characteristics)) {
        const eigenschaftData = eigenschaft as any;
        const upperKey = key.toUpperCase();
        stats.characteristics[upperKey] = {
          value: eigenschaftData.value ?? 8,
          initial: eigenschaftData.initial ?? 8,
          name: EIGENSCHAFT_NAMES[upperKey]?.german,
          nameEn: EIGENSCHAFT_NAMES[upperKey]?.english,
        };
      }
    }

    // Combat values
    const initiative = system.status?.initiative?.value ?? system.status?.initiative;
    if (initiative !== undefined) {
      stats.initiative = initiative;
    }

    const speed = system.status?.speed?.value ?? system.status?.speed;
    if (speed !== undefined) {
      stats.speed = speed;
    }

    const dodge = system.status?.dodge?.value ?? system.status?.dodge;
    if (dodge !== undefined) {
      stats.dodge = dodge;
    }

    const armor = system.status?.armour?.value ?? system.status?.armor?.value ?? 0;
    if (armor) {
      stats.armor = armor;
    }

    // Identity info
    if (system.details) {
      const identity: any = {};

      const species = system.details.species?.value;
      if (species) {
        identity.species = species;
      }

      const culture = system.details.culture?.value;
      if (culture) {
        identity.culture = culture;
      }

      const career = system.details.career?.value;
      if (career) {
        identity.profession = career;
      }

      if (Object.keys(identity).length > 0) {
        stats.identity = identity;
      }
    }

    // Size
    const size = system.status?.size?.value;
    if (size) {
      stats.size = size;
    }

    // Tradition (magical/clerical)
    if (system.tradition) {
      const tradition: any = {};

      if (system.tradition.magical) {
        tradition.magical = system.tradition.magical;
      }

      if (system.tradition.clerical) {
        tradition.clerical = system.tradition.clerical;
      }

      if (Object.keys(tradition).length > 0) {
        stats.tradition = tradition;
      }
    }

    // Spellcasting detection
    const hasSpells = !!(astral?.max || karma?.max || system.tradition);
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        hasAstralEnergy: !!astral?.max,
        hasKarmaEnergy: !!karma?.max,
      };
    }

    return stats;
  }

  describeActorSchema(): string {
    return [
      '=== DSA5 Actor Schema Reference ===',
      '',
      'ACTOR TYPES: character, npc, creature',
      '',
      'EIGENSCHAFTEN (characteristics) — system.characteristics:',
      '  Shorthand: { MU:13, KL:12, IN:14, CH:11, FF:10, GE:11, KO:12, KK:13 }',
      '    (uppercase or lowercase; naked number → {value, initial}, or {value, initial, advances?})',
      '  Full:      { mu:{initial:13,value:13}, kl:{initial:12,value:12}, ... }',
      '  Keys: mu, kl, in, ch, ff, ge, ko, kk  (value is derived; writing `initial` suffices)',
      '',
      'LEBENSKRAFT / ENERGIE (status) — system.status:',
      '  LeP:  { lifePoints:{current, max} } or {status:{lifePoints:{...}}} → status.wounds.{current,max}',
      '  AsP:  { astralenergy:{current,max} } or {status:{astralenergy:{...}}} → status.astralenergy',
      '  KaP:  { karmaenergy:{current,max} } or {status:{karmaenergy:{...}}} → status.karmaenergy',
      '  Note: status.wounds.max is derived at runtime (initial + KO×2 + advances); a hard max may be overwritten.',
      '',
      'DETAILS (identity / details) — system.details:',
      '  species/culture/career accept a string or {value}: { species:"Mensch", culture:"Mittelreich", profession:"Krieger" }',
      '  `profession` → details.career.value; `identity.*` → details.*; experience.{total,spent,available}',
      '',
      'KAMPF / STATUS (optional shorthands) —',
      '  initiative, speed, dodge, size, armour|armor → status.<key>.value  (size:string → {value}, armour→armour)',
      '  tradition → system.tradition (object passed through)',
      '',
      'ACTOR TYPES: character (Held), npc (NSC), creature (Tier/Kreatur).',
      'ITEMS: advantage, disadvantage, combatskill, talent, spell, liturgy, equipment, weapon, armor, etc.',
    ].join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // normalizePayload – map caller-friendly DSA5 shorthands onto the real
  // Foundry DSA5 system paths before the payload is sent to the server.
  // Receives ONLY the `system` sub-object and returns a normalised `system`
  // object.  Unknown keys are left untouched.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Valid Eigenschaft keys in lowercase (the canonical Foundry form).
   */
  private static readonly EIGENSCHAFT_KEYS = [
    'mu',
    'kl',
    'in',
    'ch',
    'ff',
    'ge',
    'ko',
    'kk',
  ] as const;

  /**
   * Normalise a single Eigenschaft entry to {value, initial?, advances?}.
   * Accepts:
   *   - naked number  →  { value: n, initial: n }
   *   - { value, initial?, advances? }
   * If `value` is missing but `advances` is present, value = (initial ?? 8) + advances.
   * `value` is ALWAYS set after normalisation.
   */
  private normalizeEigenschaft(raw: any): { value: number; initial?: number; advances?: number } {
    if (typeof raw === 'number') {
      return { value: raw, initial: raw };
    }
    if (raw && typeof raw === 'object') {
      const result: any = {};
      const initial = raw.initial ?? 8;
      if (raw.value !== undefined) {
        result.value = raw.value;
      } else if (raw.advances !== undefined) {
        result.value = initial + raw.advances;
      } else {
        result.value = initial;
      }
      if (raw.initial !== undefined) result.initial = raw.initial;
      if (raw.advances !== undefined) result.advances = raw.advances;
      return result;
    }
    // Fallback
    return { value: 8, initial: 8 };
  }

  /**
   * Helper: normalise a resource block (LeP/AsP/KaP/fatePoints).
   * Accepts {current, max}, {value, max}, or a naked number.
   * Returns a minimal {value, max} object (or {current, max} for wounds).
   */
  private normalizeResource(
    raw: any,
    opts?: { useCurrent?: boolean }
  ): Record<string, number> | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'number') {
      return { value: raw, max: raw };
    }
    if (typeof raw === 'object') {
      const result: any = {};
      const current = raw.current ?? raw.value;
      if (current !== undefined) {
        result[opts?.useCurrent ? 'current' : 'value'] = current;
      }
      if (raw.max !== undefined) result.max = raw.max;
      if (raw.initial !== undefined) result.initial = raw.initial;
      return result;
    }
    return undefined;
  }

  /**
   * Helper: normalise a detail field that may arrive as a string or {value}.
   * Always returns {value: string}.
   */
  private normalizeDetail(raw: any): { value: string } | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'string') return { value: raw };
    if (typeof raw === 'object' && raw.value !== undefined) {
      return { value: String(raw.value) };
    }
    return undefined;
  }

  /**
   * Deep-merge helper: copy values from `src` into `dst` for keys that exist
   * in `src`, creating intermediate objects as needed.  Does not overwrite
   * keys that already exist in `dst` with higher priority — src wins for
   * keys it explicitly provides.
   */
  private static mergeInto(dst: Record<string, any>, src: Record<string, any> | undefined): void {
    if (!src) return;
    for (const [key, val] of Object.entries(src)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (typeof dst[key] !== 'object' || dst[key] === null || Array.isArray(dst[key])) {
          dst[key] = {};
        }
        DSA5Adapter.mergeInto(dst[key], val);
      } else {
        dst[key] = val;
      }
    }
  }

  normalizePayload(system: Record<string, any>): Record<string, any> {
    // Work on the caller's object but only add/overwrite normalised paths.
    // We collect changes in a separate object and merge at the end to avoid
    // intermediate corruption.
    const out: Record<string, any> = {};

    // ── 1. Eigenschaften (characteristics) ──────────────────────────────
    // Accept MU/KL/... (uppercase) or mu/kl/... (lowercase) keys, each as
    // a naked number or {value, initial?, advances?}.
    const charSource = system.characteristics ?? system.eigenschaften;
    if (charSource && typeof charSource === 'object') {
      const normalized: Record<string, any> = {};
      for (const [key, raw] of Object.entries(charSource)) {
        const lower = key.toLowerCase();
        if (DSA5Adapter.EIGENSCHAFT_KEYS.includes(lower as any)) {
          normalized[lower] = this.normalizeEigenschaft(raw);
        }
      }
      if (Object.keys(normalized).length > 0) {
        out.characteristics = normalized;
      }
    }

    // ── 2. LeP (wounds / lifePoints) ────────────────────────────────────
    // If system.status.wounds already exists, leave it untouched.
    // Otherwise map from system.lifePoints or system.status.lifePoints.
    const existingWounds = system.status?.wounds;
    if (!existingWounds) {
      const lp = system.lifePoints ?? system.status?.lifePoints;
      const lpNormalized = this.normalizeResource(lp, { useCurrent: true });
      if (lpNormalized) {
        // Fallback: if max missing, derive from KO
        if (lpNormalized.max === undefined) {
          const koVal =
            out.characteristics?.ko?.value ??
            system.characteristics?.ko?.value ??
            system.characteristics?.KO?.value ??
            8;
          const initial = (lpNormalized as any).initial ?? 8;
          lpNormalized.max = initial + koVal * 2;
        }
        out.status = out.status ?? {};
        out.status.wounds = lpNormalized;
      }
    }

    // ── 3. AsP / KaP / fatePoints ───────────────────────────────────────
    const asp = system.astralEnergy ?? system.status?.astralEnergy ?? system.status?.astralenergy;
    const aspNorm = this.normalizeResource(asp);
    if (aspNorm) {
      out.status = out.status ?? {};
      out.status.astralenergy = aspNorm;
    }

    const kap = system.karmaEnergy ?? system.status?.karmaEnergy ?? system.status?.karmaenergy;
    const kapNorm = this.normalizeResource(kap);
    if (kapNorm) {
      out.status = out.status ?? {};
      out.status.karmaenergy = kapNorm;
    }

    const fate = system.fatePoints ?? system.status?.fatePoints;
    const fateNorm = this.normalizeResource(fate);
    if (fateNorm) {
      out.status = out.status ?? {};
      out.status.fatePoints = fateNorm;
    }

    // ── 4. Details (species / culture / career / socialstate / experience) ─
    const details: Record<string, any> = {};

    // Direct system.details.* (may already be correct or use string shorthand)
    const srcDetails = system.details;
    const species = this.normalizeDetail(srcDetails?.species ?? system.species);
    if (species) details.species = species;

    const culture = this.normalizeDetail(srcDetails?.culture ?? system.culture);
    if (culture) details.culture = culture;

    // career — accept career, profession, or identity.profession
    const career = this.normalizeDetail(
      srcDetails?.career ??
        srcDetails?.profession ??
        system.career ??
        system.profession ??
        system.identity?.profession
    );
    if (career) details.career = career;

    const social = this.normalizeDetail(srcDetails?.socialstate ?? system.socialstate);
    if (social) details.socialstate = social;

    // Experience (AP)
    const exp = srcDetails?.experience ?? system.experience;
    if (exp && typeof exp === 'object') {
      details.experience = {
        ...(exp.total !== undefined ? { total: exp.total } : {}),
        ...(exp.spent !== undefined ? { spent: exp.spent } : {}),
        ...(exp.available !== undefined ? { available: exp.available } : {}),
      };
    }

    // identity.* → details.*  (profession→career already handled above)
    if (system.identity?.species && !details.species) {
      const idSpecies = this.normalizeDetail(system.identity.species);
      if (idSpecies) details.species = idSpecies;
    }
    if (system.identity?.culture && !details.culture) {
      const idCulture = this.normalizeDetail(system.identity.culture);
      if (idCulture) details.culture = idCulture;
    }

    if (Object.keys(details).length > 0) {
      out.details = details;
    }

    // ── 5. Status / Kampf values ────────────────────────────────────────
    const status: Record<string, any> = {};

    const init = system.initiative ?? system.status?.initiative;
    if (init !== undefined) {
      status.initiative = typeof init === 'number' ? { value: init } : init;
    }

    const speed = system.speed ?? system.status?.speed;
    if (speed !== undefined) {
      status.speed = typeof speed === 'number' ? { value: speed } : speed;
    }

    const dodge = system.dodge ?? system.status?.dodge;
    if (dodge !== undefined) {
      status.dodge = typeof dodge === 'number' ? { value: dodge } : dodge;
    }

    const armour = system.armour ?? system.armor ?? system.status?.armour ?? system.status?.armor;
    if (armour !== undefined) {
      status.armour = typeof armour === 'number' ? { value: armour } : armour;
    }

    const size = system.size ?? system.status?.size;
    if (size !== undefined) {
      status.size = typeof size === 'string' ? { value: size } : size;
    }

    if (Object.keys(status).length > 0) {
      out.status = out.status ?? {};
      DSA5Adapter.mergeInto(out.status, status);
    }

    // ── 6. Tradition ────────────────────────────────────────────────────
    if (system.tradition) {
      out.tradition = system.tradition;
    }

    // ── Merge normalised paths back into the original system object ──────
    // This preserves unknown keys and only overwrites/adds the normalised ones.
    DSA5Adapter.mergeInto(system, out);

    return system;
  }
}
