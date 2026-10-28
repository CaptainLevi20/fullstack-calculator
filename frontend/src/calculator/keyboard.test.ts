import { describe, expect, it } from 'vitest';
import { keyToAction } from './keyboard';

describe('keyToAction', () => {
  it.each([
    ['7', { type: 'digit', digit: '7' }], ['.', { type: 'decimal' }],
    ['+', { type: 'operator', operation: 'add' }], ['-', { type: 'operator', operation: 'subtract' }],
    ['*', { type: 'operator', operation: 'multiply' }], ['/', { type: 'operator', operation: 'divide' }],
    ['^', { type: 'operator', operation: 'power' }], ['%', { type: 'operator', operation: 'percent' }],
    ['Enter', { type: 'equals' }], ['=', { type: 'equals' }], ['Backspace', { type: 'backspace' }], ['Escape', { type: 'clear' }],
  ])('maps %s', (key, action) => expect(keyToAction(key)).toEqual(action));
  it.each(['a', ',', ' ', 'Tab'])('ignores %s', (key) => expect(keyToAction(key)).toBeNull());
});
