import type { InputHTMLAttributes } from 'react';
import { useCurveStore } from '../../state/curveStore';

/**
 * Slider (input range) que agrupa um arrasto inteiro numa única entrada de
 * desfazer: abre um "gesto" ao encostar e fecha ao soltar.
 */
export function GestureRange(props: InputHTMLAttributes<HTMLInputElement>) {
  const { beginGesture, endGesture } = useCurveStore.getState();
  return (
    <input
      type="range"
      {...props}
      onPointerDown={(e) => {
        beginGesture();
        props.onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        endGesture();
        props.onPointerUp?.(e);
      }}
      onPointerCancel={() => endGesture()}
      onBlur={(e) => {
        endGesture();
        props.onBlur?.(e);
      }}
    />
  );
}
