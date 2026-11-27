// Limiter de segurança da saída, SEM lookahead (zero amostras de atraso).
//
// Por que um worklet próprio: o DynamicsCompressorNode do navegador tem um
// atraso fixo de ~6 ms (ele "olha à frente" para não deixar passar o pico) e
// o WaveShaper com oversample 4x soma mais alguns ms de filtro. Para tocar ao
// vivo cada ms conta, então aqui o pico é tratado NA PRÓPRIA amostra:
//
//   1. detector de pico por amostra (o maior |x| entre os canais);
//   2. se o pico × ganho atual passar do limiar, o ganho cai NA HORA para
//      limiar/pico (attack 0) — a amostra que sai já está no limiar;
//   3. depois o ganho volta para 1 com release exponencial (~50 ms);
//   4. hard clip em −1 dBFS por último (rede de segurança contra arredondamento,
//      NaN e Infinity).
//
// Abaixo do limiar o ganho é EXATAMENTE 1 (o sinal passa bit a bit igual).
//
// Este arquivo serve para duas coisas: a classe pura `PeakLimiterCore` é
// importada pelos testes (Vitest, no Node); e, quando carregado como
// AudioWorklet (`audioWorklet.addModule`), registra o processador.

const dbToLin = (db) => Math.pow(10, db / 20);

export const LIMITER_DEFAULTS = Object.freeze({ thresholdDb: -1, ceilingDb: -1, releaseMs: 50 });

export class PeakLimiterCore {
  constructor(sampleRate, options) {
    const o = Object.assign({}, LIMITER_DEFAULTS, options || {});
    this.threshold = dbToLin(o.thresholdDb);
    this.ceiling = dbToLin(o.ceilingDb);
    // Coeficiente do release: a "distância até 1" cai para 1/e a cada releaseMs.
    this.releaseCoef = Math.exp(-1 / ((o.releaseMs / 1000) * sampleRate));
    this.gain = 1;
    this.minGain = 1;
  }

  /**
   * Processa `frames` amostras. `input`/`output` são listas de canais
   * (Float32Array). O ganho é o mesmo em todos os canais (não muda a imagem).
   * Se faltar canal de entrada, usa o primeiro.
   */
  process(input, output, frames) {
    const thr = this.threshold;
    const ceil = this.ceiling;
    const coef = this.releaseCoef;
    const nIn = input.length;
    const nOut = output.length;
    let g = this.gain;
    let minG = this.minGain;
    for (let i = 0; i < frames; i++) {
      let peak = 0;
      for (let c = 0; c < nIn; c++) {
        const a = Math.abs(input[c][i]);
        if (a > peak || a !== a) peak = a; // a !== a → NaN conta como pico
      }
      // Release: volta para 1 sem nunca passar de 1; perto o bastante, crava 1.
      if (g < 1) {
        g = 1 - (1 - g) * coef;
        if (1 - g < 1e-6) g = 1;
      }
      // Attack instantâneo.
      if (peak !== peak) g = 0;
      else if (peak * g > thr) g = thr / peak;
      if (g < minG) minG = g;
      for (let c = 0; c < nOut; c++) {
        const x = (c < nIn ? input[c] : input[0])[i];
        let y = x * g;
        if (y !== y) y = 0;
        else if (y > ceil) y = ceil;
        else if (y < -ceil) y = -ceil;
        output[c][i] = y;
      }
    }
    this.gain = g;
    this.minGain = minG;
  }

  /** Menor ganho desde a última leitura (para o medidor de redução na tela). */
  takeMinGain() {
    const m = this.minGain;
    this.minGain = this.gain;
    return m;
  }
}

if (typeof AudioWorkletProcessor !== 'undefined') {
  class SafetyLimiterProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.core = new PeakLimiterCore(sampleRate, options && options.processorOptions);
      this.frames = 0;
      this.reportEvery = Math.round(sampleRate / 20); // ~20 leituras por segundo
    }

    process(inputs, outputs) {
      const input = inputs[0];
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      const frames = output[0].length;
      if (!input || input.length === 0) {
        for (const ch of output) ch.fill(0);
      } else {
        this.core.process(input, output, frames);
      }
      this.frames += frames;
      if (this.frames >= this.reportEvery) {
        this.frames = 0;
        this.port.postMessage(this.core.takeMinGain());
      }
      return true;
    }
  }
  registerProcessor('ghosteq-safety-limiter', SafetyLimiterProcessor);
}
