// AudioWorklet que só observa: conta quantos canais REALMENTE chegam na entrada
// e mede o pico por canal. Roda na thread de áudio (fora da UI).
// Com channelCountMode 'max', inputs[0].length = número real de canais da fonte.
class ChannelProbe extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = 0;
    this.peaks = [];
  }

  process(inputs) {
    const input = inputs[0] || [];
    const n = input.length;
    if (this.peaks.length !== n) this.peaks = new Array(n).fill(0);
    for (let c = 0; c < n; c++) {
      const ch = input[c];
      let p = this.peaks[c];
      for (let i = 0; i < ch.length; i++) {
        const v = Math.abs(ch[i]);
        if (v > p) p = v;
      }
      this.peaks[c] = p;
    }
    this.frames += 128;
    // ~10 relatórios por segundo
    if (this.frames >= sampleRate / 10) {
      this.port.postMessage({ channels: n, peaks: this.peaks });
      this.peaks = new Array(n).fill(0);
      this.frames = 0;
    }
    return true;
  }
}

registerProcessor('channel-probe', ChannelProbe);
