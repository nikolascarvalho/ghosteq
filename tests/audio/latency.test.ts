import { describe, expect, it } from 'vitest';
import {
  defaultLowLatency,
  detectPlatform,
  formatDiagnostic,
  latencyTotal,
  rateIssues,
  type LiveDiagnostic,
} from '../../src/audio/latency';
import { MEASURE_ROWS, rowKey, toMarkdown, type MarkdownLabels } from '../../src/state/measureStore';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';
const EDGE_WIN = `${CHROME_WIN} Edg/158.0.0.0`;
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('detecção de navegador e SO', () => {
  it('Chrome e Edge no Windows (pelo user agent)', () => {
    expect(detectPlatform(CHROME_WIN)).toMatchObject({ os: 'windows', browser: 'chrome', version: '158' });
    expect(detectPlatform(EDGE_WIN)).toMatchObject({
      os: 'windows',
      browser: 'edge',
      browserName: 'Microsoft Edge',
    });
  });

  it('as "brands" do Chromium têm prioridade', () => {
    const brands = [
      { brand: 'Not)A;Brand', version: '99' },
      { brand: 'Microsoft Edge', version: '157' },
      { brand: 'Chromium', version: '157' },
    ];
    expect(detectPlatform(CHROME_WIN, brands, 'Windows')).toMatchObject({ browser: 'edge', version: '157' });
  });

  it('Safari no iPhone', () => {
    expect(detectPlatform(SAFARI_IOS)).toMatchObject({ os: 'ios', browser: 'safari', version: '18' });
  });

  it('baixa latência começa ligada só no Windows', () => {
    expect(defaultLowLatency('windows')).toBe(true);
    expect(defaultLowLatency('mac')).toBe(false);
    expect(defaultLowLatency('ios')).toBe(false);
  });
});

describe('taxas de amostragem', () => {
  it('aponta só o que está fora de 48 kHz (desconhecido não é problema)', () => {
    expect(rateIssues({ context: 48000, input: 48000, output: 48000 })).toEqual([]);
    expect(rateIssues({ context: 48000, input: 44100, output: 96000 })).toEqual(['input', 'output']);
    expect(rateIssues({ context: 48000, input: null, output: null })).toEqual([]);
  });
});

describe('parcelas da latência', () => {
  it('soma as conhecidas e lista as que faltam', () => {
    const r = latencyTotal({ input: 0.01, base: 0.005, output: 0.03, graph: 0 });
    expect(r.total).toBeCloseTo(0.045, 9);
    expect(r.missing).toEqual([]);
    const p = latencyTotal({ input: null, base: 0.01, output: 0.02, graph: null });
    expect(p.total).toBeCloseTo(0.03, 9);
    expect(p.missing).toEqual(['input', 'graph']);
  });

  it('sem base nem saída não há total', () => {
    expect(latencyTotal({ input: 0.01, base: null, output: null, graph: 0 }).total).toBeNull();
  });
});

describe('diagnóstico copiável', () => {
  it('traz navegador, modo, taxas e cada parcela', () => {
    const d: LiveDiagnostic = {
      date: '2026-11-27T10:00:00Z',
      platform: detectPlatform(EDGE_WIN),
      userAgent: EDGE_WIN,
      lowLatency: true,
      latencyHint: '0',
      input: { label: 'Nano Cortex', channels: '3+4', channelCount: 4 },
      output: { label: 'Fones (Realtek)', nano: false },
      rates: { context: 48000, input: 48000, output: 44100 },
      parts: { input: 0.01, base: 0.0027, output: 0.02, graph: 0 },
      graphDelaySamples: { dry: 0, wet: 0 },
      limiter: 'worklet',
      glitches: null,
    };
    const txt = formatDiagnostic(d);
    expect(txt).toContain('Microsoft Edge 158');
    expect(txt).toContain('ligado (latencyHint 0)');
    expect(txt).toContain('Nano Cortex · 4 canais · usando 3+4');
    expect(txt).toContain('saída nativa 44100 Hz');
    expect(txt).toContain('Latência total: 32.7 ms');
    expect(txt).toContain('A 0 / B 0 amostras');
    expect(txt).toContain('o navegador não informa');
  });
});

describe('roteiro de medição', () => {
  const L: MarkdownLabels = {
    browser: 'Navegador',
    lowLatency: 'Baixa latência',
    output: 'Saída',
    total: 'Total (ms)',
    crackle: 'Estalo?',
    notes: 'Notas',
    on: 'ligado',
    off: 'desligado',
    yes: 'sim',
    no: 'não',
    pc: 'placa do PC',
    nano: 'Nano',
  };

  it('8 combinações: 2 navegadores × 2 modos × 2 saídas', () => {
    expect(MEASURE_ROWS).toHaveLength(8);
    expect(new Set(MEASURE_ROWS.map(rowKey)).size).toBe(8);
  });

  it('gera a tabela em Markdown com o que foi preenchido', () => {
    const key = rowKey({ browser: 'edge', lowLatency: true, output: 'nano' });
    const md = toMarkdown({ [key]: { totalMs: '31.5', crackle: true, notes: 'a|b' } }, L);
    const lines = md.split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[0]).toBe('| Navegador | Baixa latência | Saída | Total (ms) | Estalo? | Notas |');
    expect(md).toContain('| Edge | ligado | Nano | 31.5 | sim | a\\|b |');
    expect(md).toContain('| Chrome | ligado | placa do PC |  |  |  |');
  });
});
