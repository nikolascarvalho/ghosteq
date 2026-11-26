// Analisador de espectro ao vivo em <canvas> (desenho rápido, ~30 fps).
// Cinza = antes (original), azul = depois (com IR).
import { useEffect, useRef } from 'react';
import { getEngine } from '../../state/audioStore';

const F_MIN = 20;
const F_MAX = 20000;
const DB_MIN = -100;
const DB_MAX = -10;

export function SpectrumCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    let raf = 0;
    let last = 0;
    let before = new Float32Array(0);
    let after = new Float32Array(0);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return;
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      // grade de frequência
      g.strokeStyle = '#232834';
      g.lineWidth = 1;
      for (const f of [100, 1000, 10000]) {
        const x = (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }

      const engine = getEngine();
      if (!engine) return;
      const a = engine.analyserBefore;
      const b = engine.analyserAfter;
      if (before.length !== a.frequencyBinCount) before = new Float32Array(a.frequencyBinCount);
      if (after.length !== b.frequencyBinCount) after = new Float32Array(b.frequencyBinCount);
      a.getFloatFrequencyData(before);
      b.getFloatFrequencyData(after);
      const binHz = engine.ctx.sampleRate / a.fftSize;

      const path = (data: Float32Array, color: string, width: number) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        let started = false;
        // Um ponto por pixel (eixo log), pegando o maior bin daquele pixel.
        for (let x = 0; x < w; x++) {
          const f0 = F_MIN * Math.pow(F_MAX / F_MIN, x / w);
          const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (x + 1) / w);
          let k0 = Math.floor(f0 / binHz);
          const k1 = Math.max(k0, Math.floor(f1 / binHz));
          let v = -Infinity;
          for (; k0 <= k1 && k0 < data.length; k0++) v = Math.max(v, data[k0]!);
          if (!Number.isFinite(v)) continue;
          const y = ((DB_MAX - Math.min(DB_MAX, Math.max(DB_MIN, v))) / (DB_MAX - DB_MIN)) * h;
          if (started) g.lineTo(x, y);
          else {
            g.moveTo(x, y);
            started = true;
          }
        }
        g.stroke();
      };
      path(before, 'rgba(154,161,178,0.7)', 1);
      path(after, '#7c9cff', 1.5);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="spectrum" aria-hidden />;
}
