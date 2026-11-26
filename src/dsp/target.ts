// Ponto de extensão para a v2 (Match EQ e desenho livre).
// Hoje o único caminho é "biquads → IR". Na v2 entra "curva-alvo → IR"
// (FIR de fase mínima via cepstrum/Hilbert). Este tipo já deixa o restante do
// app (worker, exportação, gráfico) falando em "fonte do IR", não em biquads.
import type { Biquad } from './types';

export interface TargetCurve {
  freqs: Float64Array;
  magnitudeDb: Float64Array;
}

export type IrSource = { kind: 'biquads'; sections: Biquad[] } | { kind: 'target'; curve: TargetCurve }; // v2: ainda não implementado
