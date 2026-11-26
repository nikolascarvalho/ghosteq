// Formatação de números para exibição (independente de idioma: unidades técnicas).

export function formatHz(f: number): string {
  if (f >= 1000) {
    const k = f / 1000;
    return `${k >= 10 ? k.toFixed(1) : k.toFixed(2)} kHz`;
  }
  return `${Math.round(f)} Hz`;
}

export function formatTickHz(f: number): string {
  return f >= 1000 ? `${f / 1000}k` : String(f);
}

export function formatDb(db: number, digits = 1): string {
  if (!Number.isFinite(db)) return db > 0 ? '+∞ dB' : '−∞ dB';
  const v = db.toFixed(digits);
  return `${db > 0 && Number(v) !== 0 ? '+' : ''}${Number(v) === 0 ? (0).toFixed(digits) : v} dB`;
}

export function formatQ(q: number): string {
  return q >= 10 ? q.toFixed(1) : q.toFixed(2);
}

export function samplesToMs(samples: number, sampleRate: number): string {
  return ((samples / sampleRate) * 1000).toFixed(1);
}
