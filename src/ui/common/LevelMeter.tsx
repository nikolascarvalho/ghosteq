interface Props {
  label: string;
  sublabel?: string | null;
  /** Pico em dBFS (-Infinity = silêncio). */
  db: number;
}

const FLOOR_DB = -60;

/** Medidor horizontal simples: -60 dBFS (vazio) até 0 dBFS (cheio). */
export function LevelMeter({ label, sublabel, db }: Props) {
  const pct = Number.isFinite(db) ? Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB)) * 100 : 0;
  const level = db > -1 ? 'clip' : db > -12 ? 'hot' : 'normal';
  return (
    <div className="meter">
      <div className="meter-label">
        <span>{label}</span>
        {sublabel && <span className="tag">{sublabel}</span>}
        <span className="meter-db">{Number.isFinite(db) ? `${db.toFixed(1)} dB` : '−∞'}</span>
      </div>
      <div className="meter-track" aria-hidden>
        <div className={`meter-fill ${level}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
