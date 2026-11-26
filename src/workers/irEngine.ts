// Motor de cálculo do IR: recebe a curva e devolve TUDO que a interface precisa
// (IR final, curvas alvo/real, desvios, formato de exportação). Função pura:
// roda igual no Web Worker, nos testes e no script de linha de comando.
import { resolveDevice } from '../config/devices';
import {
  buildIr,
  cascadeMagnitudeDb,
  compareCurves,
  designCascade,
  deviationAt,
  irMagnitudeDb,
  logFrequencies,
  type DeviationReport,
} from '../dsp';
import { chooseExportFormat, type ExportFormatChoice, type WavSampleFormat } from '../io/wavEncode';
import { activeSpecs, type CurveConfig } from '../model/curve';

/** Desvio acima disso marca a banda como "imprecisa neste aparelho". */
export const IMPRECISE_THRESHOLD_DB = 3;
/** Desvio acima disso gera aviso geral na curva. */
export const WARNING_THRESHOLD_DB = 1;
export const CURVE_POINTS = 256;

export interface IrRequest {
  id: number;
  curve: CurveConfig;
  preferredFormat?: WavSampleFormat;
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
  /** IR final (exatamente o que é exportado e usado no ConvolverNode). */
  ir: Float64Array;
  peak: number;
  exportFormat: ExportFormatChoice;
  /** Eixo de frequências (log, 20 Hz–20 kHz) das curvas abaixo. */
  freqs: Float64Array;
  targetDb: Float64Array;
  realDb: Float64Array;
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
  const { ir, peak } = buildIr(sections, { length: device.irLength, gainDb: curve.outputGainDb });

  const freqs = logFrequencies(CURVE_POINTS, 20, Math.min(20000, fs * 0.45));
  const targetDb = cascadeMagnitudeDb(sections, freqs, fs, curve.outputGainDb);
  const realDb = irMagnitudeDb(ir, freqs, fs);
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
    length: device.irLength,
    ir,
    peak,
    exportFormat: chooseExportFormat(peak, req.preferredFormat),
    freqs,
    targetDb,
    realDb,
    deviation,
    bandDeviations,
    computeMs: performance.now() - t0,
  };
}

/** Buffers que podem ser "transferidos" (movidos sem cópia) entre threads. */
export function transferables(r: IrComputation): ArrayBuffer[] {
  return [r.ir, r.freqs, r.targetDb, r.realDb].map((a) => a.buffer as ArrayBuffer);
}
