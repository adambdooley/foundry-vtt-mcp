import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';

export interface DSA5JsonActorImporterOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

type JsonRecord = Record<string, unknown>;

export type DSA5ImportFormat =
  | 'raw_foundry'
  | 'optolith_like'
  | 'custom_dsa5'
  | 'darkaid'
  | 'unknown';

export type DSA5ImportStrategy =
  | 'auto'
  | 'raw_foundry'
  | 'optolith_like'
  | 'custom_dsa5'
  | 'darkaid';

interface MappingResult {
  actorData: JsonRecord;
  candidateItemNames: string[];
  itemOverrides: Record<string, ItemOverride>;
  warnings: string[];
  unmappedFields: string[];
}

interface ItemOverride {
  sourceName: string;
  talentValue?: number;
  quantity?: number;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fixMojibake = (s: string): string =>
  s
    .replace(/Ã¶/g, 'ö')
    .replace(/Ã¼/g, 'ü')
    .replace(/Ã¤/g, 'ä')
    .replace(/ÃŸ/g, 'ß')
    .replace(/Ã–/g, 'Ö')
    .replace(/Ãœ/g, 'Ü')
    .replace(/Ã„/g, 'Ä');

const normalizeValue = (value: unknown, parentKey?: string): unknown => {
  if (Array.isArray(value)) {
    return value.map(entry => normalizeValue(entry, parentKey));
  }

  if (isRecord(value)) {
    const normalized: JsonRecord = {};
    for (const [key, entryValue] of Object.entries(value)) {
      const fixedKey = fixMojibake(key);
      normalized[fixedKey] = normalizeValue(entryValue, fixedKey);
    }
    return normalized;
  }

  if (typeof value === 'string' && parentKey === 'name') {
    return fixMojibake(value);
  }

  return value;
};

export const normalizeInputKeys = (payload: JsonRecord): JsonRecord =>
  normalizeValue(payload) as JsonRecord;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const toStringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
};

const getByKeys = (source: JsonRecord, keys: string[]): unknown => {
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return undefined;
};

const getNested = (source: JsonRecord, path: string): unknown => {
  const parts = path.split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
};

const characteristicAdvance = (value: unknown): number | undefined => {
  const numeric = toNumber(value);
  if (numeric === undefined) return undefined;
  return Math.round(numeric) - 8;
};

const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Dark Aid exports item names as compact IDs without umlauts or spaces
 * (e.g. "sinnesschaerfe" for "Sinnesschärfe", "kleinerbannstrahl" for
 * "Kleiner Bannstrahl"). These IDs do not match Foundry compendium names,
 * so item resolution fails. Map the known Dark Aid IDs to the canonical
 * Foundry names before compendium lookup.
 */
const DARK_AID_ITEM_NAME_MAP: Record<string, string> = {
  // Talente
  sinnesschaerfe: 'Sinnesschärfe',
  bekehrenueberzeugen: 'Bekehren & Überzeugen',
  einschuechtern: 'Einschüchtern',
  ueberreden: 'Überreden',
  fischenangeln: 'Fischen & Angeln',
  goetterkulte: 'Götter & Kulte',
  sagenlegenden: 'Sagen & Legenden',
  sphaerenkunde: 'Sphärenkunde',
  // Liturgien / Zeremonien / Segen
  kleinerbannstrahl: 'Kleiner Bannstrahl',
  machtvollerexorzismus: 'Machtvoller Exorzismus',
  glueckssegen: 'Glückssegen',
  kleinerheilsegen: 'Kleiner Heilsegen',
  kleinerschutzsegen: 'Kleiner Schutzsegen',
  staerkungssegen: 'Stärkungssegen',
  bannderdunkelheit: 'Bann der Dunkelheit',
  // Sonderfertigkeiten / Nachteile
  hoheseelenkraft: 'Hohe Seelenkraft',
  schwerzuverzaubern: 'Schwer zu verzaubern',
  unfaehig: 'Unfähig',
  persoenlichkeitsschwaeche: 'Persönlichkeitsschwäche (Vorurteile)',
  // Spezies / Kultur
  mittellaender: 'Mensch',
  mittelreicher: 'Mittelreich',
};

/** Map a Dark Aid item ID to its canonical Foundry name if known. */
const mapDarkAidItemName = (name: string): string =>
  DARK_AID_ITEM_NAME_MAP[normalizeName(name)] ?? name;

const uniqueNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const normalized = normalizeName(name);
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(name.trim());
  }
  return result;
};

const sanitizeEmbeddedDocuments = (docs: unknown): JsonRecord[] => {
  if (!Array.isArray(docs)) return [];
  return docs
    .filter((entry): entry is JsonRecord => isRecord(entry))
    .map(entry => {
      const cloned = { ...entry };
      delete cloned._id;
      delete cloned.folder;
      delete cloned.sort;
      return cloned;
    });
};

const addItemOverride = (
  itemOverrides: Record<string, ItemOverride>,
  sourceName: string,
  next: Partial<ItemOverride>
): void => {
  const normalized = normalizeName(sourceName);
  if (normalized.length === 0) return;
  const current = itemOverrides[normalized] ?? { sourceName };
  itemOverrides[normalized] = {
    ...current,
    ...next,
    sourceName: current.sourceName ?? sourceName,
  };
};

const collectTalentOverrides = (
  source: unknown,
  itemOverrides: Record<string, ItemOverride>
): void => {
  if (!Array.isArray(source)) return;
  for (const entry of source) {
    if (!isRecord(entry)) continue;
    const name = toStringValue(entry.name);
    const talentValue = toNumber(entry.talentwert);
    if (!name || talentValue === undefined) continue;
    addItemOverride(itemOverrides, name, { talentValue });
  }
};

