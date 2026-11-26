// Knob estilo amplificador. Arraste para cima/baixo (mouse ou dedo), roda do
// mouse, setas do teclado; duplo clique volta ao valor padrão.
// Um arrasto inteiro = uma entrada no desfazer.
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useCurveStore } from '../../state/curveStore';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  step: number;
  onChange: (v: number) => void;
  /** Texto principal (ex.: "6.5") e secundário (ex.: "+3.6 dB"). */
  display: string;
  subDisplay?: string;
  warn?: string | null;
  size?: number;
}

const START = -135;
const END = 135;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M${a.x} ${a.y} A${r} ${r} 0 ${large} ${sweep} ${b.x} ${b.y}`;
}

export function Knob({
  label,
  value,
  min,
  max,
  defaultValue,
  step,
  onChange,
  display,
  subDisplay,
  warn,
  size = 72,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  }, [value, onChange]);

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const t = (value - min) / (max - min);
  const angle = START + t * (END - START);
  const zeroAngle = START + ((defaultValue - min) / (max - min)) * (END - START);
  const c = size / 2;
  const r = size / 2 - 6;
  const tip = polar(c, c, r - 8, angle);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    ref.current?.setPointerCapture(e.pointerId);
    // preventDefault impede o foco automático; foca à mão para as setas funcionarem.
    ref.current?.focus();
    useCurveStore.getState().beginGesture();
    drag.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    // 200 px de arrasto = curso inteiro
    const dv = ((drag.current.y - e.clientY) / 200) * (max - min);
    onChange(clamp(drag.current.v + dv));
  };
  const onPointerUp = () => {
    drag.current = null;
    useCurveStore.getState().endGesture();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step * big));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step * big));
    else if (e.key === 'Home') onChange(min);
    else if (e.key === 'End') onChange(max);
    else return;
    e.preventDefault();
  };

  // Roda do mouse (listener nativo para poder impedir a rolagem da página).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      useCurveStore.getState().beginGesture();
      const next = valueRef.current - Math.sign(e.deltaY) * step;
      onChangeRef.current(Math.min(max, Math.max(min, Math.round(next / step) * step)));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => useCurveStore.getState().endGesture(), 400);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (timer) clearTimeout(timer);
    };
  }, [min, max, step]);

  return (
    <div className={`knob${warn ? ' knob-warn' : ''}`} title={warn ?? undefined}>
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={subDisplay ? `${display} (${subDisplay})` : display}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={onKeyDown}
      >
        <path className="knob-track" d={arc(c, c, r, START, END)} />
        {Math.abs(angle - zeroAngle) > 0.5 && (
          <path
            className="knob-value"
            d={arc(c, c, r, Math.min(zeroAngle, angle), Math.max(zeroAngle, angle))}
          />
        )}
        <circle className="knob-body" cx={c} cy={c} r={r - 6} />
        <line className="knob-pointer" x1={c} y1={c} x2={tip.x} y2={tip.y} />
      </svg>
      <div className="knob-label">{label}</div>
      <div className="knob-display">{display}</div>
      {subDisplay && <div className="knob-sub">{subDisplay}</div>}
      {warn && (
        <div className="knob-warn-icon" aria-label={warn}>
          ⚠
        </div>
      )}
    </div>
  );
}
