import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CURVE_SCHEMA_VERSION, flatCurve, type CurveConfig } from '../../src/model/curve';
import {
  migrateCurve,
  parseCurve,
  parsePresetFile,
  serializePreset,
  type Migration,
} from '../../src/io/presetsJson';
import { deletePreset, listPresets, loadPreset, newPresetId, savePreset } from '../../src/io/presetsDb';

const curve: CurveConfig = {
  schemaVersion: 1,
  mode: 'parametric',
  bands: [
    { id: 'a', type: 'peak', freq: 3000, gainDb: -5, q: 1.4, enabled: true },
    { id: 'b', type: 'hpf24', freq: 80, gainDb: 0, q: 0.707, enabled: false },
  ],
  outputGainDb: 9,
  devicePresetId: 'nano-cortex',
};

describe('presets JSON', () => {
  it('ida e volta preserva a curva', () => {
    const text = serializePreset('Meu EQ', curve, new Date('2026-11-26T12:00:00Z'));
    const r = parsePresetFile(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('Meu EQ');
    expect(r.value.savedAt).toBe('2026-11-26T12:00:00.000Z');
    expect(r.value.curve).toEqual(curve);
    expect(r.warnings).toEqual([]);
  });

  it('recusa JSON inválido e arquivo que não é preset', () => {
    expect(parsePresetFile('{oops').ok).toBe(false);
    expect(parsePresetFile('{"format":"outra-coisa"}').ok).toBe(false);
  });

  it('recusa tipo de banda e modo desconhecidos', () => {
    const bad = { ...curve, mode: 'magic', bands: [{ ...curve.bands[0], type: 'fuzz' }] };
    const r = parseCurve(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/Modo inválido/);
    expect(r.errors.join(' ')).toMatch(/tipo inválido/);
  });

  it('ajusta valores fora da faixa com aviso', () => {
    const r = parseCurve({ ...curve, bands: [{ ...curve.bands[0], gainDb: 99, freq: 1 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bands[0]!.gainDb).toBe(36);
    expect(r.value.bands[0]!.freq).toBe(10);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('recusa schema de versão futura', () => {
    const r = parseCurve({ ...curve, schemaVersion: CURVE_SCHEMA_VERSION + 1 });
    expect(r.ok).toBe(false);
  });

  it('recusa schemaVersion ausente', () => {
    const noVersion: Record<string, unknown> = { ...curve };
    delete noVersion.schemaVersion;
    expect(parseCurve(noVersion).ok).toBe(false);
  });

  it('aplica a cadeia de migrações em ordem (v1 → v2 → v3)', () => {
    const migrations: Record<number, Migration> = {
      1: (c) => ({ ...c, renamed: c.outputGainDb }),
      2: (c) => ({ ...c, extra: 'ok' }),
    };
    const r = migrateCurve({ ...curve }, migrations, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schemaVersion).toBe(3);
    expect(r.value.renamed).toBe(9);
    expect(r.value.extra).toBe('ok');
    expect(r.warnings).toHaveLength(2);
  });

  it('falha se faltar uma migração no meio da cadeia', () => {
    expect(migrateCurve({ ...curve }, { 2: (c) => c }, 3).ok).toBe(false);
  });
});

describe('presets no IndexedDB', () => {
  it('salva, lista (mais recente primeiro), carrega e apaga', async () => {
    const id1 = newPresetId();
    const id2 = newPresetId();
    await savePreset({ id: id1, name: 'Antigo', savedAt: '2026-01-01T00:00:00Z', curve });
    await savePreset({ id: id2, name: 'Novo', savedAt: '2026-06-01T00:00:00Z', curve: flatCurve('helix') });

    const list = await listPresets();
    expect(list.map((p) => p.name)).toEqual(['Novo', 'Antigo']);

    const loaded = await loadPreset(id1);
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) expect(loaded.value.curve).toEqual(curve);

    await deletePreset(id1);
    expect(await loadPreset(id1)).toBeNull();
    expect((await listPresets()).map((p) => p.id)).toEqual([id2]);
  });
});