const collectQuantityOverrides = (
  source: unknown,
  itemOverrides: Record<string, ItemOverride>
): void => {
  if (!Array.isArray(source)) return;
  for (const entry of source) {
    if (!isRecord(entry)) continue;
    const name = toStringValue(entry.name);
    const quantity = toNumber(getByKeys(entry, ['anzahl', 'menge', 'quantity']));
    if (!name || quantity === undefined) continue;
    addItemOverride(itemOverrides, name, { quantity: Math.max(0, Math.round(quantity)) });
  }
};

export const applyResolvedItemOverrides = (
  items: JsonRecord[],
  itemOverrides: Record<string, ItemOverride>
): { appliedCount: number; unappliedSourceNames: string[] } => {
  if (items.length === 0 || Object.keys(itemOverrides).length === 0) {
    return { appliedCount: 0, unappliedSourceNames: [] };
  }

  const matched = new Set<string>();
  let appliedCount = 0;

  for (const item of items) {
    const itemName = toStringValue(item.name);
    if (!itemName) continue;
    const normalized = normalizeName(itemName);
    const override = itemOverrides[normalized];
    if (!override) continue;

    if (!isRecord(item.system)) {
      item.system = {};
    }

    let touched = false;

    if (override.talentValue !== undefined) {
      const talentValue = isRecord((item.system as JsonRecord).talentValue)
        ? { ...((item.system as JsonRecord).talentValue as JsonRecord) }
        : {};
      talentValue.value = Math.round(override.talentValue);
      (item.system as JsonRecord).talentValue = talentValue;
      touched = true;
    }

    if (override.quantity !== undefined) {
      const quantity = isRecord((item.system as JsonRecord).quantity)
        ? { ...((item.system as JsonRecord).quantity as JsonRecord) }
        : {};
      quantity.value = Math.max(0, Math.round(override.quantity));
      (item.system as JsonRecord).quantity = quantity;
      touched = true;
    }

    if (touched) {
      matched.add(normalized);
      appliedCount += 1;
    }
  }

  const unappliedSourceNames = Object.entries(itemOverrides)
    .filter(([normalized]) => !matched.has(normalized))
    .map(([, override]) => override.sourceName);

  return {
    appliedCount,
    unappliedSourceNames: uniqueNames(unappliedSourceNames),
  };
};

const getSearchCandidates = (name: string): string[] => {
  const candidates = [
    name,
    name.replace(/\s*-\s*[ivx]+$/i, ''),
    name.replace(/\s+[ivx]+$/i, ''),
    name.replace(/\s*\([^)]*\)\s*/g, ' ').trim(),
  ]
    .map(candidate => candidate.trim())
    .filter(candidate => candidate.length > 0);

  return uniqueNames(candidates);
};

export const detectDSA5ImportFormat = (payload: JsonRecord): DSA5ImportFormat => {
  const normalizedPayload = normalizeInputKeys(payload);

  if (isRecord(normalizedPayload.system) && typeof normalizedPayload.type === 'string') {
    return 'raw_foundry';
  }

  const attr = normalizedPayload.attr;
  const optolithLike = isRecord(attr) && Array.isArray(attr.values);
  if (optolithLike) return 'optolith_like';

  const darkaidLike =
    Array.isArray(normalizedPayload.attributes) ||
    Array.isArray(normalizedPayload.skills) ||
    Array.isArray(normalizedPayload.chants) ||
    Array.isArray(normalizedPayload.baseValues);
  if (darkaidLike) return 'darkaid';

  const customLike =
    isRecord(normalizedPayload.attribute) ||
    Array.isArray(normalizedPayload.vorteile) ||
    Array.isArray(normalizedPayload.talente) ||
    Array.isArray(normalizedPayload.kampftechniken);
  if (customLike) return 'custom_dsa5';

  return 'unknown';
};

