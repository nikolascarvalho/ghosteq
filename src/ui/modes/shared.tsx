import type { CutFilter } from '../../dsp/modes';
import { useT } from '../../i18n';
import { useIrStore } from '../../state/irStore';
import { formatDb } from '../common/format';

/** Texto de "imprecisa neste aparelho" para um id de banda compilada (ou null). */
export function useImpreciseText(): (bandId: string) => string | null {
  const { t } = useT();
  const devs = useIrStore((s) => s.result?.bandDeviations);
  const n = useIrStore((s) => s.result?.length ?? 0);
  return (bandId) => {
    const d = devs?.find((x) => x.bandId === bandId);
    return d?.imprecise ? t('band.imprecise', { d: formatDb(Math.abs(d.deviationDb)), n }) : null;
  };
}

interface CutProps {
  label: string;
  value: CutFilter;
  onChange: (v: CutFilter) => void;
}

/** Liga/desliga + frequência de um HPF/LPF (12 dB/oit). */
export function CutFilterControl({ label, value, onChange }: CutProps) {
  return (
    <div className="cut-filter">
      <label className="check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
        />
        {label}
      </label>
      <input
        className="num"
        type="number"
        min={10}
        max={24000}
        value={Math.round(value.freq)}
        disabled={!value.enabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 10 && n <= 24000) onChange({ ...value, freq: n });
        }}
        aria-label={`${label} (Hz)`}
      />
      <span className="unit">Hz</span>
    </div>
  );
}
