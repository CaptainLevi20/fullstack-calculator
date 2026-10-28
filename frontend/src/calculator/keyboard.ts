import type { Action } from './reducer';
import type { BinaryOperation } from './types';

const OPERATOR_KEYS: Record<string, BinaryOperation> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '^': 'power',
  '%': 'percent',
};

/** Maps a KeyboardEvent.key to a keypad action, or null for keys the calculator ignores. */
export function keyToAction(key: string): Action | null {
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: key };
  if (key in OPERATOR_KEYS) return { type: 'operator', operation: OPERATOR_KEYS[key] };
  switch (key) {
    case '.':
      return { type: 'decimal' };
    case 'Enter':
    case '=':
      return { type: 'equals' };
    case 'Backspace':
      return { type: 'backspace' };
    case 'Escape':
      return { type: 'clear' };
  }
  return null;
}
