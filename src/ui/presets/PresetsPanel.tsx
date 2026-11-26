import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { downloadFile, JSON_MIME, readFileAsText } from '../../io/files';
import {
  deletePreset,
  listPresets,
  loadPreset,
  newPresetId,
  savePreset,
  type StoredPreset,
} from '../../io/presetsDb';
import { parsePresetFile, serializePreset } from '../../io/presetsJson';
import { useCurveStore } from '../../state/curveStore';

type Summary = Pick<StoredPreset, 'id' | 'name' | 'savedAt'>;
type Msg = { kind: 'ok' | 'warn' | 'error'; text: string } | null;

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9+-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'GhostEQ';

export function PresetsPanel() {
  const { t } = useT();
  const [list, setList] = useState<Summary[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { setCurve } = useCurveStore.getState();

  const refresh = useCallback(async () => {
    try {
      setList(await listPresets());
    } catch (err) {
      setMsg({ kind: 'error', text: String(err) });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    listPresets()
      .then((l) => alive && setList(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    const n = name.trim() || 'GhostEQ';
    await savePreset({
      id: newPresetId(),
      name: n,
      savedAt: new Date().toISOString(),
      curve: useCurveStore.getState().curve,
    });
    setName('');
    setMsg({ kind: 'ok', text: t('presets.saved', { name: n }) });
    await refresh();
  };

  const open = async (p: Summary) => {
    const r = await loadPreset(p.id);
    if (!r) return;
    if (!r.ok) return setMsg({ kind: 'error', text: t('presets.error', { msg: r.errors.join(' ') }) });
    setCurve(r.value.curve);
    setMsg(
      r.warnings.length
        ? { kind: 'warn', text: t('presets.warnings', { msg: r.warnings.join(' ') }) }
        : { kind: 'ok', text: t('presets.loaded', { name: p.name }) },
    );
  };

  const remove = async (p: Summary) => {
    if (!window.confirm(t('presets.deleteConfirm', { name: p.name }))) return;
    await deletePreset(p.id);
    await refresh();
  };

  const exportJson = () => {
    const n = name.trim() || 'GhostEQ';
    downloadFile(serializePreset(n, useCurveStore.getState().curve), `${slug(n)}.json`, JSON_MIME);
  };

  const importJson = async (file: File) => {
    const r = parsePresetFile(await readFileAsText(file));
    if (!r.ok) return setMsg({ kind: 'error', text: t('presets.error', { msg: r.errors.join(' ') }) });
    setCurve(r.value.curve);
    setName(r.value.name);
    setMsg(
      r.warnings.length
        ? { kind: 'warn', text: t('presets.warnings', { msg: r.warnings.join(' ') }) }
        : { kind: 'ok', text: t('presets.loaded', { name: r.value.name }) },
    );
  };

  return (
    <section className="card">
      <h2>{t('presets.title')}</h2>
      <div className="row">
        <input
          className="text"
          type="text"
          value={name}
          maxLength={60}
          placeholder={t('presets.namePlaceholder')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          aria-label={t('presets.namePlaceholder')}
        />
        <button onClick={() => void save()}>{t('presets.save')}</button>
        <button className="secondary" onClick={exportJson}>
          {t('presets.exportJson')}
        </button>
        <button className="secondary" onClick={() => fileRef.current?.click()}>
          {t('presets.importJson')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importJson(f);
          }}
        />
      </div>
      {msg && (
        <p className={`small ${msg.kind}`} role="status">
          {msg.text}
        </p>
      )}
      {list.length === 0 ? (
        <p className="muted small">{t('presets.empty')}</p>
      ) : (
        <ul className="preset-list">
          {list.map((p) => (
            <li key={p.id}>
              <span className="preset-name">{p.name}</span>
              <span className="muted small">{new Date(p.savedAt).toLocaleString()}</span>
              <button className="secondary" onClick={() => void open(p)}>
                {t('presets.load')}
              </button>
              <button className="secondary danger" onClick={() => void remove(p)}>
                {t('presets.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{t('presets.localNote')}</p>
    </section>
  );
}
