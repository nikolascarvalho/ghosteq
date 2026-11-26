// Presets de curva em JSON: serializar, validar e migrar versões antigas.
// Analogia: é a camada de "schema evolution" de um data lake. Todo arquivo
// carrega a versão do schema; ao ler, aplicamos migrações v1→v2→… até a atual,
// e só então validamos. Arquivos de versão FUTURA são recusados (não sabemos ler).
import {
  CURVE_SCHEMA_VERSION,
  EQ_MODES,
  FILTER_TYPES,
  LIMITS,
  type Band,
  type CurveConfig,
} from '../model/curve';

export const PRESET_FORMAT = 'ghosteq-preset';

/** Arquivo de preset (.json) = envelope com metadados + a curva. */
export interface PresetFile {
  format: typeof PRESET_FORMAT;
  name: string;
  savedAt: string;
  curve: CurveConfig;
}

/** Migração de uma versão N para N+1. Recebe JSON "cru" (já objeto). */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registro de migrações: chave = versão de origem. Hoje vazio (só existe a v1).
 * Exemplo futuro: `1: (c) => ({ ...c, schemaVersion: 2, novoCampo: padrão })`.
 */
export const MIGRATIONS: Record<number, Migration> = {};

export type ParseResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function clamp(v: number, { min, max }: { min: number; max: number }): number {
  return Math.min(max, Math.max(min, v));
}

/** Aplica as migrações até a versão atual. */
export function migrateCurve(
  raw: Record<string, unknown>,
  migrations: Record<number, Migration> = MIGRATIONS,
  targetVersion: number = CURVE_SCHEMA_VERSION,
): ParseResult<Record<string, unknown>> {
  let current = raw;
  const declared = current.schemaVersion;
  if (!isNum(declared) || !Number.isInteger(declared) || declared < 1) {
    return { ok: false, errors: ['schemaVersion ausente ou inválido.'] };
  }
  let version: number = declared;
  if (version > targetVersion) {
    return {
      ok: false,
      errors: [`Preset feito numa versão mais nova do GhostEQ (schema ${version}). Atualize o app.`],
    };
  }
  const warnings: string[] = [];
  while (version < targetVersion) {
    const step = migrations[version];
    if (!step) return { ok: false, errors: [`Sem migração do schema ${version} para ${version + 1}.`] };
    current = step(current);
    warnings.push(`Preset migrado do schema ${version} para ${version + 1}.`);
    version = version + 1;
    current = { ...current, schemaVersion: version };
  }
  return { ok: true, value: current, warnings };
}

