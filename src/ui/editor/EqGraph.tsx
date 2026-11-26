// Gráfico interativo da curva. Desenha em SVG e trata mouse e toque juntos via
// Pointer Events (um único modelo de "ponteiro" para mouse, dedo e caneta).
//   - arrastar um ponto: frequência (x) e ganho (y)
//   - roda do mouse: Q da banda selecionada
//   - pinça com dois dedos: Q da banda selecionada
//   - duplo clique no fundo: nova banda peak naquele ponto
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../../i18n';
import { LIMITS } from '../../model/curve';
import { useCurveStore } from '../../state/curveStore';
import { useIrStore } from '../../state/irStore';
import { formatDb, formatTickHz } from '../common/format';
import { bandColor, hasGain } from './bandStyle';
import {
  DB_TICKS,
  F_MAX,
  F_MIN,
  FREQ_TICKS,
  curvePath,
  dbToY,
  freqToX,
  makeViewport,
  xToFreq,
  yToDb,
} from './scale';

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** false = modos gráfico/tone stack/tilt: o gráfico só mostra a curva. */
  editable?: boolean;
}

type Pt = { x: number; y: number };

const round1 = (v: number) => Math.round(v * 10) / 10;
const clampQ = (q: number) => Math.min(LIMITS.q.max, Math.max(LIMITS.q.min, q));

