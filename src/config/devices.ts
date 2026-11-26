// Presets de aparelho. Para adicionar um aparelho novo, copie um bloco,
// troque id/nome/valores e pronto: nada mais no app precisa mudar.

export interface UsbChannelMap {
  /** Canais (1-based) com o sinal processado (amp + caixa + efeitos). */
  processed?: number[];
  /** Canal (1-based) com a DI seca. */
  di?: number;
}

export interface DevicePreset {
  id: string;
  name: string;
  /** Sample rate em que o aparelho usa o IR. */
  sampleRate: number;
  /** Tamanho final do IR (amostras) depois que o aparelho/Cloud redimensiona. */
  irLength: number;
  usb?: UsbChannelMap;
  notes?: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'nano-cortex',
    name: 'Neural DSP Nano Cortex / Quad Cortex',
    sampleRate: 48000,
    irLength: 1024,
    usb: { processed: [3, 4], di: 1 },
    notes: 'Cortex Cloud redimensiona qualquer WAV para 1024 amostras @ 48 kHz (~21 ms).',
  },
  {
    id: 'helix',
    name: 'Line 6 Helix / HX',
    sampleRate: 48000,
    irLength: 2048,
  },
  {
    id: 'custom',
    name: 'Customizado',
    sampleRate: 48000,
    irLength: 1024,
  },
];

export const DEFAULT_DEVICE_ID = 'nano-cortex';

export function getDevicePreset(id: string): DevicePreset {
  return DEVICE_PRESETS.find((d) => d.id === id) ?? DEVICE_PRESETS[0]!;
}
