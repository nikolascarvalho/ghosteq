// Carrega um loop de exemplo: primeiro o arquivo REAL em /samples/<estilo>.wav
// (gravado pelo usuário no Nano); se não existir e estivermos em
// desenvolvimento, sintetiza um placeholder. Em produção sem o arquivo: null.
import type { AudioEngine } from './engine';
import { synthLoop, type LoopStyle } from './placeholderLoops';

export interface LoadedLoop {
  buffer: AudioBuffer;
  placeholder: boolean;
}

export async function loadExampleLoop(engine: AudioEngine, style: LoopStyle): Promise<LoadedLoop | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/${style}.wav`);
    const type = res.headers.get('content-type') ?? '';
    // O dev server devolve index.html (200) para arquivo inexistente: confere o tipo.
    if (res.ok && !type.includes('text/html')) {
      return { buffer: await engine.decodeFile(await res.arrayBuffer()), placeholder: false };
    }
  } catch {
    /* offline ou sem arquivo: tenta o placeholder */
  }
  if (!import.meta.env.DEV) return null;
  const fs = engine.ctx.sampleRate;
  return { buffer: engine.bufferFromSamples(synthLoop(style, fs), fs), placeholder: true };
}
