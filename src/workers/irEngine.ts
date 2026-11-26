// Motor de cálculo do IR: recebe a curva e devolve TUDO que a interface precisa
// (IR final, curvas alvo/real, desvios, formato de exportação). Função pura:
// roda igual no Web Worker, nos testes e no script de linha de comando.
import { resolveDevice } from '../config/devices';
import {
  buildIr,
  cascadeMagnitudeDb,
  compareCurves,
  dbToGain,
  designCascade,
  deviationAt,
  filterCascade,
  irMagnitudeDb,
  logFrequencies,
  peakAbs,
  resampleIr,
  smoothedMagnitudeDb,
  truncateWithFade,
  type DeviationReport,
} from '../dsp';
import { chooseExportFormat, type ExportFormatChoice, type WavSampleFormat } from '../io/wavEncode';
import { activeSpecs, type CurveConfig } from '../model/curve';

/** Desvio acima disso marca a banda como "imprecisa neste aparelho". */
export const IMPRECISE_THRESHOLD_DB = 3;
/** Desvio acima disso gera aviso geral na curva. */
export const WARNING_THRESHOLD_DB = 1;
export const CURVE_POINTS = 256;

/** IR de caixa (já em mono) a ser juntado com o EQ. */
export interface CabInput {
  samples: Float32Array;
  sampleRate: number;
}

export interface IrRequest {
  id: number;
  curve: CurveConfig;
  preferredFormat?: WavSampleFormat;
  /** Se presente: resultado = caixa passada pelo EQ, num único IR. */
  cab?: CabInput;
}

/** Suavização usada nas curvas quando há caixa (1/12 de oitava). */
export const CAB_SMOOTHING = 1 / 12;
/** Amostras extras da caixa além do tamanho final (cobre o "ringing" do resample). */
const CAB_MARGIN = 128;

/**
 * Prepara a caixa para o aparelho: corta só o trecho necessário, faz resample
 * para a taxa do aparelho (se preciso) e devolve exatamente `length` amostras
 * (completando com zeros se a caixa for mais curta).
 */
export function prepareCab(cab: CabInput, fs: number, length: number): Float64Array {
  const needed = Math.ceil(((length + CAB_MARGIN) * cab.sampleRate) / fs);
  const src = cab.samples.subarray(0, Math.min(cab.samples.length, needed));
  const atFs = cab.sampleRate === fs ? Float64Array.from(src) : resampleIr(src, cab.sampleRate, fs);
  const out = new Float64Array(length);
  out.set(atFs.subarray(0, length));
  return out;
}

export interface BandDeviation {
  bandId: string;
  deviationDb: number;
  imprecise: boolean;
}

export interface IrComputation {
  id: number;
  sampleRate: number;
  length: number;
  /** Ganho de saída usado neste cálculo (o gráfico desenha a forma do EQ sem ele). */
  outputGainDb: number;
  /** IR final (exatamente o que é exportado e usado no ConvolverNode). */
  ir: Float64Array;
  peak: number;
  exportFormat: ExportFormatChoice;
  /** Eixo de frequências (log, 20 Hz–20 kHz) das curvas abaixo. */
  freqs: Float64Array;
  /** Curva pedida. Com caixa: caixa (no aparelho) + EQ. */
  targetDb: Float64Array;
  /** Curva real do IR final (com caixa: suavizada em 1/12 de oitava). */
  realDb: Float64Array;
  /** Só com caixa: a curva da caixa sozinha, como o aparelho a tocaria (truncada). */
  cabDb?: Float64Array;
  /** Só com caixa: a curva do EQ sozinho (analítica, com ganho de saída). */
  eqDb?: Float64Array;
  deviation: DeviationReport;
  bandDeviations: BandDeviation[];
  computeMs: number;
}

export function computeIr(req: IrRequest): IrComputation {
  const t0 = performance.now();
  const { curve } = req;
  const device = resolveDevice(curve.devicePresetId, curve.customDevice);
  const fs = device.sampleRate;

  const sections = designCascade(activeSpecs(curve), fs);
  const length = device.irLength;
  const freqs = logFrequencies(CURVE_POINTS, 20, Math.min(20000, fs * 0.45));
  const eqDb = cascadeMagnitudeDb(sections, freqs, fs, curve.outputGainDb);

  let ir: Float64Array;
  let peak: number;
  let targetDb: Float64Array;
  let realDb: Float64Array;
  let cabDb: Float64Array | undefined;

  if (!req.cab) {
    ({ ir, peak } = buildIr(sections, { length, gainDb: curve.outputGainDb }));
    targetDb = eqDb;
    realDb = irMagnitudeDb(ir, freqs, fs);
  } else {
    // Caixa + EQ: passar a caixa pela cascata de biquads é o mesmo que convoluir
    // a caixa com o IR do EQ — e já sai com o comprimento certo.
    const cab = prepareCab(req.cab, fs, length);
    const shaped = filterCascade(sections, cab);
    const g = dbToGain(curve.outputGainDb);
    for (let i = 0; i < shaped.length; i++) shaped[i]! *= g;
    ir = truncateWithFade(shaped, length);
    peak = peakAbs(ir);
    cabDb = smoothedMagnitudeDb(truncateWithFade(cab, length), freqs, fs, CAB_SMOOTHING);
    realDb = smoothedMagnitudeDb(ir, freqs, fs, CAB_SMOOTHING);
    targetDb = cabDb.map((c, i) => c + eqDb[i]!);
  }
  // O ganho de saída desloca as duas curvas igualmente; o piso é relativo a ele.
  const deviation = compareCurves(freqs, targetDb, realDb, {
    thresholdDb: WARNING_THRESHOLD_DB,
    floorDb: curve.outputGainDb - 24,
  });

  const bandDeviations: BandDeviation[] = curve.bands
    .filter((b) => b.enabled)
    .map((b) => {
      const d = deviationAt(freqs, targetDb, realDb, b.freq);
      return { bandId: b.id, deviationDb: d, imprecise: Math.abs(d) > IMPRECISE_THRESHOLD_DB };
    });

  return {
    id: req.id,
    sampleRate: fs,
    length,
    outputGainDb: curve.outputGainDb,
    ir,
    peak,
    exportFormat: chooseExportFormat(peak, req.preferredFormat),
    freqs,
    targetDb,
    realDb,
    ...(cabDb ? { cabDb, eqDb } : {}),
    deviation,
    bandDeviations,
    computeMs: performance.now() - t0,
  };
}

/** Buffers que podem ser "transferidos" (movidos sem cópia) entre threads. */
export function transferables(r: IrComputation): ArrayBuffer[] {
  const arrays = [r.ir, r.freqs, r.targetDb, r.realDb, r.cabDb, r.eqDb].filter(
    (a): a is Float64Array => a !== undefined,
  );
  // Sem caixa, targetDb e eqDb não existem separados; evita transferir o mesmo buffer 2×.
  return [...new Set(arrays.map((a) => a.buffer as ArrayBuffer))];
}
