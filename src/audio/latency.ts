// Funções puras sobre latência, taxas de amostragem e diagnóstico do modo ao
// vivo (testáveis sem navegador: recebem strings/números, não leem `navigator`).
import { ENGINE_SAMPLE_RATE } from './helpers';

export type OsKind = 'windows' | 'mac' | 'android' | 'ios' | 'linux' | 'other';
export type BrowserKind = 'chrome' | 'edge' | 'firefox' | 'safari' | 'opera' | 'other';

export interface PlatformInfo {
  os: OsKind;
  browser: BrowserKind;
  /** Nome legível, ex.: "Microsoft Edge". */
  browserName: string;
  /** Versão principal, ex.: "158". */
  version: string;
}

export interface UaBrand {
  brand: string;
  version: string;
}

const BROWSER_NAMES: Record<BrowserKind, string> = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  opera: 'Opera',
  other: '?',
};

/** Descobre SO e navegador pelo user agent (e pelas "brands" do Chromium, quando houver). */
export function detectPlatform(ua: string, brands?: UaBrand[], uaPlatform?: string): PlatformInfo {
  const p = (uaPlatform ?? '').toLowerCase();
  let os: OsKind = 'other';
  if (p === 'windows' || /Windows NT/i.test(ua)) os = 'windows';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'ios';
  else if (p === 'android' || /Android/i.test(ua)) os = 'android';
  else if (p === 'macos' || /Mac OS X|Macintosh/i.test(ua)) os = 'mac';
  else if (p === 'linux' || /Linux/i.test(ua)) os = 'linux';

  const fromBrand = (re: RegExp) => brands?.find((b) => re.test(b.brand))?.version;
  const fromUa = (re: RegExp) => ua.match(re)?.[1];
  let browser: BrowserKind = 'other';
  let version: string | undefined;
  if ((version = fromBrand(/Microsoft Edge/i) ?? fromUa(/Edg(?:e|A|iOS)?\/(\d+)/))) browser = 'edge';
  else if ((version = fromBrand(/Opera/i) ?? fromUa(/OPR\/(\d+)/))) browser = 'opera';
  else if ((version = fromUa(/Firefox\/(\d+)/))) browser = 'firefox';
  else if ((version = fromBrand(/Google Chrome/i) ?? fromUa(/(?:Chrome|CriOS)\/(\d+)/))) browser = 'chrome';
  else if ((version = fromUa(/Version\/(\d+)[\d.]* .*Safari/))) browser = 'safari';
  return {
    os,
    browser,
    browserName: BROWSER_NAMES[browser],
    version: (version ?? '?').split('.')[0]!,
  };
}

/** Baixa latência começa ligada no Windows (plataforma prioritária). */
export const defaultLowLatency = (os: OsKind) => os === 'windows';

// ---------- Taxas de amostragem ----------

export interface Rates {
  /** ctx.sampleRate (o app pede 48 kHz). */
  context: number | null;
  /** track.getSettings().sampleRate da entrada ao vivo. */
  input: number | null;
  /** Taxa "nativa" do dispositivo de saída (AudioContext sem sampleRate). */
  output: number | null;
}

/** Quais taxas estão fora de 48 kHz (desconhecidas não contam como problema). */
export function rateIssues(r: Rates, target = ENGINE_SAMPLE_RATE): (keyof Rates)[] {
  return (Object.keys(r) as (keyof Rates)[]).filter((k) => r[k] != null && r[k] !== target);
}

// ---------- Parcelas da latência ----------

export interface LatencyParts {
  /** Entrada: track.getSettings().latency (Chrome/Edge). */
  input: number | null;
  /** ctx.baseLatency: o buffer de processamento do próprio AudioContext. */
  base: number | null;
  /** ctx.outputLatency: do AudioContext até o som sair no dispositivo. */
  output: number | null;
  /** Atraso do grafo do app, medido com impulso (0 = nenhum). */
  graph: number | null;
}

export const LATENCY_KEYS: (keyof LatencyParts)[] = ['input', 'base', 'output', 'graph'];

/** Soma das parcelas conhecidas (segundos) e a lista das que o navegador não informou. */
export function latencyTotal(p: LatencyParts): { total: number | null; missing: (keyof LatencyParts)[] } {
  const missing = LATENCY_KEYS.filter((k) => p[k] == null);
  const known = LATENCY_KEYS.filter((k) => p[k] != null);
  // Sem base nem saída o número não diz nada sobre o que você ouve.
  if (p.base == null && p.output == null) return { total: null, missing };
  return { total: known.reduce((s, k) => s + (p[k] ?? 0), 0), missing };
}

export const msText = (s: number | null | undefined, digits = 1) =>
  s == null || !Number.isFinite(s) ? '?' : (s * 1000).toFixed(digits);

// ---------- Diagnóstico para copiar ----------

export interface LiveDiagnostic {
  date: string;
  platform: PlatformInfo;
  userAgent: string;
  lowLatency: boolean;
  latencyHint: string;
  input: { label: string; channels: string; channelCount: number } | null;
  output: { label: string; nano: boolean };
  rates: Rates;
  parts: LatencyParts;
  graphDelaySamples: { dry: number; wet: number } | null;
  limiter: string;
  glitches: { events: number; durationMs: number } | null;
}

/** Texto curto, fácil de colar numa conversa e comparar entre configurações. */
export function formatDiagnostic(d: LiveDiagnostic): string {
  const { total, missing } = latencyTotal(d.parts);
  const hz = (v: number | null) => (v == null ? '?' : `${v} Hz`);
  const lines = [
    `GhostEQ — diagnóstico ao vivo (${d.date})`,
    `Navegador: ${d.platform.browserName} ${d.platform.version} · SO: ${d.platform.os}`,
    `User agent: ${d.userAgent}`,
    `Modo baixa latência: ${d.lowLatency ? 'ligado' : 'desligado'} (latencyHint ${d.latencyHint})`,
    `Entrada: ${d.input ? `${d.input.label || '?'} · ${d.input.channelCount} canais · usando ${d.input.channels}` : '(nenhuma ao vivo)'}`,
    `Saída: ${d.output.label || 'padrão do sistema'}${d.output.nano ? ' (Nano, experimental)' : ''}`,
    `Taxas: contexto ${hz(d.rates.context)} · entrada ${hz(d.rates.input)} · saída nativa ${hz(d.rates.output)}`,
    `Latência total: ${msText(total)} ms${missing.length ? ` (sem: ${missing.join(', ')})` : ''}`,
    `  entrada ${msText(d.parts.input)} ms · base ${msText(d.parts.base)} ms · saída ${msText(d.parts.output)} ms · grafo ${msText(d.parts.graph)} ms`,
    `Atraso do grafo (impulso): ${d.graphDelaySamples ? `A ${d.graphDelaySamples.dry} / B ${d.graphDelaySamples.wet} amostras` : '?'} · limiter: ${d.limiter}`,
    `Estalos (underruns): ${d.glitches ? `${d.glitches.events} (${d.glitches.durationMs.toFixed(0)} ms)` : 'o navegador não informa'}`,
  ];
  return lines.join('\n');
}
