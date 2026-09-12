import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';
import { detectGameSystem, getCachedSystemId } from '../../utils/system-detection.js';

// ---------------------------------------------------------------------------
// Canonical value sets for soft validation (warnings, not errors)
// ---------------------------------------------------------------------------

const DAMAGE_CANONICAL = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

const ATTACK_PROPERTY_CANONICAL = new Set([
  'ada',
  'amm',
  'fin',
  'fir',
  'foc',
  'hvy',
  'lgt',
  'lod',
  'mgc',
  'rch',
  'ret',
  'spc',
  'thr',
  'two',
  'ver',
]);

const CLASS_DEFAULT_ABILITY: Record<string, string> = {
  wizard: 'int',
  artificer: 'int',
  cleric: 'wis',
  druid: 'wis',
  ranger: 'wis',
  sorcerer: 'cha',
  warlock: 'cha',
  bard: 'cha',
  paladin: 'cha',
};

// ---------------------------------------------------------------------------
// Shared Zod building blocks
// ---------------------------------------------------------------------------

const damagePart = z.object({
  number: z.number().int().min(1),
  denomination: z
    .number()
    .int()
    .refine(d => [4, 6, 8, 10, 12, 20, 100].includes(d), {
      message: 'denomination must be one of 4, 6, 8, 10, 12, 20, 100',
    }),
  type: z.string().min(1, 'damage type cannot be empty'),
  bonus: z.number().int().optional(),
});

const usesTracker = z
  .object({
    max: z.number().int().min(1),
    per: z.enum(['day', 'recharge']),
    rechargeOn: z.number().int().min(2).max(6).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.per === 'recharge' && data.rechargeOn === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rechargeOn'],
        message: 'rechargeOn is required when per is "recharge" (e.g. 5 for "Recharge 5-6")',
      });
    }
  });

const usesTrackerSchema = {
  type: 'object',
  description:
    'Limited-use tracker for this feature (e.g. "3/Day" or "Recharge 5-6"). Omit entirely for ' +
    'unlimited use. Used by: passive, save, attack, attack-with-save, aura.',
  properties: {
    max: {
      type: 'number',
      description:
        'Number of uses before it needs to recover (e.g. 3 for "3/Day", 1 for a recharge ability).',
      minimum: 1,
    },
    per: {
      type: 'string',
      enum: ['day', 'recharge'],
      description:
        '"day" — recovers to max uses once per day (long rest). ' +
        '"recharge" — recovers on a d6 roll at the start of each turn, using rechargeOn as the threshold.',
    },
    rechargeOn: {
      type: 'number',
      description:
        'Minimum d6 roll needed to recharge (e.g. 5 for "Recharge 5-6", 6 for "Recharge 6"). ' +
        'Required when per is "recharge".',
      minimum: 2,
      maximum: 6,
    },
  },
  required: ['max', 'per'],
};

const damagePartSchema = {
  type: 'object',
  properties: {
    number: { type: 'number', description: 'Number of dice (e.g. 4)', minimum: 1 },
    denomination: { type: 'number', description: 'Die size', enum: [4, 6, 8, 10, 12, 20, 100] },
    type: { type: 'string', description: 'Damage type (e.g. "fire", "slashing", "cold")' },
    bonus: {
      type: 'number',
      description:
        'Flat damage bonus added on top of the dice for this part (e.g. a +2 magic weapon on top of the ability modifier). Optional.',
    },
  },
  required: ['number', 'denomination', 'type'],
};

// ---------------------------------------------------------------------------
// Options interface
// ---------------------------------------------------------------------------

export interface DnD5eAddFeatureToolOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

// ---------------------------------------------------------------------------
// Tool class
// ---------------------------------------------------------------------------

