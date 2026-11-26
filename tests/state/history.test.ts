import { describe, expect, it } from 'vitest';
import { emptyHistory, record, redo, undo } from '../../src/state/history';

describe('histórico (desfazer/refazer)', () => {
  it('desfaz e refaz na ordem certa', () => {
    let h = emptyHistory<string>();
    h = record(h, 'a'); // a → b
    h = record(h, 'b'); // b → c
    const u1 = undo(h, 'c')!;
    expect(u1.value).toBe('b');
    const u2 = undo(u1.history, 'b')!;
    expect(u2.value).toBe('a');
    expect(undo(u2.history, 'a')).toBeNull();
    const r1 = redo(u2.history, 'a')!;
    expect(r1.value).toBe('b');
    expect(redo(r1.history, 'b')!.value).toBe('c');
  });

  it('nova edição limpa o refazer', () => {
    let h = record(emptyHistory<string>(), 'a');
    h = undo(h, 'b')!.history;
    expect(h.future).toEqual(['b']);
    h = record(h, 'a');
    expect(h.future).toEqual([]);
  });

  it('respeita o limite de tamanho', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 10; i++) h = record(h, i, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });
});