export const validateImportPayload = (
  payload: JsonRecord
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedFormat: DSA5ImportFormat;
  missingCriticalFields: string[];
  availableTopLevelKeys: string[];
} => {
  const normalizedPayload = normalizeInputKeys(payload);
  const detectedFormat = detectDSA5ImportFormat(normalizedPayload);
  const availableTopLevelKeys = Object.keys(normalizedPayload);
  const missingCriticalFields: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (detectedFormat === 'raw_foundry') {
    if (typeof normalizedPayload.type !== 'string') {
      missingCriticalFields.push('type');
    }
    if (!isRecord(normalizedPayload.system)) {
      missingCriticalFields.push('system');
    }
    if (missingCriticalFields.length > 0) {
      errors.push(`raw_foundry: Pflichtfelder fehlen (${missingCriticalFields.join(', ')}).`);
    }
  }

  if (detectedFormat === 'optolith_like') {
    if (!toStringValue(normalizedPayload.name)) {
      missingCriticalFields.push('name');
    }

    const attr = isRecord(normalizedPayload.attr) ? normalizedPayload.attr : undefined;
    const values = attr && Array.isArray(attr.values) ? attr.values : [];
    if (values.length === 0) {
      missingCriticalFields.push('attr.values');
    }

    if (missingCriticalFields.length > 0) {
      errors.push(`optolith_like: Pflichtfelder fehlen (${missingCriticalFields.join(', ')}).`);
    }

    const hasR = Boolean(toStringValue(normalizedPayload.r));
    const hasC = Boolean(toStringValue(normalizedPayload.c));
    const hasP = Boolean(toStringValue(normalizedPayload.p));
    if (!hasR || !hasC || !hasP) {
      warnings.push('Spezies/Kultur/Profession fehlen');
    }
    if (
      !isRecord(normalizedPayload.talents) ||
      Object.keys(normalizedPayload.talents).length === 0
    ) {
      warnings.push('Keine Talente gefunden');
    }
  }

  if (detectedFormat === 'custom_dsa5') {
    if (!toStringValue(normalizedPayload.name)) {
      missingCriticalFields.push('name');
    }

    const attribute = isRecord(normalizedPayload.attribute)
      ? normalizedPayload.attribute
      : undefined;
    const knownAttributeKeys = [
      'mut',
      'klugheit',
      'intuition',
      'charisma',
      'fingerfertigkeit',
      'gewandheit',
      'konstitution',
      'körperkraft',
      'koerperkraft',
    ];
    const hasKnownAttribute =
      attribute !== undefined && knownAttributeKeys.some(key => key in attribute);
    if (!hasKnownAttribute) {
      missingCriticalFields.push('attribute');
    }

    if (missingCriticalFields.length > 0) {
      errors.push(`custom_dsa5: Pflichtfelder fehlen (${missingCriticalFields.join(', ')}).`);
    }

    if (!isRecord(normalizedPayload.energien)) {
      warnings.push('Energien (Lebensenergie etc.) fehlen');
    }

    const hasTalente =
      Array.isArray(normalizedPayload.talente) && normalizedPayload.talente.length > 0;
    const hasVorteile =
      Array.isArray(normalizedPayload.vorteile) && normalizedPayload.vorteile.length > 0;
    const hasKampftechniken =
      Array.isArray(normalizedPayload.kampftechniken) &&
      normalizedPayload.kampftechniken.length > 0;
    if (!hasTalente && !hasVorteile && !hasKampftechniken) {
      warnings.push('Keine Items');
    }
  }

  if (detectedFormat === 'unknown') {
    const keyList = availableTopLevelKeys.length > 0 ? availableTopLevelKeys.join(', ') : '(keine)';
    errors.push(
      `Format nicht erkannt. Erkannte Felder: [${keyList}]. ` +
        `Unterstützte Formate: custom_dsa5, optolith_like, raw_foundry. ` +
        `Für custom_dsa5 wird mindestens 'name' + 'attribute' benötigt. ` +
        `Für optolith_like wird mindestens 'name' + 'attr.values' benötigt.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    detectedFormat,
    missingCriticalFields,
    availableTopLevelKeys,
  };
};

export const mapCustomDsa5Payload = (payload: JsonRecord): MappingResult => {
  const attribute = isRecord(payload.attribute) ? payload.attribute : {};
  const energien = isRecord(payload.energien) ? payload.energien : {};
  const itemOverrides: Record<string, ItemOverride> = {};

  const species = toStringValue(payload.spezies);
  const culture = toStringValue(payload.kultur);
  const profession = toStringValue(payload.profession);
  const socialStatus = toStringValue(payload.sozialstatus);
  const koValue = toNumber(attribute.konstitution);
  const lifeEnergy = toNumber(energien.lebensenergie);
  const derivedWoundsInitial =
    lifeEnergy !== undefined && koValue !== undefined
      ? Math.max(0, Math.round(lifeEnergy - koValue * 2))
      : undefined;

  const actorData: JsonRecord = {
    name: toStringValue(payload.name) ?? 'Imported DSA5 Character',
    type: 'character',
    system: {
      characteristics: {
        mu: { advances: characteristicAdvance(attribute.mut) ?? 0 },
        kl: { advances: characteristicAdvance(attribute.klugheit) ?? 0 },
        in: { advances: characteristicAdvance(attribute.intuition) ?? 0 },
        ch: { advances: characteristicAdvance(attribute.charisma) ?? 0 },
        ff: { advances: characteristicAdvance(attribute.fingerfertigkeit) ?? 0 },
        ge: { advances: characteristicAdvance(attribute.gewandheit) ?? 0 },
        ko: { advances: characteristicAdvance(attribute.konstitution) ?? 0 },
        kk: {
          advances:
            characteristicAdvance(getByKeys(attribute, ['körperkraft', 'koerperkraft'])) ?? 0,
        },
      },
      status: {
        wounds: {
          // DSA5 computes max LeP from wounds.initial + KO*2 (+modifiers).
          // Keep initial aligned with imported lifeEnergy to avoid 27/22 mismatches.
          initial: derivedWoundsInitial ?? 0,
          value: lifeEnergy ?? 0,
          max: lifeEnergy ?? 0,
        },
        astralenergy: {
          value: toNumber(energien.astralenergie) ?? 0,
          max: toNumber(energien.astralenergie) ?? 0,
        },
        karmaenergy: {
          value: toNumber(energien.karmaenergie) ?? 0,
          max: toNumber(energien.karmaenergie) ?? 0,
        },
        fatePoints: {
          value: toNumber(energien.schicksalspunkte) ?? 0,
          max: toNumber(energien.schicksalspunkte) ?? 0,
        },
      },
      details: {
        species: { value: species ?? '' },
        culture: { value: culture ?? '' },
        career: { value: profession ?? '' },
        socialstate: { value: socialStatus ?? '' },
        experience: {
          total: toNumber(payload.abenteuerpunkteGesammelt) ?? 0,
          spent: toNumber(payload.abenteuerpunkteAusgegeben) ?? 0,
          available: toNumber(payload.abenteuerpunkteGesamt) ?? 0,
        },
      },
    },
  };

  const nameBuckets: string[] = [];
  if (species) nameBuckets.push(species);
  if (culture) nameBuckets.push(culture);
  if (profession) nameBuckets.push(profession);

  const pushNames = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (isRecord(entry)) {
        const entryName = toStringValue(entry.name);
        if (entryName) nameBuckets.push(entryName);
      } else if (typeof entry === 'string' && entry.trim().length > 0) {
        nameBuckets.push(entry.trim());
      }
    }
  };

  pushNames(payload.vorteile);
  pushNames(payload.nachteile);
  pushNames(payload.sonderfertigkeiten);
  pushNames(payload.talente);
  pushNames(payload.kampftechniken);
  pushNames(payload.zauberUndLiturgien);
  pushNames(payload.nahkampfwaffen);
  pushNames(payload.fernkampfwaffen);
  pushNames(payload.gegenstände);
  pushNames(payload.sprachen);
  pushNames(payload.schriften);

  collectTalentOverrides(payload.talente, itemOverrides);
  collectTalentOverrides(payload.kampftechniken, itemOverrides);
  collectTalentOverrides(payload.zauberUndLiturgien, itemOverrides);
  collectQuantityOverrides(payload.nahkampfwaffen, itemOverrides);
  collectQuantityOverrides(payload.fernkampfwaffen, itemOverrides);
  collectQuantityOverrides(payload.gegenstände, itemOverrides);

  const warnings: string[] = [];
  if (!species)
    warnings.push('No species in payload; actor will be created with empty species field.');
  if (!culture)
    warnings.push('No culture in payload; actor will be created with empty culture field.');
  if (!profession)
    warnings.push('No profession in payload; actor will be created with empty profession field.');

  const knownRoots = new Set([
    'uid',
    'grösse',
    'größe',
    'grÃ¶sse',
    'name',
    'geschlecht',
    'spezies',
    'region',
    'kultur',
    'kulturpaket',
    'profession',
    'sozialstatus',
    'abenteuerpunkteGesammelt',
    'abenteuerpunkteAusgegeben',
    'abenteuerpunkteGesamt',
    'hintergrund',
    'attribute',
    'abgeleiteteWerte',
    'energien',
    'vorteile',
    'nachteile',
    'sonderfertigkeiten',
    'berufsgeheimnisse',
    'sprachen',
    'schriften',
    'talente',
    'kampftechniken',
    'zauberUndLiturgien',
    'objektrituale',
    'rüstungen',
    'nahkampfwaffen',
    'fernkampfwaffen',
    'gegenstände',
  ]);

  const unmappedFields = Object.keys(payload).filter(key => !knownRoots.has(key));

  return {
    actorData,
    candidateItemNames: uniqueNames(nameBuckets),
    itemOverrides,
    warnings,
    unmappedFields,
  };
};

export const mapDarkAidPayload = (payload: JsonRecord): MappingResult => {
  const attributes = Array.isArray(payload.attributes) ? payload.attributes : [];
  const skills = Array.isArray(payload.skills) ? payload.skills : [];
  const chants = Array.isArray(payload.chants) ? payload.chants : [];
  const combatTechniques = Array.isArray(payload.combatTechniques) ? payload.combatTechniques : [];
  const disadvantages = Array.isArray(payload.disadvantages) ? payload.disadvantages : [];
  const specialAbilities = Array.isArray(payload.specialAbilities) ? payload.specialAbilities : [];
  const baseValues = Array.isArray(payload.baseValues) ? payload.baseValues : [];
  const itemOverrides: Record<string, ItemOverride> = {};

  const normalize = (id: unknown): string =>
    fixMojibake(String(id ?? ''))
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const idToCharacteristic: Record<string, keyof typeof characteristicsMap> = {
    mut: 'mu',
    klugheit: 'kl',
    intuition: 'in',
    charisma: 'ch',
    fingerfertigkeit: 'ff',
    gewandheit: 'ge',
    gewandtheit: 'ge',
    konstitution: 'ko',
    körperkraft: 'kk',
    koerperkraft: 'kk',
  };
  const characteristics = {
    mu: { advances: 0 },
    kl: { advances: 0 },
    in: { advances: 0 },
    ch: { advances: 0 },
    ff: { advances: 0 },
    ge: { advances: 0 },
    ko: { advances: 0 },
    kk: { advances: 0 },
  };
  const characteristicsMap = characteristics;

  // Find KO for wound-initial derivation (aligns with custom_dsa5 mapping).
  let koLevel = 0;
  for (const entry of attributes) {
    if (!isRecord(entry)) continue;
    const id = normalize(getByKeys(entry, ['id', 'name']));
    const level = toNumber(getByKeys(entry, ['level', 'value']));
    if (!id || level === undefined) continue;
    const characteristicKey = idToCharacteristic[id];
    if (characteristicKey === 'ko') koLevel = Math.round(level);
  }

  for (const entry of attributes) {
    if (!isRecord(entry)) continue;
    const id = normalize(getByKeys(entry, ['id', 'name']));
    const level = toNumber(getByKeys(entry, ['level', 'value']));
    if (!id || level === undefined) continue;
    const characteristicKey = idToCharacteristic[id];
    if (characteristicKey) {
      characteristics[characteristicKey] = { advances: Math.round(level) - 8 };
    }
  }

  const species = toStringValue(payload.race);
  const culture = toStringValue(payload.culture);
  const profession = toStringValue(payload.profession);
  const socialStatus = toStringValue(payload.socialstatus);
  // Option A: Nur wounds.advances importieren, alles andere entfernt.
  // DSA5 rechnet wounds.initial, wounds.max, astralenergy, karmaenergy, fatePoints selbst
  // aus Spezies/Kultur/Abwertstufe.
  const actorData: JsonRecord = {
    name: toStringValue(payload.name) ?? 'Imported Dark Aid Character',
    type: 'character',
    system: {
      characteristics,
      status: {
        wounds: {
          advances: koLevel,
        },
      },
      details: {
        species: { value: species ?? '' },
        culture: { value: culture ?? '' },
        career: { value: profession ?? '' },
        socialstate: { value: socialStatus ?? '' },
        age: { value: toStringValue(payload.age) ?? '' },
        gender: { value: toStringValue(payload.sex) ?? '' },
        height: { value: toStringValue(payload.height) ?? '' },
        weight: { value: toStringValue(payload.weight) ?? '' },
        haircolor: { value: toStringValue(payload.haircolor) ?? '' },
        eyecolor: { value: toStringValue(payload.eyecolor) ?? '' },
        home: { value: toStringValue(payload.placeofbirth) ?? '' },
        experience: {
          total: xpTotal(payload) ?? 0,
        },
      },
    },
  };

  const nameBuckets: string[] = [];
  if (species) nameBuckets.push(mapDarkAidItemName(species));
  if (culture) nameBuckets.push(mapDarkAidItemName(culture));
  if (profession) nameBuckets.push(mapDarkAidItemName(profession));

  const pushArrayNames = (source: unknown) => {
    if (!Array.isArray(source)) return;
    for (const entry of source) {
      if (isRecord(entry)) {
        const name = toStringValue(getByKeys(entry, ['name', 'id']));
        if (name) nameBuckets.push(mapDarkAidItemName(name));
      } else if (typeof entry === 'string' && entry.trim().length > 0) {
        nameBuckets.push(mapDarkAidItemName(entry.trim()));
      }
    }
  };

  pushArrayNames(skills);
  pushArrayNames(chants);
  pushArrayNames(combatTechniques);
  pushArrayNames(disadvantages);
  pushArrayNames(specialAbilities);

  const collectTalentValue = (source: unknown, nameField: string, valueField: string) => {
    if (!Array.isArray(source)) return;
    for (const entry of source) {
      if (!isRecord(entry)) continue;
      const name = toStringValue(getByKeys(entry, ['name', nameField]));
      const value = toNumber(getByKeys(entry, ['level', valueField]));
      if (!name || value === undefined) continue;
      addItemOverride(itemOverrides, mapDarkAidItemName(name), { talentValue: Math.round(value) });
    }
  };

  collectTalentValue(skills, 'id', 'level');
  collectTalentValue(combatTechniques, 'id', 'level');
  collectTalentValue(chants, 'id', 'level');

  const warnings: string[] = [];
  if (!species)
    warnings.push('No species in payload; actor will be created with empty species field.');
  if (!culture)
    warnings.push('No culture in payload; actor will be created with empty culture field.');
  if (!profession)
    warnings.push('No profession in payload; actor will be created with empty profession field.');

  return {
    actorData,
    candidateItemNames: uniqueNames(nameBuckets),
    itemOverrides,
    warnings,
    unmappedFields: [],
  };
};

const getBaseValue = (baseValues: JsonRecord[], key: string): unknown => {
  for (const entry of baseValues) {
    if (!isRecord(entry)) continue;
    if (normalizeName(String(getByKeys(entry, ['id', 'name']))) === normalizeName(String(key))) {
      return getByKeys(entry, ['value', 'level']);
    }
  }
  return undefined;
};

const xpTotal = (payload: JsonRecord): number | undefined => {
  const xp = isRecord(payload.xp) ? payload.xp : undefined;
  if (!xp) return undefined;
  const startLevel = toStringValue(xp.startinglevel);
  if (!startLevel) return undefined;
  const map: Record<string, number> = {
    grundgeschickt: 0,
    geschickt: 1,
    kompetent: 2,
    beherrschend: 3,
    meister: 4,
  };
  const total = toNumber(getByKeys(xp, ['total', 'abenteuerpunkteGesamt', 'points']));
  if (total !== undefined) return Math.round(total);
  const mapped = map[startLevel.toLowerCase()];
  return mapped !== undefined ? mapped : undefined;
};

export const mapOptolithLikePayload = (payload: JsonRecord): MappingResult => {
  const attr = isRecord(payload.attr) ? payload.attr : {};
  const details = isRecord(payload.pers) ? payload.pers : {};
  const itemOverrides: Record<string, ItemOverride> = {};
  const candidateItemNames: string[] = [];
  const warnings: string[] = [];

  const characteristics: Record<string, { advances: number }> = {
    mu: { advances: 0 },
    kl: { advances: 0 },
    in: { advances: 0 },
    ch: { advances: 0 },
    ff: { advances: 0 },
    ge: { advances: 0 },
    ko: { advances: 0 },
    kk: { advances: 0 },
  };

  const attrValues = Array.isArray(attr.values) ? attr.values : [];
  const attrToCharacteristic: Record<string, keyof typeof characteristics> = {
    ATTR_1: 'mu',
    ATTR_2: 'kl',
    ATTR_3: 'in',
    ATTR_4: 'ch',
    ATTR_5: 'ff',
    ATTR_6: 'ge',
    ATTR_7: 'ko',
    ATTR_8: 'kk',
  };
  for (const entry of attrValues) {
    if (!isRecord(entry)) continue;
    const idRaw = toStringValue(entry.id);
    const value = toNumber(entry.value);
    if (!idRaw || value === undefined) continue;
    const characteristicKey = attrToCharacteristic[idRaw];
    if (characteristicKey) {
      characteristics[characteristicKey] = { advances: Math.round(value) - 8 };
    }
  }

  const speciesId = toStringValue(payload.r);
  const cultureId = toStringValue(payload.c);
  const professionId = toStringValue(payload.p);
  if (speciesId) candidateItemNames.push(speciesId);
  if (cultureId) candidateItemNames.push(cultureId);
  if (professionId) candidateItemNames.push(professionId);
  if (speciesId || cultureId || professionId) {
    warnings.push(
      'Spezies/Kultur/Profession sind als IDs gespeichert - Compendium-Suche kann davon abweichen.'
    );
  }

  const addIdBasedTalentValues = (source: unknown): boolean => {
    if (!isRecord(source)) return false;
    let detected = false;
    for (const [id, value] of Object.entries(source)) {
      const numeric = toNumber(value);
      if (numeric === undefined) continue;
      candidateItemNames.push(id);
      addItemOverride(itemOverrides, id, { talentValue: Math.round(numeric) });
      detected = true;
    }
    return detected;
  };

  const hasTalentIds = [
    addIdBasedTalentValues(payload.talents),
    addIdBasedTalentValues(payload.ct),
    addIdBasedTalentValues(payload.spells),
    addIdBasedTalentValues(payload.liturgies),
  ].some(Boolean);
  if (hasTalentIds) {
    warnings.push(
      'Talent-IDs (TAL_x) wurden übergeben - Compendium-Treffer hängen vom DSA5-System-Modul ab.'
    );
  }

  const pushArrayNames = (source: unknown) => {
    if (!Array.isArray(source)) return;
    for (const entry of source) {
      const name = toStringValue(entry);
      if (name) candidateItemNames.push(name);
    }
  };
  pushArrayNames(payload.cantrips);
  pushArrayNames(payload.blessings);

  if (isRecord(payload.activatable)) {
    for (const [id] of Object.entries(payload.activatable)) {
      candidateItemNames.push(id);
    }
  }

  const belongings = isRecord(payload.belongings) ? payload.belongings : {};
  const belongingsItems = isRecord(belongings.items) ? belongings.items : {};
  for (const [, itemData] of Object.entries(belongingsItems)) {
    if (!isRecord(itemData)) continue;
    const itemName = toStringValue(itemData.name);
    if (!itemName) continue;
    candidateItemNames.push(itemName);
    const amount = toNumber(itemData.amount);
    if (amount !== undefined) {
      addItemOverride(itemOverrides, itemName, { quantity: Math.max(0, Math.round(amount)) });
    }
  }

  const actorData: JsonRecord = {
    name: toStringValue(payload.name) ?? 'Imported Optolith Character',
    type: 'character',
    system: {
      characteristics,
      status: {
        wounds: {
          advances: toNumber(attr.lp) ?? 0,
        },
        astralenergy: {
          advances: toNumber(attr.ae) ?? 0,
          permanentLoss: toNumber(getNested(attr, 'permanentAE.lost')) ?? 0,
          rebuy: toNumber(getNested(attr, 'permanentAE.redeemed')) ?? 0,
        },
        karmaenergy: {
          advances: toNumber(attr.kp) ?? 0,
          permanentLoss: toNumber(getNested(attr, 'permanentKP.lost')) ?? 0,
          rebuy: toNumber(getNested(attr, 'permanentKP.redeemed')) ?? 0,
        },
      },
      details: {
        species: { value: speciesId ?? '' },
        culture: { value: cultureId ?? '' },
        career: { value: professionId ?? '' },
        socialstate: { value: toStringValue(details.socialstatus) ?? '' },
        age: { value: toStringValue(details.age) ?? '' },
        gender: { value: toStringValue(payload.sex) ?? '' },
        home: { value: toStringValue(details.placeofbirth) ?? '' },
        family: { value: toStringValue(details.family) ?? '' },
        haircolor: { value: toStringValue(details.haircolor) ?? '' },
        eyecolor: { value: toStringValue(details.eyecolor) ?? '' },
        height: { value: toStringValue(details.height) ?? '' },
        weight: { value: toStringValue(details.weight) ?? '' },
        characteristics: { value: toStringValue(details.characteristics) ?? '' },
        experience: {
          total: toNumber(isRecord(payload.ap) ? payload.ap.total : undefined) ?? 0,
        },
      },
    },
  };

  return {
    actorData,
    candidateItemNames: uniqueNames(candidateItemNames),
    itemOverrides,
    warnings,
    unmappedFields: [],
  };
};

const sanitizeActorPayload = (payload: JsonRecord): JsonRecord => {
  const actorData: JsonRecord = { ...payload };

  delete actorData._id;
  delete actorData.folder;
  delete actorData.sort;

  actorData.items = sanitizeEmbeddedDocuments(actorData.items);
  actorData.effects = sanitizeEmbeddedDocuments(actorData.effects);

  if (!actorData.name || typeof actorData.name !== 'string') {
    actorData.name = 'Imported Actor';
  }

  if (!actorData.type || typeof actorData.type !== 'string') {
    actorData.type = 'character';
  }

  if (!isRecord(actorData.system)) {
    actorData.system = {};
  }

  const prototypeToken = isRecord(actorData.prototypeToken) ? actorData.prototypeToken : undefined;
  const texture =
    prototypeToken && isRecord(prototypeToken.texture) ? prototypeToken.texture : undefined;
  const src = texture && typeof texture.src === 'string' ? texture.src : undefined;
  if (src && src.startsWith('http')) {
    texture!.src = null;
  }

  return actorData;
};

const extractPayload = async (
  jsonPayload: unknown,
  filePath: string | undefined
): Promise<JsonRecord> => {
  let parsed: unknown = jsonPayload;

  if (!parsed && filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    parsed = JSON.parse(content);
  }

  if (typeof parsed === 'string') {
    parsed = JSON.parse(parsed);
  }

  if (!isRecord(parsed)) {
    throw new Error('Payload must resolve to a JSON object.');
  }

  return parsed;
};

interface ResolvedItemsResult {
  items: JsonRecord[];
  unresolvedNames: string[];
  resolvedCount: number;
}

export class DSA5JsonActorImporter {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: DSA5JsonActorImporterOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'DSA5JsonActorImporter' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  getToolDefinitions() {
    return [
      {
        name: 'import-dsa5-actor-from-json',
        description:
          'Import a custom DSA5 actor JSON using multiple strategies (auto/custom_dsa5/optolith_like/raw_foundry). Supports file path or inline JSON payload. Best-effort item resolution is performed via compendium name lookup and unresolved entries are returned as warnings.',
        inputSchema: {
          type: 'object',
          properties: {
            jsonPayload: {
              oneOf: [{ type: 'string' }, { type: 'object' }],
              description:
                'Inline JSON content as object or string. Optional if filePath is provided.',
            },
            filePath: {
              type: 'string',
              description:
                'Local file path to a JSON file readable by the MCP server process. Optional if jsonPayload is provided.',
            },
            strategy: {
              type: 'string',
              enum: ['auto', 'custom_dsa5', 'optolith_like', 'raw_foundry'],
              default: 'auto',
              description: 'Import strategy. auto detects format and chooses mapping path.',
            },
            resolveItems: {
              type: 'boolean',
              default: true,
              description:
                'Try resolving item-like entries by name from compendiums and embed them into the created actor.',
            },
            addToScene: {
              type: 'boolean',
              default: false,
              description: 'Add created actor to active scene as token.',
            },
            updateExisting: {
              type: 'boolean',
              default: true,
              description:
                'If true, update an existing actor (same name by default) instead of creating a duplicate.',
            },
            existingActorIdentifier: {
              type: 'string',
              description:
                'Optional actor ID or exact name used when updateExisting is true. Defaults to imported name.',
            },
            strict: {
              type: 'boolean',
              default: false,
              description:
                'If true, unresolved item names abort the import instead of returning warnings.',
            },
          },
        },
      },
    ];
  }

  async handleImportActorFromJson(args: unknown): Promise<Record<string, unknown>> {
    const schema = z
      .object({
        jsonPayload: z.union([z.string(), z.record(z.unknown())]).optional(),
        filePath: z.string().optional(),
        strategy: z
          .enum(['auto', 'custom_dsa5', 'optolith_like', 'raw_foundry', 'darkaid'])
          .default('auto'),
        resolveItems: z.boolean().default(true),
        addToScene: z.boolean().default(false),
        updateExisting: z.boolean().default(true),
        existingActorIdentifier: z.string().optional(),
        strict: z.boolean().default(false),
      })
      .refine(value => Boolean(value.jsonPayload) || Boolean(value.filePath), {
        message: 'Either jsonPayload or filePath is required.',
      });

    const {
      jsonPayload,
      filePath,
      strategy,
      resolveItems,
      addToScene,
      updateExisting,
      existingActorIdentifier,
      strict,
    } = schema.parse(args);

    try {
      await this.assertDsa5World();

      const payload = await extractPayload(jsonPayload, filePath);
      const normalizedPayload = normalizeInputKeys(payload);
      const validation = validateImportPayload(normalizedPayload);

      const detectedFormat = validation.detectedFormat;
      const selectedFormat = strategy === 'auto' ? detectedFormat : strategy;

      if (strategy === 'auto' && validation.errors.length > 0) {
        return {
          success: false,
          error: validation.errors.join(' | '),
          detectedFormat: validation.detectedFormat,
          availableTopLevelKeys: validation.availableTopLevelKeys,
        };
      }

      let mappingResult: MappingResult;
      switch (selectedFormat) {
        case 'raw_foundry':
          mappingResult = {
            actorData: sanitizeActorPayload(normalizedPayload),
            candidateItemNames: [],
            itemOverrides: {},
            warnings: [],
            unmappedFields: [],
          };
          break;
        case 'optolith_like':
          mappingResult = mapOptolithLikePayload(normalizedPayload);
          break;
        case 'custom_dsa5':
          mappingResult = mapCustomDsa5Payload(normalizedPayload);
          break;
        case 'darkaid':
          mappingResult = mapDarkAidPayload(normalizedPayload);
          break;
        default:
          throw new Error(
            `Could not detect supported JSON format. Detected format: ${detectedFormat}. Use strategy override if needed.`
          );
      }

      const warnings = Array.from(new Set([...validation.warnings, ...mappingResult.warnings]));
      const unresolvedItemNames: string[] = [];
      let appliedItemOverrides = 0;
      let unappliedItemOverrideNames: string[] = [];

      if (resolveItems && mappingResult.candidateItemNames.length > 0) {
        const resolved = await this.resolveItemsByName(mappingResult.candidateItemNames);
        unresolvedItemNames.push(...resolved.unresolvedNames);
        if (resolved.items.length > 0) {
          const existingItems = Array.isArray(mappingResult.actorData.items)
            ? sanitizeEmbeddedDocuments(mappingResult.actorData.items)
            : [];
          mappingResult.actorData.items = [...existingItems, ...resolved.items];
        }

        if (resolved.unresolvedNames.length > 0) {
          warnings.push(
            `Unresolved item names (${resolved.unresolvedNames.length}): ${resolved.unresolvedNames.join(', ')}`
          );
        }
      }

      const actorItems = Array.isArray(mappingResult.actorData.items)
        ? sanitizeEmbeddedDocuments(mappingResult.actorData.items)
        : [];
      if (actorItems.length > 0 && Object.keys(mappingResult.itemOverrides).length > 0) {
        const overrideResult = applyResolvedItemOverrides(actorItems, mappingResult.itemOverrides);
        appliedItemOverrides = overrideResult.appliedCount;
        unappliedItemOverrideNames = overrideResult.unappliedSourceNames;
        mappingResult.actorData.items = actorItems;

        if (overrideResult.unappliedSourceNames.length > 0) {
          warnings.push(
            `Unapplied value overrides (${overrideResult.unappliedSourceNames.length}): ${overrideResult.unappliedSourceNames.join(', ')}`
          );
        }
      }

      if (strict && unresolvedItemNames.length > 0) {
        throw new Error(
          `Strict import aborted because ${unresolvedItemNames.length} item names could not be resolved.`
        );
      }

      const creationResult = await this.foundryClient.query(
        'foundry-mcp-bridge.createActorFromData',
        {
          actorData: sanitizeActorPayload(mappingResult.actorData),
          addToScene,
          updateExisting,
          existingActorIdentifier:
            existingActorIdentifier ?? String(mappingResult.actorData.name ?? ''),
          ...(updateExisting ? { preserveItemTypes: ['species', 'culture', 'career'] } : {}),
        }
      );

      const actor =
        isRecord(creationResult) && isRecord(creationResult.actor) ? creationResult.actor : {};

      return {
        success: true,
        summary: `Imported actor "${String(actor.name ?? mappingResult.actorData.name)}" using ${selectedFormat}.`,
        import: {
          selectedFormat,
          detectedFormat,
          strategy,
          resolveItems,
          updateExisting,
          existingActorIdentifier,
          strict,
          source: filePath ? `file:${filePath}` : 'jsonPayload',
        },
        actor,
        warnings,
        unmappedFields: mappingResult.unmappedFields,
        unresolvedItemNames,
        valueOverrides: {
          total: Object.keys(mappingResult.itemOverrides).length,
          applied: appliedItemOverrides,
          unapplied: unappliedItemOverrideNames.length,
          unappliedNames: unappliedItemOverrideNames,
        },
        message:
          `Import completed via ${selectedFormat}.\n` +
          `Warnings: ${warnings.length}\n` +
          `Unmapped root fields: ${mappingResult.unmappedFields.length}`,
      };
    } catch (error) {
      this.errorHandler.handleToolError(error, 'import-dsa5-actor-from-json', 'JSON import');
    }
  }

  private async assertDsa5World(): Promise<void> {
    const worldInfo = await this.foundryClient.query('foundry-mcp-bridge.getWorldInfo');
    const systemIdRaw =
      isRecord(worldInfo) && typeof worldInfo.system === 'string' ? worldInfo.system : undefined;
    const systemId = systemIdRaw?.toLowerCase();

    if (systemId && systemId !== 'dsa5') {
      throw new Error(
        `import-dsa5-actor-from-json supports only DSA5 worlds. Detected system: ${systemIdRaw}.`
      );
    }
  }

  private async resolveItemsByName(itemNames: string[]): Promise<ResolvedItemsResult> {
    const unique = uniqueNames(itemNames).slice(0, 120);
    const resolvedItems: JsonRecord[] = [];
    const unresolved: string[] = [];

    for (const candidateName of unique) {
      try {
        const searchCandidates = getSearchCandidates(candidateName);
        let selected: unknown;

        for (const searchName of searchCandidates) {
          const searchResponse = await this.foundryClient.query(
            'foundry-mcp-bridge.searchCompendium',
            {
              query: searchName,
              packType: 'Item',
            }
          );

          if (!Array.isArray(searchResponse) || searchResponse.length === 0) {
            continue;
          }

          const exact = searchResponse.find((entry: unknown) => {
            if (!isRecord(entry)) return false;
            const name = toStringValue(entry.name);
            if (!name) return false;
            const normalizedItemName = normalizeName(name);
            return (
              normalizedItemName === normalizeName(candidateName) ||
              normalizedItemName === normalizeName(searchName)
            );
          });

          // Avoid false positives like mapping "Piken" -> "Pikenwall".
          // Only accept normalized exact matches and treat all other hits as unresolved.
          selected = exact;
          if (selected) break;
        }

        if (!isRecord(selected)) {
          unresolved.push(candidateName);
          continue;
        }

        const packId = toStringValue(selected.pack);
        const itemId = toStringValue(selected.id);
        if (!packId || !itemId) {
          unresolved.push(candidateName);
          continue;
        }

        const full = await this.foundryClient.query(
          'foundry-mcp-bridge.getCompendiumDocumentFull',
          {
            packId,
            documentId: itemId,
          }
        );

        if (!isRecord(full) || !isRecord(full.fullData)) {
          unresolved.push(candidateName);
          continue;
        }

        const itemData = sanitizeEmbeddedDocuments([full.fullData])[0];
        if (!itemData) {
          unresolved.push(candidateName);
          continue;
        }

        resolvedItems.push(itemData);
      } catch (error) {
        this.logger.warn('Item resolution failed during import', {
          candidateName,
          error: error instanceof Error ? error.message : String(error),
        });
        unresolved.push(candidateName);
      }
    }

    return {
      items: resolvedItems,
      unresolvedNames: unresolved,
      resolvedCount: resolvedItems.length,
    };
  }
}
