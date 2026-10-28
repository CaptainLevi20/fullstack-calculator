import { describe, expect, it } from 'vitest';
import { appendDecimalPoint, appendDigit, countDigits, deleteLast, normalizeOperand, toggleSign } from './entry';

describe('entry rules', () => {
  it.each([
    ['0', '5', '5'], ['-0', '5', '-5'], ['12', '3', '123'], ['0', '0', '0'], ['0.', '0', '0.0'],
  ])('appendDigit(%s, %s) = %s', (entry, digit, want) => expect(appendDigit(entry, digit)).toBe(want));

  it('caps an operand at 34 digits, counting leading zeros', () => {
    const full = '1'.repeat(34);
    expect(appendDigit(full, '1')).toBe(full);
    const almost = '0.' + '0'.repeat(32); // 33 digits
    expect(appendDigit(almost, '7')).toBe(almost + '7');
    expect(appendDigit(almost + '7', '1')).toBe(almost + '7');
  });

  it.each([['12', '12.'], ['12.5', '12.5'], ['-0', '-0.']])('appendDecimalPoint(%s) = %s', (e, w) => expect(appendDecimalPoint(e)).toBe(w));
  it.each([['5', '-5'], ['-5', '5'], ['0', '-0'], ['1.5E+40', '-1.5E+40']])('toggleSign(%s) = %s', (e, w) => expect(toggleSign(e)).toBe(w));
  it.each([['123', '12'], ['5', '0'], ['-5', '0'], ['0.', '0'], ['-1.', '-1']])('deleteLast(%s) = %s', (e, w) => expect(deleteLast(e)).toBe(w));
  it.each([['5.', '5'], ['-0.', '-0'], ['12.50', '12.50'], ['1.5E+40', '1.5E+40']])('normalizeOperand(%s) = %s', (e, w) => expect(normalizeOperand(e)).toBe(w));
  it('countDigits ignores sign and point', () => expect(countDigits('-12.50')).toBe(4));
});
