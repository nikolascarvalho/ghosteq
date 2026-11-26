// Resample por sinc janelado (janela de Kaiser): o método "de livro" para
// mudar a taxa de amostragem sem criar aliasing. Cada amostra de saída é uma
// média ponderada das amostras de entrada vizinhas (como uma janela móvel).

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const y = (x * x) / 4;
  for (let k = 1; k < 50; k++) {
    term *= y / (k * k);
    sum += term;
    if (term < sum * 1e-16) break;
  }
  return sum;
}

export interface ResampleOptions {
  /** Meia-largura do kernel em amostras (na taxa mais baixa). Mais = mais preciso e mais lento. */
  halfWidth?: number;
  /** Parâmetro beta da janela de Kaiser (≈ 8,6 → ~90 dB de rejeição). */
  beta?: number;
  /** Fração da Nyquist preservada (0,97 → corta a partir de ~97% da Nyquist). */
  rolloff?: number;
  /**
   * Mantém o "ringing" do filtro de resample nas duas pontas (antes de t = 0 e
   * depois da última amostra). Necessário para IRs, que começam com energia na
   * amostra 0: sem isso parte do IR se perde e a curva muda.
   * Custa ~halfWidth amostras de atraso (~0,7 ms a 48 kHz, inaudível).
   */
  keepRinging?: boolean;
}

/** Resample de um SINAL (preserva amplitude da forma de onda). */
export function resample(
  x: ArrayLike<number>,
  fsIn: number,
  fsOut: number,
  opts: ResampleOptions = {},
): Float64Array {
  if (fsIn === fsOut) return Float64Array.from(x);
  const { halfWidth = 32, beta = 8.6, rolloff = 0.97, keepRinging = false } = opts;
  const ratio = fsOut / fsIn;
  const scale = Math.min(1, ratio); // ao reduzir a taxa, o filtro precisa cortar mais baixo
  const fc = 0.5 * scale * rolloff; // corte em ciclos por amostra de ENTRADA
  const hw = halfWidth / scale; // meia-largura em amostras de entrada
  const i0Beta = besselI0(beta);
  // (o -1e-9 evita que 44100·(48000/44100) = 48000,0000001 vire 48001)
  const baseLen = Math.ceil(x.length * ratio - 1e-9);
  const lead = keepRinging ? Math.ceil(hw * ratio) : 0;
  const y = new Float64Array(baseLen + 2 * lead); // ringing antes e depois

  for (let j = 0; j < y.length; j++) {
    const t = (j - lead) / ratio; // posição em amostras de entrada
    const kMin = Math.max(0, Math.ceil(t - hw));
    const kMax = Math.min(x.length - 1, Math.floor(t + hw));
    let acc = 0;
    for (let k = kMin; k <= kMax; k++) {
      const d = t - k;
      const r = d / hw;
      const w = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0Beta;
      const arg = 2 * fc * d;
      const sinc = arg === 0 ? 1 : Math.sin(Math.PI * arg) / (Math.PI * arg);
      acc += x[k]! * 2 * fc * sinc * w;
    }
    y[j] = acc;
  }
  return y;
}

/**
 * Resample de um IR (resposta ao impulso). Diferente de um sinal: para manter a
 * MESMA curva de EQ, a soma das amostras precisa escalar com a taxa
 * (mais amostras por segundo → cada uma "pesa" menos). Por isso o fator fsIn/fsOut.
 * Sem isso, um IR de 44,1 kHz levado para 48 kHz ganharia +0,74 dB.
 */
export function resampleIr(
  ir: ArrayLike<number>,
  fsIn: number,
  fsOut: number,
  opts?: ResampleOptions,
): Float64Array {
  if (fsIn === fsOut) return Float64Array.from(ir);
  const y = resample(ir, fsIn, fsOut, { keepRinging: true, ...opts });
  const k = fsIn / fsOut;
  for (let i = 0; i < y.length; i++) y[i]! *= k;
  return y;
}