/** Valida (e normaliza) uma curva já na versão atual. Valores fora da faixa são ajustados, com aviso. */
export function validateCurve(raw: Record<string, unknown>): ParseResult<CurveConfig> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const mode = raw.mode;
  if (typeof mode !== 'string' || !(EQ_MODES as readonly string[]).includes(mode)) {
    errors.push(`Modo inválido: ${String(mode)}.`);
  }
  if (typeof raw.devicePresetId !== 'string' || raw.devicePresetId === '') {
    errors.push('devicePresetId ausente.');
  }
  let outputGainDb = 0;
  if (raw.outputGainDb !== undefined) {
    if (!isNum(raw.outputGainDb)) errors.push('outputGainDb precisa ser número.');
    else outputGainDb = raw.outputGainDb;
  }
  if (raw.modeState !== undefined && !isObject(raw.modeState)) errors.push('modeState precisa ser objeto.');
  if (!Array.isArray(raw.bands)) errors.push('bands precisa ser uma lista.');

  const bands: Band[] = [];
  const ids = new Set<string>();
  if (Array.isArray(raw.bands)) {
    if (raw.bands.length > LIMITS.maxBands) errors.push(`Máximo de ${LIMITS.maxBands} bandas.`);
    raw.bands.forEach((b, i) => {
      const where = `Banda ${i + 1}`;
      if (!isObject(b)) return void errors.push(`${where}: formato inválido.`);
      if (typeof b.type !== 'string' || !(FILTER_TYPES as readonly string[]).includes(b.type)) {
        return void errors.push(`${where}: tipo inválido (${String(b.type)}).`);
      }
      if (!isNum(b.freq) || !isNum(b.gainDb) || !isNum(b.q)) {
        return void errors.push(`${where}: freq, gainDb e q precisam ser números.`);
      }
      let id = typeof b.id === 'string' && b.id !== '' ? b.id : `band-${i + 1}`;
      if (ids.has(id)) id = `${id}-${i + 1}`;
      ids.add(id);
      const band: Band = {
        id,
        type: b.type as Band['type'],
        freq: clamp(b.freq, LIMITS.freq),
        gainDb: clamp(b.gainDb, LIMITS.gainDb),
        q: clamp(b.q, LIMITS.q),
        enabled: b.enabled !== false,
      };
      if (band.freq !== b.freq || band.gainDb !== b.gainDb || band.q !== b.q) {
        warnings.push(`${where}: valores fora da faixa foram ajustados.`);
      }
      bands.push(band);
    });
  }

  if (errors.length) return { ok: false, errors };
  const clampedGain = clamp(outputGainDb, LIMITS.outputGainDb);
  if (clampedGain !== outputGainDb) warnings.push('Ganho de saída fora da faixa foi ajustado.');

  let customDevice: CurveConfig['customDevice'];
  if (isObject(raw.customDevice)) {
    const { sampleRate, irLength } = raw.customDevice;
    if (isNum(sampleRate) && isNum(irLength)) {
      customDevice = {
        sampleRate: Math.round(clamp(sampleRate, LIMITS.customSampleRate)),
        irLength: Math.round(clamp(irLength, LIMITS.customIrLength)),
      };
    } else {
      warnings.push('customDevice inválido foi ignorado.');
    }
  }

  const curve: CurveConfig = {
    schemaVersion: CURVE_SCHEMA_VERSION,
    mode: mode as CurveConfig['mode'],
    bands,
    outputGainDb: clampedGain,
    devicePresetId: raw.devicePresetId as string,
    ...(isObject(raw.modeState) ? { modeState: raw.modeState } : {}),
    ...(customDevice ? { customDevice } : {}),
  };
  return { ok: true, value: curve, warnings };
}

/** Lê um curva vinda de qualquer fonte (arquivo, IndexedDB): migra e valida. */
export function parseCurve(raw: unknown, migrations?: Record<number, Migration>): ParseResult<CurveConfig> {
  if (!isObject(raw)) return { ok: false, errors: ['Curva precisa ser um objeto JSON.'] };
  const migrated = migrateCurve(raw, migrations);
  if (!migrated.ok) return migrated;
  const validated = validateCurve(migrated.value);
  if (!validated.ok) return validated;
  return { ...validated, warnings: [...migrated.warnings, ...validated.warnings] };
}

export function serializePreset(name: string, curve: CurveConfig, now = new Date()): string {
  const file: PresetFile = { format: PRESET_FORMAT, name, savedAt: now.toISOString(), curve };
  return JSON.stringify(file, null, 2);
}

/** Lê o texto de um arquivo .json de preset. */
export function parsePresetFile(
  text: string,
  migrations?: Record<number, Migration>,
): ParseResult<PresetFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Arquivo não é um JSON válido.'] };
  }
  if (!isObject(raw) || raw.format !== PRESET_FORMAT) {
    return { ok: false, errors: ['Arquivo não é um preset do GhostEQ.'] };
  }
  const curve = parseCurve(raw.curve, migrations);
  if (!curve.ok) return curve;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Sem nome';
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : new Date(0).toISOString();
  return {
    ok: true,
    value: { format: PRESET_FORMAT, name, savedAt, curve: curve.value },
    warnings: curve.warnings,
  };
}