export function EqGraph({ selectedId, onSelect, editable = true }: Props) {
  const { t } = useT();
  const bands = useCurveStore((s) => s.curve.bands);
  const result = useIrStore((s) => s.result);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(640);

  // Acompanha a largura do container (layout responsivo).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = Math.round(Math.min(420, Math.max(220, width * 0.5)));
  const v = makeViewport(width, height);

  // Estado dos gestos em refs (não precisa re-renderizar a cada movimento).
  const pointers = useRef(new Map<number, Pt>());
  const drag = useRef<{ bandId: string; pointerId: number } | null>(null);
  const pinch = useRef<{ bandId: string; d0: number; q0: number } | null>(null);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    selectedRef.current = selectedId;
    onSelectRef.current = onSelect;
  }, [selectedId, onSelect]);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const store = useCurveStore.getState;

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);
    svgRef.current!.setPointerCapture(e.pointerId);
    const bandId = (e.target as Element).closest('[data-band-id]')?.getAttribute('data-band-id') ?? null;

    if (pointers.current.size === 1 && bandId) {
      e.preventDefault();
      onSelect(bandId);
      store().beginGesture();
      drag.current = { bandId, pointerId: e.pointerId };
    } else if (pointers.current.size === 2) {
      const target = drag.current?.bandId ?? selectedRef.current;
      const band = store().curve.bands.find((b) => b.id === target);
      drag.current = null;
      if (band) {
        const [a, b] = [...pointers.current.values()];
        store().beginGesture();
        pinch.current = { bandId: band.id, d0: Math.max(20, Math.abs(a!.x - b!.x)), q0: band.q };
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.max(20, Math.abs(a!.x - b!.x));
      // Afastar os dedos = banda mais larga = Q menor.
      store().updateBand(pinch.current.bandId, { q: clampQ((pinch.current.q0 * pinch.current.d0) / d) });
      return;
    }
    const dr = drag.current;
    if (dr && dr.pointerId === e.pointerId) {
      const band = store().curve.bands.find((b) => b.id === dr.bandId);
      if (!band) return;
      const freq = Math.round(xToFreq(pt.x, v));
      store().updateBand(dr.bandId, hasGain(band.type) ? { freq, gainDb: round1(yToDb(pt.y, v)) } : { freq });
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current && pointers.current.size < 2) pinch.current = null;
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    if (!drag.current && !pinch.current) store().endGesture();
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editable || (e.target as Element).closest('[data-band-id]')) return;
    const pt = local(e);
    const id = store().addBand({
      type: 'peak',
      freq: Math.round(xToFreq(pt.x, v)),
      gainDb: round1(yToDb(pt.y, v)),
      q: 1,
      enabled: true,
    });
    if (id) onSelect(id);
  };

  // Roda do mouse → Q. Listener nativo porque o do React é "passivo" e não pode
  // impedir a página de rolar.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let endTimer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      // Só sobre um ponto: no resto do gráfico a roda continua rolando a página.
      const id = (e.target as Element).closest('[data-band-id]')?.getAttribute('data-band-id');
      const band = id ? store().curve.bands.find((b) => b.id === id) : undefined;
      if (!band) return;
      e.preventDefault();
      if (selectedRef.current !== band.id) onSelectRef.current(band.id);
      store().beginGesture();
      store().updateBand(band.id, { q: clampQ(band.q * Math.exp(-e.deltaY * 0.0015)) });
      if (endTimer) clearTimeout(endTimer);
      endTimer = setTimeout(() => store().endGesture(), 400);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onWheel);
      if (endTimer) clearTimeout(endTimer);
    };
  }, [store]);

  const deviationByBand = new Map(result?.bandDeviations.map((d) => [d.bandId, d]) ?? []);
  const offset = result?.outputGainDb ?? 0;
  const plotBottom = v.height - v.padB;
  const plotRight = v.width - v.padR;

  return (
    <div ref={wrapRef} className="eq-graph">
      <svg
        ref={svgRef}
        width={v.width}
        height={v.height}
        viewBox={`0 0 ${v.width} ${v.height}`}
        role="img"
        aria-label={t('editor.graphLabel')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <clipPath id="plot-clip">
            <rect x={v.padL} y={v.padT} width={plotRight - v.padL} height={plotBottom - v.padT} />
          </clipPath>
        </defs>

        {/* Regiões com desvio > 1 dB */}
        {result?.deviation.regions.map((r, i) => (
          <rect
            key={i}
            className="deviation-region"
            x={freqToX(Math.max(F_MIN, r.fLow), v) - 2}
            y={v.padT}
            width={Math.max(
              4,
              freqToX(Math.min(F_MAX, r.fHigh), v) - freqToX(Math.max(F_MIN, r.fLow), v) + 4,
            )}
            height={plotBottom - v.padT}
          />
        ))}

        {/* Grade */}
        {FREQ_TICKS.map((f) => (
          <g key={f}>
            <line className="grid" x1={freqToX(f, v)} x2={freqToX(f, v)} y1={v.padT} y2={plotBottom} />
            <text className="tick" x={freqToX(f, v)} y={v.height - 6} textAnchor="middle">
              {formatTickHz(f)}
            </text>
          </g>
        ))}
        {DB_TICKS.map((db) => (
          <g key={db}>
            <line
              className={db === 0 ? 'grid zero' : 'grid'}
              x1={v.padL}
              x2={plotRight}
              y1={dbToY(db, v)}
              y2={dbToY(db, v)}
            />
            <text className="tick" x={v.padL - 4} y={dbToY(db, v) + 3} textAnchor="end">
              {db > 0 ? `+${db}` : db}
            </text>
          </g>
        ))}

        {/* Curvas */}
        {result && !result.cabDb && (
          <g clipPath="url(#plot-clip)">
            <path className="curve-target" d={curvePath(result.freqs, result.targetDb, v, offset)} />
            <path className="curve-real" d={curvePath(result.freqs, result.realDb, v, offset)} />
          </g>
        )}
        {/* Com caixa: caixa sozinha, EQ sozinho e o resultado combinado. */}
        {result?.cabDb && result.eqDb && (
          <g clipPath="url(#plot-clip)">
            <path className="curve-cab" d={curvePath(result.freqs, result.cabDb, v)} />
            <path className="curve-target" d={curvePath(result.freqs, result.eqDb, v, offset)} />
            <path className="curve-combined" d={curvePath(result.freqs, result.realDb, v, offset)} />
          </g>
        )}

        {/* Modos não paramétricos: só marcadores sobre a curva (sem arrastar). */}
        {!editable &&
          result &&
          bands.map((b) => {
            if (b.type === 'hpf12' || b.type === 'lpf12') return null;
            const idx = Math.min(
              result.freqs.length - 1,
              Math.max(
                0,
                result.freqs.findIndex((f) => f >= b.freq),
              ),
            );
            const x = freqToX(b.freq, v);
            const eqCurve = result.eqDb ?? result.targetDb;
            const y = dbToY(Math.max(-18, Math.min(18, eqCurve[idx]! - offset)), v);
            const dev = deviationByBand.get(b.id);
            return (
              <g key={b.id} className="band-marker">
                <title>
                  {`${Math.round(b.freq)} Hz${dev?.imprecise ? `\n${t('band.imprecise', { d: formatDb(Math.abs(dev.deviationDb)), n: result.length })}` : ''}`}
                </title>
                {dev?.imprecise && <circle cx={x} cy={y} r={9} className="imprecise-ring" />}
                <circle cx={x} cy={y} r={3.5} className="marker-dot" />
              </g>
            );
          })}

        {/* Pontos das bandas (paramétrico) */}
        {editable &&
          bands.map((b, i) => {
            const x = freqToX(b.freq, v);
            const y = dbToY(hasGain(b.type) ? Math.max(-18, Math.min(18, b.gainDb)) : 0, v);
            const dev = deviationByBand.get(b.id);
            const selected = b.id === selectedId;
            const label = `${t(`band.type.${b.type}`)} ${Math.round(b.freq)} Hz ${hasGain(b.type) ? formatDb(b.gainDb) : ''}`;
            return (
              <g
                key={b.id}
                data-band-id={b.id}
                className={`band-handle${b.enabled ? '' : ' off'}${selected ? ' selected' : ''}`}
                style={{ color: bandColor(i) }}
                role="button"
                aria-label={label}
              >
                <title>
                  {dev?.imprecise
                    ? `${label}\n${t('band.imprecise', { d: formatDb(Math.abs(dev.deviationDb)), n: result?.length ?? 0 })}`
                    : label}
                </title>
                {/* área de toque grande e invisível */}
                <circle cx={x} cy={y} r={22} className="hit" />
                {dev?.imprecise && <circle cx={x} cy={y} r={14} className="imprecise-ring" />}
                <circle cx={x} cy={y} r={selected ? 9 : 7} className="dot" />
                <text x={x} y={y + 3.5} textAnchor="middle" className="dot-label">
                  {i + 1}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
}