export class DnD5eAddFeatureTool {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: DnD5eAddFeatureToolOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'DnD5eAddFeatureTool' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  getToolDefinitions() {
    return [
      {
        name: 'dnd5e-add-feature',
        description:
          '[D&D 5e only] Add a feature, attack, spellcasting setup, or spells to an existing actor. ' +
          'Set featureType to select the mode — each mode uses only its own parameters:\n\n' +
          '• passive — descriptive trait, no roll (Multiattack, Magic Resistance, Spider Climb).\n' +
          '  Required: actorIdentifier, featureName\n' +
          '  Optional: description, uses, sourceRules, sourceBook, sourcePage\n\n' +
          '• save — feature that forces a saving throw (breath weapon, cone of cold, etc.).\n' +
          '  Required: actorIdentifier, featureName, saveAbility, saveDC, damageParts\n' +
          '  Optional: description, activationType, uses, halfOnSave, areaType, areaSize ' +
          '(required if areaType set), areaUnits, affectsType\n\n' +
          '• attack — weapon attack with to-hit roll (Claw, Bite, Scimitar, etc.).\n' +
          '  Required: actorIdentifier, featureName, attackType, damageParts\n' +
          '  Required when ranged: rangeFt\n' +
          '  Optional: description, activationType, weaponClass, abilityModifier, attackBonus, ' +
          'proficient, equipped, reachFt, longRangeFt, properties, uses, sourceRules, sourceBook, sourcePage\n\n' +
          '• attack-with-save — attack roll on hit + forced save for bonus damage ' +
          '(e.g. Stinger: piercing hit + CON save or poison damage).\n' +
          '  Required: actorIdentifier, featureName, attackType, damageParts, ' +
          'saveAbility, saveDC, saveDamageParts\n' +
          '  Required when ranged: rangeFt\n' +
          '  Optional: description, activationType, weaponClass, abilityModifier, attackBonus, ' +
          'proficient, equipped, reachFt, longRangeFt, properties, saveOnSave, uses, ' +
          'sourceRules, sourceBook, sourcePage\n\n' +
          '• aura — automatic-damage area, no to-hit, no save (all creatures in range take damage).\n' +
          '  Required: actorIdentifier, featureName, damageParts, areaType, areaSize\n' +
          '  Optional: description, activationType, areaUnits, affectsType, uses, ' +
          'sourceRules, sourceBook, sourcePage\n\n' +
          '• spellcasting — configure spell slots and casting ability. ' +
          'Run this BEFORE featureType "spells".\n' +
          '  Required: actorIdentifier, spellcastingClass, spellcastingLevel\n' +
          '  Optional: spellcastingAbility (default per class: wizard/artificer→INT, ' +
          'cleric/druid/ranger→WIS, sorcerer/warlock/bard/paladin→CHA), sourceRules\n\n' +
          '• spells — import named spells from compendium. Names must be in English.\n' +
          '  Required: actorIdentifier, spellNames (max 50)\n' +
          '  Optional: compendiumPacks (default ["dnd5e.spells"])\n\n' +
          'Use list-characters or get-character first to find the actorIdentifier.',

        inputSchema: {
          type: 'object',
          properties: {
            // ── Discriminator ─────────────────────────────────────────────────
            featureType: {
              type: 'string',
              enum: [
                'passive',
                'save',
                'attack',
                'attack-with-save',
                'aura',
                'spellcasting',
                'spells',
              ],
              description:
                'Mode selector — determines which parameters are used and which Foundry handler is called.',
            },

            // ── Common ────────────────────────────────────────────────────────
            actorIdentifier: {
              type: 'string',
              description:
                'Name or ID of the target actor (partial name match supported). Required for all featureTypes.',
            },
            featureName: {
              type: 'string',
              description:
                'Name for the new feature/item — must be unique on the actor. ' +
                'Required for: passive, save, attack, attack-with-save, aura.',
            },
            description: {
              type: 'string',
              description:
                'HTML description of the feature (optional). Used by: passive, save, attack, attack-with-save, aura.',
              default: '',
            },
            activationType: {
              type: 'string',
              enum: ['action', 'bonus', 'reaction', 'legendary', 'lair', 'special'],
              description:
                'Action economy type. Used by: save, attack, attack-with-save, aura. Default: "action".',
              default: 'action',
            },
            uses: usesTrackerSchema,

            // ── Damage ────────────────────────────────────────────────────────
            damageParts: {
              type: 'array',
              minItems: 1,
              description:
                'Damage components. ' +
                'For attack: first entry is base weapon die, extra entries stack on top. ' +
                'For save and aura: all damage dealt on trigger. ' +
                'For attack-with-save: the attack roll damage (on hit). ' +
                'Required for: save, attack, attack-with-save, aura.',
              items: damagePartSchema,
            },

            // ── Save parameters ───────────────────────────────────────────────
            saveAbility: {
              type: 'string',
              enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
              description:
                'Ability used for the saving throw. Required for: save, attack-with-save.',
            },
            saveDC: {
              type: 'number',
              description: 'Saving throw DC (1–30). Required for: save, attack-with-save.',
              minimum: 1,
              maximum: 30,
            },
            halfOnSave: {
              type: 'boolean',
              description:
                'Whether the target takes half damage on a successful save. Used by: save. Default: true.',
              default: true,
            },
            saveDamageParts: {
              type: 'array',
              minItems: 1,
              description:
                'Damage dealt by the save effect on a failed save (independent of attack damage). ' +
                'Required for: attack-with-save.',
              items: damagePartSchema,
            },
            saveOnSave: {
              type: 'string',
              enum: ['half', 'none'],
              description:
                '"none" — no damage on a successful save (default). ' +
                '"half" — half save damage on a successful save. Used by: attack-with-save.',
              default: 'none',
            },

            // ── Area parameters ───────────────────────────────────────────────
            areaType: {
              type: 'string',
              enum: ['cone', 'cube', 'cylinder', 'emanation', 'line', 'radius', 'sphere', ''],
              description:
                'Area-of-effect template shape. ' +
                'For save: optional (omit or use "" for no template); if set, areaSize is required. ' +
                'For aura: required — use "emanation" or "sphere" for radial auras.',
              default: '',
            },
            areaSize: {
              type: 'number',
              description:
                'Template size in areaUnits (e.g. 30 for a 30 ft cone). Must be > 0. ' +
                'Required for: aura. Required for save when areaType is set.',
              exclusiveMinimum: 0,
            },
            areaUnits: {
              type: 'string',
              enum: ['ft', 'm'],
              description: 'Units for areaSize. Used by: save, aura. Default: "ft".',
              default: 'ft',
            },
            affectsType: {
              type: 'string',
              enum: ['creature', 'object', 'space', ''],
              description: 'What the area targets. Used by: save, aura. Default: "creature".',
              default: 'creature',
            },

            // ── Attack parameters ─────────────────────────────────────────────
            attackType: {
              type: 'string',
              enum: ['melee', 'ranged'],
              description:
                '"melee" for reach-based attacks; "ranged" for bow/thrown attacks. ' +
                'Required for: attack, attack-with-save.',
            },
            weaponClass: {
              type: 'string',
              enum: ['natural', 'simpleM', 'martialM', 'simpleR', 'martialR'],
              description:
                'Weapon category. Use "natural" for monster attacks (claws, bite, touch). ' +
                'Used by: attack, attack-with-save. Default: "natural".',
              default: 'natural',
            },
            abilityModifier: {
              type: 'string',
              enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
              description:
                'Ability used for to-hit and damage rolls. ' +
                'Omit to use default: STR for melee, DEX for ranged. ' +
                'Used by: attack, attack-with-save.',
            },
            attackBonus: {
              type: 'number',
              description:
                'Flat bonus to the attack roll only, not damage (e.g. 1 for +1 to hit). ' +
                'Used by: attack, attack-with-save. Default: 0.',
              minimum: 0,
              maximum: 10,
              default: 0,
            },
            proficient: {
              type: 'boolean',
              description:
                'Whether the actor is proficient with this weapon (adds proficiency bonus to to-hit). ' +
                'Used by: attack, attack-with-save. Default: true.',
              default: true,
            },
            equipped: {
              type: 'boolean',
              description:
                'Whether the weapon is equipped and available for attack rolls. ' +
                'Used by: attack, attack-with-save. Default: true.',
              default: true,
            },
            reachFt: {
              type: 'number',
              description:
                'Melee reach in feet. Used by: attack, attack-with-save (melee only). Default: 5.',
              minimum: 5,
              default: 5,
            },
            rangeFt: {
              type: 'number',
              description:
                'Normal range in feet. Used by: attack, attack-with-save. ' +
                'Required when attackType is "ranged".',
              minimum: 1,
            },
            longRangeFt: {
              type: 'number',
              description:
                'Long range in feet — attacks beyond rangeFt up to this distance are at disadvantage. ' +
                'Must be greater than rangeFt. Used by: attack, attack-with-save (ranged only).',
              minimum: 1,
            },
            properties: {
              type: 'array',
              description:
                'Weapon property codes (e.g. ["fin", "lgt"]). ' +
                'Canonical 2014 codes: ada, amm, fin, fir, foc, hvy, lgt, lod, mgc, rch, ret, spc, thr, two, ver. ' +
                'Used by: attack, attack-with-save. Default: [].',
              items: { type: 'string' },
              default: [],
            },

            // ── Spellcasting parameters ───────────────────────────────────────
            spellcastingClass: {
              type: 'string',
              enum: [
                'artificer',
                'bard',
                'cleric',
                'druid',
                'paladin',
                'ranger',
                'sorcerer',
                'warlock',
                'wizard',
              ],
              description:
                'The spellcasting class — determines slot table and default casting ability. ' +
                'Warlock uses Pact Magic. Required for: spellcasting.',
            },
            spellcastingLevel: {
              type: 'number',
              description:
                'Class level (1–20). Determines how many slots the actor receives. Required for: spellcasting.',
              minimum: 1,
              maximum: 20,
            },
            spellcastingAbility: {
              type: 'string',
              enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
              description:
                'Override the casting ability. Omit to use the class default. ' +
                'Used by: spellcasting.',
            },

            // ── Spells parameters ─────────────────────────────────────────────
            spellNames: {
              type: 'array',
              description:
                'English spell names to import (exact match, case-insensitive). Max 50 per call. ' +
                'Required for: spells.',
              minItems: 1,
              maxItems: 50,
              items: { type: 'string', minLength: 1 },
            },
            compendiumPacks: {
              type: 'array',
              description:
                'Compendium pack IDs to search, in priority order (first match wins). ' +
                'Default: ["dnd5e.spells"] (SRD 2014). Use "dnd5e.spells24" for 2024 rules. ' +
                'Used by: spells.',
              items: { type: 'string', minLength: 1 },
              default: ['dnd5e.spells'],
            },

            // ── Source metadata ───────────────────────────────────────────────
            sourceRules: {
              type: 'string',
              enum: ['2014', '2024'],
              description:
                'Rules edition. Used by: passive, attack, attack-with-save, aura, spellcasting. Default: "2014".',
              default: '2014',
            },
            sourceBook: {
              type: 'string',
              description:
                'Source book abbreviation (e.g. "MM\'14"). Used by: passive, attack, attack-with-save, aura.',
              default: '',
            },
            sourcePage: {
              type: 'string',
              description:
                'Page number in the source book. Used by: passive, attack, attack-with-save, aura.',
              default: '',
            },
          },
          required: ['featureType', 'actorIdentifier'],
        },
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Master dispatcher
  // ---------------------------------------------------------------------------

  async handleAddFeature(args: any): Promise<any> {
    const { featureType } = z
      .object({
        featureType: z.enum([
          'passive',
          'save',
          'attack',
          'attack-with-save',
          'aura',
          'spellcasting',
          'spells',
        ]),
      })
      .parse(args);

    switch (featureType) {
      case 'passive':
        return this.handlePassive(args);
      case 'save':
        return this.handleSave(args);
      case 'attack':
        return this.handleAttack(args);
      case 'attack-with-save':
        return this.handleAttackWithSave(args);
      case 'aura':
        return this.handleAura(args);
      case 'spellcasting':
        return this.handleSpellcasting(args);
      case 'spells':
        return this.handleSpells(args);
    }
  }

  // ---------------------------------------------------------------------------
  // passive
  // ---------------------------------------------------------------------------

  private async handlePassive(args: any): Promise<any> {
    const schema = z.object({
      featureType: z.literal('passive'),
      actorIdentifier: z.string().min(1, 'actorIdentifier cannot be empty'),
      featureName: z.string().min(1, 'featureName cannot be empty'),
      description: z.string().default(''),
      uses: usesTracker.optional(),
      sourceRules: z.enum(['2014', '2024']).default('2014'),
      sourceBook: z.string().default(''),
      sourcePage: z.string().default(''),
    });

    const parsed = schema.parse(args);

    this.logger.info('Adding passive feature to D&D 5e actor', {
      actorIdentifier: parsed.actorIdentifier,
      featureName: parsed.featureName,
    });

    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'dnd5e') {
        throw new Error(
          `dnd5e-add-feature (passive) requires D&D 5e. ` +
            `Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      const result = await this.foundryClient.query(
        'foundry-mcp-bridge.addPassiveFeatureToActor',
        parsed
      );

      this.logger.info('Passive feature added successfully', {
        actorId: result.actor?.id,
        itemId: result.item?.id,
      });

      return this.formatPassiveResponse(result, parsed);
    } catch (error) {
      this.errorHandler.handleToolError(error, 'dnd5e-add-feature', 'passive feature creation');
    }
  }

  private formatPassiveResponse(result: any, params: any): any {
    const summary = `✅ Feature "${result.item.name}" added to "${result.actor.name}"`;
    const details = [
      `**Actor:** ${result.actor.name} (id: \`${result.actor.id}\`)`,
      `**Feature:** ${result.item.name} (id: \`${result.item.id}\`)`,
      `**Type:** passive / descriptive (no activity)`,
      `**Rules:** ${params.sourceRules}${params.sourceBook ? ` — ${params.sourceBook}` : ''}`,
    ].join('\n');
    return {
      summary,
      success: true,
      item: result.item,
      actor: result.actor,
      message: `${summary}\n\n${details}`,
    };
  }

  // ---------------------------------------------------------------------------
  // save
  // ---------------------------------------------------------------------------

  private async handleSave(args: any): Promise<any> {
    const schema = z
      .object({
        featureType: z.literal('save'),
        actorIdentifier: z.string().min(1, 'actorIdentifier cannot be empty'),
        featureName: z.string().min(1, 'featureName cannot be empty'),
        description: z.string().default(''),
        activationType: z
          .enum(['action', 'bonus', 'reaction', 'legendary', 'lair', 'special'])
          .default('action'),
        saveAbility: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
        saveDC: z.number().int().min(1).max(30),
        damageParts: z.array(damagePart).min(1, 'at least one damage part is required'),
        halfOnSave: z.boolean().default(true),
        areaType: z
          .enum(['cone', 'cube', 'cylinder', 'emanation', 'line', 'radius', 'sphere', ''])
          .default(''),
        areaSize: z.number().positive().optional(),
        areaUnits: z.enum(['ft', 'm']).default('ft'),
        affectsType: z.enum(['creature', 'object', 'space', '']).default('creature'),
        uses: usesTracker.optional(),
      })
      .superRefine((data, ctx) => {
        if (data.areaType !== '' && data.areaSize === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['areaSize'],
            message: `areaSize is required when areaType is "${data.areaType}"`,
          });
        }
      });

    const parsed = schema.parse(args);

    this.logger.info('Adding save feature to D&D 5e actor', {
      actorIdentifier: parsed.actorIdentifier,
      featureName: parsed.featureName,
      saveAbility: parsed.saveAbility,
      saveDC: parsed.saveDC,
      areaType: parsed.areaType || 'none',
    });

    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'dnd5e') {
        throw new Error(
          `dnd5e-add-feature (save) requires D&D 5e. ` +
            `Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      const result = await this.foundryClient.query(
        'foundry-mcp-bridge.addSaveFeatureToActor',
        parsed
      );

      this.logger.info('Save feature added successfully', {
        actorId: result.actor?.id,
        itemId: result.item?.id,
      });

      return this.formatSaveResponse(result, parsed);
    } catch (error) {
      this.errorHandler.handleToolError(error, 'dnd5e-add-feature', 'save feature creation');
    }
  }

  private formatSaveResponse(result: any, params: any): any {
    const damageDesc = (params.damageParts as any[])
      .map(p => `${p.number}d${p.denomination} ${p.type}`)
      .join(' + ');
    const areaDesc = params.areaType
      ? `, ${params.areaSize}${params.areaUnits} ${params.areaType}`
      : '';
    const saveDesc = `DC ${params.saveDC} ${String(params.saveAbility).toUpperCase()} save`;
    const onSaveDesc = params.halfOnSave ? 'half damage on save' : 'no damage on save';
    const summary = `✅ Feature "${result.item.name}" added to "${result.actor.name}"`;
    const details = [
      `**Actor:** ${result.actor.name} (id: \`${result.actor.id}\`)`,
      `**Feature:** ${result.item.name} (id: \`${result.item.id}\`)`,
      `**Save:** ${saveDesc} — ${onSaveDesc}`,
      `**Damage:** ${damageDesc}${areaDesc}`,
      `**Activation:** ${params.activationType}`,
    ].join('\n');
    return {
      summary,
      success: true,
      item: result.item,
      actor: result.actor,
      message: `${summary}\n\n${details}`,
    };
  }

  // ---------------------------------------------------------------------------
  // attack
  // ---------------------------------------------------------------------------

  private async handleAttack(args: any): Promise<any> {
    const schema = z
      .object({
        featureType: z.literal('attack'),
        actorIdentifier: z.string().min(1, 'actorIdentifier cannot be empty'),
        featureName: z.string().min(1, 'featureName cannot be empty'),
        description: z.string().default(''),
        activationType: z
          .enum(['action', 'bonus', 'reaction', 'legendary', 'lair', 'special'])
          .default('action'),
        attackType: z.enum(['melee', 'ranged']),
        weaponClass: z
          .enum(['natural', 'simpleM', 'martialM', 'simpleR', 'martialR'])
          .default('natural'),
        abilityModifier: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']).optional(),
        attackBonus: z.number().int().min(0).max(10).default(0),
        proficient: z.boolean().default(true),
        equipped: z.boolean().default(true),
        reachFt: z.number().int().min(5).default(5),
        rangeFt: z.number().int().min(1).optional(),
        longRangeFt: z.number().int().min(1).optional(),
        damageParts: z.array(damagePart).min(1, 'at least one damage part is required'),
        properties: z.array(z.string()).default([]),
        uses: usesTracker.optional(),
        sourceRules: z.enum(['2014', '2024']).default('2014'),
        sourceBook: z.string().default(''),
        sourcePage: z.string().default(''),
      })
      .superRefine((data, ctx) => {
        if (data.attackType === 'ranged' && data.rangeFt === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rangeFt'],
            message: 'rangeFt is required when attackType is "ranged"',
          });
        }
        if (
          data.longRangeFt !== undefined &&
          data.rangeFt !== undefined &&
          data.longRangeFt <= data.rangeFt
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['longRangeFt'],
            message: `longRangeFt (${data.longRangeFt}) must be greater than rangeFt (${data.rangeFt})`,
          });
        }
      });

