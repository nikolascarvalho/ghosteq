import { DEVICE_PRESETS, resolveDevice } from '../../config/devices';
import { useT } from '../../i18n';
import { LIMITS } from '../../model/curve';
import { useCurveStore } from '../../state/curveStore';
import { samplesToMs } from '../common/format';

const SAMPLE_RATES = [44100, 48000, 88200, 96000];

export function DevicePicker() {
  const { t } = useT();
  const devicePresetId = useCurveStore((s) => s.curve.devicePresetId);
  const custom = useCurveStore((s) => s.curve.customDevice);
  const { setDevice } = useCurveStore.getState();
  const device = resolveDevice(devicePresetId, custom);
  const isCustom = devicePresetId === 'custom';
  const customValues = custom ?? { sampleRate: device.sampleRate, irLength: device.irLength };

  return (
    <div className="device-picker">
      <label className="field">
        {t('device.label')}
        <select value={devicePresetId} onChange={(e) => setDevice(e.target.value)}>
          {DEVICE_PRESETS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.id === 'custom' ? `${d.name}…` : `${d.name} (${d.irLength})`}
            </option>
          ))}
        </select>
      </label>
      {isCustom && (
        <>
          <label className="field">
            {t('device.sampleRate')}
            <select
              value={customValues.sampleRate}
              onChange={(e) => setDevice('custom', { ...customValues, sampleRate: Number(e.target.value) })}
            >
              {SAMPLE_RATES.map((sr) => (
                <option key={sr} value={sr}>
                  {sr / 1000} kHz
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('device.irLength')}
            <input
              className="num"
              type="number"
              min={LIMITS.customIrLength.min}
              max={LIMITS.customIrLength.max}
              step={64}
              value={customValues.irLength}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (n >= LIMITS.customIrLength.min && n <= LIMITS.customIrLength.max)
                  setDevice('custom', { ...customValues, irLength: n });
              }}
            />
          </label>
        </>
      )}
      <span className="muted small">
        {t('device.summary', {
          n: device.irLength,
          sr: device.sampleRate / 1000,
          ms: samplesToMs(device.irLength, device.sampleRate),
        })}
      </span>
    </div>
  );
}