    const parsed = schema.parse(args);
    const effectiveAbility: string =
      parsed.abilityModifier ?? (parsed.attackType === 'melee' ? 'str' : 'dex');

    const warnings: string[] = [];
    for (const part of parsed.damageParts) {
      if (!DAMAGE_CANONICAL.has(part.type)) {
        const msg = `Unknown damage type "${part.type}" — verify it matches dnd5e system values`;
        warnings.push(msg);
        this.logger.warn(msg, { value: part.type });
      }
    }
    for (const prop of parsed.properties) {
      if (!ATTACK_PROPERTY_CANONICAL.has(prop)) {
        const msg = `Unknown weapon property "${prop}" — verify it matches dnd5e system values`;
        warnings.push(msg);
        this.logger.warn(msg, { value: prop });
      }
    }

    this.logger.info('Adding attack feature to D&D 5e actor', {
      actorIdentifier: parsed.actorIdentifier,
      featureName: parsed.featureName,
      attackType: parsed.attackType,
      ability: effectiveAbility,
      warnings: warnings.length,
    });

    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'dnd5e') {
        throw new Error(
          `dnd5e-add-feature (attack) requires D&D 5e. ` +
            `Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      const result = await this.foundryClient.query('foundry-mcp-bridge.addAttackToActor', {
        ...parsed,
        effectiveAbility,
      });

      this.logger.info('Attack feature added successfully', {
        actorId: result.actor?.id,
        itemId: result.item?.id,
      });

      return this.formatAttackResponse(result, { ...parsed, effectiveAbility }, warnings);
    } catch (error) {
      this.errorHandler.handleToolError(error, 'dnd5e-add-feature', 'attack feature creation');
    }
  }

  private formatAttackResponse(result: any, params: any, warnings: string[]): any {
    const bonusStr = params.attackBonus > 0 ? ` +${params.attackBonus} to hit` : '';
    const damageDesc = (params.damageParts as any[])
      .map(p => `${p.number}d${p.denomination} ${p.type}`)
      .join(' + ');
    const rangeDesc =
      params.attackType === 'melee'
        ? `reach ${params.reachFt ?? 5} ft.`
        : `range ${params.rangeFt}${params.longRangeFt ? `/${params.longRangeFt}` : ''} ft.`;
    const summary = `✅ Attack "${result.item.name}" added to "${result.actor.name}"`;
    const details = [
      `**Actor:** ${result.actor.name} (id: \`${result.actor.id}\`)`,
      `**Item:** ${result.item.name} (id: \`${result.item.id}\`)`,
      `**Attack:** ${params.attackType} — ${String(params.effectiveAbility).toUpperCase()} modifier${bonusStr}`,
      `**Damage:** ${damageDesc}`,
      `**Range/Reach:** ${rangeDesc}`,
      `**Weapon class:** ${params.weaponClass}`,
    ].join('\n');
    const warningSection =
      warnings.length > 0
        ? `\n\n⚠️ **Warnings (${warnings.length}):**\n${warnings.map(w => `- ${w}`).join('\n')}`
        : '';
    return {
      summary,
      success: true,
      item: result.item,
      actor: result.actor,
      warnings,
      message: `${summary}\n\n${details}${warningSection}`,
    };
  }

  // ---------------------------------------------------------------------------
  // attack-with-save
  // ---------------------------------------------------------------------------

  private async handleAttackWithSave(args: any): Promise<any> {
    const schema = z
      .object({
        featureType: z.literal('attack-with-save'),
        actorIdentifier: z.string().min(1, 'actorIdentifier cannot be empty'),
        featureName: z.string().min(1, 'featureName cannot be empty'),
        description: z.string().default(''),
        activationType: z
          .enum(['action', 'bonus', 'reaction', 'legendary', 'lair', 'special'])
          .default('action'),
        attackType: z.enum(['melee', 'ranged']),
        weaponClass: z
          .enum(['natural', 'simpleM', 'martialM', 'simpleR', 'martialR'])
          .default('natural'),
        abilityModifier: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']).optional(),
        attackBonus: z.number().int().min(0).max(10).default(0),
        proficient: z.boolean().default(true),
        equipped: z.boolean().default(true),
        reachFt: z.number().int().min(5).default(5),
        rangeFt: z.number().int().min(1).optional(),
        longRangeFt: z.number().int().min(1).optional(),
        damageParts: z.array(damagePart).min(1, 'at least one damage part is required'),
        properties: z.array(z.string()).default([]),
        saveAbility: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']),
        saveDC: z.number().int().min(1).max(30),
        saveDamageParts: z.array(damagePart).min(1, 'at least one save damage part is required'),
        saveOnSave: z.enum(['half', 'none']).default('none'),
        uses: usesTracker.optional(),
        sourceRules: z.enum(['2014', '2024']).default('2014'),
        sourceBook: z.string().default(''),
        sourcePage: z.string().default(''),
      })
      .superRefine((data, ctx) => {
        if (data.attackType === 'ranged' && data.rangeFt === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rangeFt'],
            message: 'rangeFt is required when attackType is "ranged"',
          });
        }
        if (
          data.longRangeFt !== undefined &&
          data.rangeFt !== undefined &&
          data.longRangeFt <= data.rangeFt
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['longRangeFt'],
            message: `longRangeFt (${data.longRangeFt}) must be greater than rangeFt (${data.rangeFt})`,
          });
        }
      });

    const parsed = schema.parse(args);
    const effectiveAbility: string =
      parsed.abilityModifier ?? (parsed.attackType === 'melee' ? 'str' : 'dex');

    const warnings: string[] = [];
    for (const part of [...parsed.damageParts, ...parsed.saveDamageParts]) {
      if (!DAMAGE_CANONICAL.has(part.type)) {
        const msg = `Unknown damage type "${part.type}" — verify it matches dnd5e system values`;
        if (!warnings.includes(msg)) warnings.push(msg);
        this.logger.warn(msg, { value: part.type });
      }
    }

    this.logger.info('Adding attack+save feature to D&D 5e actor', {
      actorIdentifier: parsed.actorIdentifier,
      featureName: parsed.featureName,
      attackType: parsed.attackType,
      saveAbility: parsed.saveAbility,
      saveDC: parsed.saveDC,
      warnings: warnings.length,
    });

    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'dnd5e') {
        throw new Error(
          `dnd5e-add-feature (attack-with-save) requires D&D 5e. ` +
            `Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      const result = await this.foundryClient.query('foundry-mcp-bridge.addAttackWithSaveToActor', {
        ...parsed,
        effectiveAbility,
      });

      this.logger.info('Attack+save feature added successfully', {
        actorId: result.actor?.id,
        itemId: result.item?.id,
      });

      return this.formatAttackWithSaveResponse(result, { ...parsed, effectiveAbility }, warnings);
    } catch (error) {
      this.errorHandler.handleToolError(error, 'dnd5e-add-feature', 'attack+save feature creation');
    }
  }

  private formatAttackWithSaveResponse(result: any, params: any, warnings: string[]): any {
    const bonusStr = params.attackBonus > 0 ? ` +${params.attackBonus} to hit` : '';
    const attackDamageDesc = (params.damageParts as any[])
      .map(p => `${p.number}d${p.denomination} ${p.type}`)
      .join(' + ');
    const saveDamageDesc = (params.saveDamageParts as any[])
      .map(p => `${p.number}d${p.denomination} ${p.type}`)
      .join(' + ');
    const rangeDesc =
      params.attackType === 'melee'
        ? `reach ${params.reachFt ?? 5} ft.`
        : `range ${params.rangeFt}${params.longRangeFt ? `/${params.longRangeFt}` : ''} ft.`;
    const summary = `✅ Attack+Save "${result.item.name}" added to "${result.actor.name}"`;
    const details = [
      `**Actor:** ${result.actor.name} (id: \`${result.actor.id}\`)`,
      `**Item:** ${result.item.name} (id: \`${result.item.id}\`)`,
      `**Attack:** ${params.attackType} — ${String(params.effectiveAbility).toUpperCase()} modifier${bonusStr}, ${rangeDesc}`,
      `**Attack damage:** ${attackDamageDesc}`,
      `**Save:** DC ${params.saveDC} ${String(params.saveAbility).toUpperCase()} — ${saveDamageDesc} (${params.saveOnSave === 'half' ? 'half on save' : 'no damage on save'})`,
    ].join('\n');
    const warningSection =
      warnings.length > 0
        ? `\n\n⚠️ **Warnings (${warnings.length}):**\n${warnings.map(w => `- ${w}`).join('\n')}`
        : '';
    return {
      summary,
      success: true,
      item: result.item,
      actor: result.actor,
      warnings,
      message: `${summary}\n\n${details}${warningSection}`,
    };
  }

  // ---------------------------------------------------------------------------
  // aura
  // ---------------------------------------------------------------------------

  private async handleAura(args: any): Promise<any> {
    const schema = z.object({
      featureType: z.literal('aura'),
      actorIdentifier: z.string().min(1, 'actorIdentifier cannot be empty'),
      featureName: z.string().min(1, 'featureName cannot be empty'),
      description: z.string().default(''),
      activationType: z
        .enum(['action', 'bonus', 'reaction', 'legendary', 'lair', 'special'])
        .default('action'),
      damageParts: z.array(damagePart).min(1, 'at least one damage part is required'),
      areaType: z.enum(['cone', 'cube', 'cylinder', 'emanation', 'line', 'radius', 'sphere']),
      areaSize: z.number().positive('areaSize must be greater than 0'),
      areaUnits: z.enum(['ft', 'm']).default('ft'),
      affectsType: z.enum(['creature', 'object', 'space', '']).default('creature'),
      uses: usesTracker.optional(),
      sourceRules: z.enum(['2014', '2024']).default('2014'),
      sourceBook: z.string().default(''),
      sourcePage: z.string().default(''),
    });

    const parsed = schema.parse(args);

    const warnings: string[] = [];
    for (const part of parsed.damageParts) {
      if (!DAMAGE_CANONICAL.has(part.type)) {
        const msg = `Unknown damage type "${part.type}" — verify it matches dnd5e system values`;
        warnings.push(msg);
        this.logger.warn(msg, { value: part.type });
      }
    }

    this.logger.info('Adding aura feature to D&D 5e actor', {
      actorIdentifier: parsed.actorIdentifier,
      featureName: parsed.featureName,
      areaType: parsed.areaType,
      areaSize: parsed.areaSize,
      warnings: warnings.length,
    });

    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'dnd5e') {
        throw new Error(
          `dnd5e-add-feature (aura) requires D&D 5e. ` +
            `Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      const result = await this.foundryClient.query('foundry-mcp-bridge.addAuraToActor', parsed);

      this.logger.info('Aura feature added successfully', {
        actorId: result.actor?.id,
        itemId: result.item?.id,
      });

      return this.formatAuraResponse(result, parsed, warnings);
    } catch (error) {
      this.errorHandler.handleToolError(error, 'dnd5e-add-feature', 'aura feature creation');
    }
  }

  private formatAuraResponse(result: any, params: any, warnings: string[]): any {
    const damageDesc = (params.damageParts as any[])
      .map(p => `${p.number}d${p.denomination} ${p.type}`)
      .join(' + ');
    const areaDesc = `${params.areaSize}${params.areaUnits} ${params.areaType}`;
    const summary = `✅ Aura "${result.item.name}" added to "${result.actor.name}"`;
    const details = [
      `**Actor:** ${result.actor.name} (id: \`${result.actor.id}\`)`,
      `**Feature:** ${result.item.name} (id: \`${result.item.id}\`)`,
      `**Damage:** ${damageDesc} (automatic — no attack roll, no saving throw)`,
      `**Area:** ${areaDesc}, affects: ${params.affectsType || 'any'}`,
      `**Activation:** ${params.activationType}`,
    ].join('\n');
    const warningSection =
      warnings.length > 0
        ? `\n\n⚠️ **Warnings (${warnings.length}):**\n${warnings.map(w => `- ${w}`).join('\n')}`
        : '';
    return {
      summary,
      success: true,
      item: result.item,
      actor: result.actor,
      warnings,
      message: `${summary}\n\n${details}${warningSection}`,
    };
  }

  // ---------------------------------------------------------------------------
  // spellcasting
  // ---------------------------------------------------------------------------

  private async handleSpellcasting(args: any): Promise<any> {
    const schema = z.object({
      featureType: z.literal('spellcasting'),
      actorIdentifier: z.string().min(1, 'actorIdentifier cannot be empty'),
      spellcastingClass: z.enum([
        'artificer',
        'bard',
        'cleric',
        'druid',
        'paladin',
        'ranger',
        'sorcerer',
        'warlock',
        'wizard',
      ]),
      spellcastingLevel: z.number().int().min(1).max(20),
      spellcastingAbility: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']).optional(),
      sourceRules: z.enum(['2014', '2024']).default('2014'),
    });

    const parsed = schema.parse(args);
    const effectiveAbility =
      parsed.spellcastingAbility ?? CLASS_DEFAULT_ABILITY[parsed.spellcastingClass];

    this.logger.info('Setting actor spellcasting', {
      actorIdentifier: parsed.actorIdentifier,
      spellcastingClass: parsed.spellcastingClass,
      spellcastingLevel: parsed.spellcastingLevel,
      ability: effectiveAbility,
    });

    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'dnd5e') {
        throw new Error(
          `dnd5e-add-feature (spellcasting) requires D&D 5e. ` +
            `Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      const result = await this.foundryClient.query('foundry-mcp-bridge.setActorSpellcasting', {
        ...parsed,
        effectiveAbility,
      });

      this.logger.info('Actor spellcasting set successfully', { actorId: result.actor?.id });

      return this.formatSpellcastingResponse(result, { ...parsed, effectiveAbility });
    } catch (error) {
      this.errorHandler.handleToolError(error, 'dnd5e-add-feature', 'spellcasting setup');
    }
  }

  private formatSpellcastingResponse(result: any, params: any): any {
    const isWarlock = params.spellcastingClass === 'warlock';
    const slotsDesc = isWarlock
      ? `Pact Magic: ${result.spellcasting.slots.pact.max} slot(s) of level ${result.spellcasting.slots.pact.level}`
      : Object.entries(result.spellcasting.slots as Record<string, number>)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `L${k.replace('spell', '')}: ${n}`)
          .join(', ') || 'no slots';
    const summary = `✅ Spellcasting configured on "${result.actor.name}" — ${params.spellcastingClass} level ${params.spellcastingLevel}`;
    const details = [
      `**Actor:** ${result.actor.name} (id: \`${result.actor.id}\`)`,
      `**Class:** ${params.spellcastingClass} — level ${params.spellcastingLevel}`,
      `**Ability:** ${String(params.effectiveAbility).toUpperCase()}`,
      `**Slots:** ${slotsDesc}`,
    ].join('\n');
    const warningSection =
      (result.warnings as string[]).length > 0
        ? `\n\n⚠️ **Warnings:**\n${(result.warnings as string[]).map((w: string) => `- ${w}`).join('\n')}`
        : '';
    return {
      summary,
      success: true,
      actor: result.actor,
      spellcasting: result.spellcasting,
      warnings: result.warnings,
      message: `${summary}\n\n${details}${warningSection}`,
    };
  }

  // ---------------------------------------------------------------------------
  // spells
  // ---------------------------------------------------------------------------

  private async handleSpells(args: any): Promise<any> {
    const schema = z.object({
      featureType: z.literal('spells'),
      actorIdentifier: z.string().min(1, 'actorIdentifier cannot be empty'),
      spellNames: z.array(z.string().min(1)).min(1).max(50),
      compendiumPacks: z.array(z.string().min(1)).default(['dnd5e.spells']),
    });

    const parsed = schema.parse(args);

    this.logger.info('Adding spells to D&D 5e actor', {
      actorIdentifier: parsed.actorIdentifier,
      spellCount: parsed.spellNames.length,
      packs: parsed.compendiumPacks,
    });

    try {
      const system = await detectGameSystem(this.foundryClient, this.logger);
      if (system !== 'dnd5e') {
        throw new Error(
          `dnd5e-add-feature (spells) requires D&D 5e. ` +
            `Detected system: "${getCachedSystemId() ?? 'unknown'}".`
        );
      }

      const result = await this.foundryClient.query('foundry-mcp-bridge.addSpellsToActor', parsed);

      this.logger.info('Spells import complete', {
        actorId: result.actor?.id,
        added: result.added?.length,
        skipped: result.skipped?.length,
        notFound: result.notFound?.length,
        failed: result.failed?.length,
      });

      return this.formatSpellsResponse(result, parsed);
    } catch (error) {
      this.errorHandler.handleToolError(error, 'dnd5e-add-feature', 'spell import');
    }
  }

  private formatSpellsResponse(result: any, params: any): any {
    const added = result.added as Array<{
      name: string;
      packId: string;
      packLabel: string;
      itemId: string;
    }>;
    const skipped = result.skipped as Array<{ name: string; reason: string }>;
    const notFound = result.notFound as string[];
    const failed = result.failed as Array<{ name: string; error: string }>;
    const warnings = result.warnings as string[];
    const total = (params.spellNames as string[]).length;

    const parts: string[] = [];
    if (added.length > 0) parts.push(`${added.length} added`);
    if (skipped.length > 0) parts.push(`${skipped.length} skipped`);
    if (notFound.length > 0) parts.push(`${notFound.length} not found`);
    if (failed.length > 0) parts.push(`${failed.length} failed`);

    const icon = failed.length > 0 ? '⚠️' : notFound.length > 0 ? '🔍' : '✅';
    const summary = `${icon} Spells imported to "${result.actor.name}" — ${parts.length > 0 ? parts.join(', ') : 'nothing changed'}`;

    const lines: string[] = [
      `**Actor:** ${result.actor.name} (id: \`${result.actor.id}\`)`,
      `**Requested:** ${total} — Added: ${added.length}, Skipped: ${skipped.length}, Not found: ${notFound.length}${failed.length > 0 ? `, Failed: ${failed.length}` : ''}`,
    ];
    if (added.length > 0) {
      lines.push('\n✅ **Added:**');
      for (const s of added) lines.push(`  - ${s.name} *(${s.packLabel}, item \`${s.itemId}\`)*`);
    }
    if (skipped.length > 0) {
      lines.push('\n⏭️ **Skipped:**');
      for (const s of skipped) lines.push(`  - ${s.name} — *${s.reason}*`);
    }
    if (notFound.length > 0) {
      lines.push('\n❌ **Not found in compendium:**');
      for (const name of notFound) lines.push(`  - ${name}`);
    }
    if (failed.length > 0) {
      lines.push('\n⚠️ **Failed during import:**');
      for (const f of failed) lines.push(`  - ${f.name} — *${f.error}*`);
    }
    if (warnings.length > 0) {
      lines.push('\n⚠️ **Warnings:**');
      for (const w of warnings) lines.push(`  - ${w}`);
    }
    return {
      summary,
      success: added.length > 0 || (notFound.length === 0 && failed.length === 0),
      actor: result.actor,
      added,
      skipped,
      notFound,
      failed,
      warnings,
      message: `${summary}\n\n${lines.join('\n')}`,
    };
  }
}
