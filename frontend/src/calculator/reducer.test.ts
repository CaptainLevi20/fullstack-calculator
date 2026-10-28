import { describe, expect, it } from 'vitest';
import { initialState, reducer, type Action, type State } from './reducer';

const KEYS: Record<string, Action> = {
  '+': { type: 'operator', operation: 'add' }, '−': { type: 'operator', operation: 'subtract' },
  '×': { type: 'operator', operation: 'multiply' }, '÷': { type: 'operator', operation: 'divide' },
  '^': { type: 'operator', operation: 'power' }, '%': { type: 'operator', operation: 'percent' },
  '√': { type: 'sqrt' }, '=': { type: 'equals' }, '±': { type: 'toggleSign' }, '⌫': { type: 'backspace' }, AC: { type: 'clear' },
};
// "10 ÷ 3 =" → digits/points per character, symbols per token
function press(state: State, keys: string): State {
  return keys.split(' ').flatMap((token): Action[] =>
    KEYS[token] ? [KEYS[token]] : [...token].map((c): Action => (c === '.' ? { type: 'decimal' } : { type: 'digit', digit: c })),
  ).reduce(reducer, state);
}
const resolve = (s: State, result: string, rounded = false) => reducer(s, { type: 'resolved', result, rounded });
const TEN_THIRDS = '3.333333333333333333333333333333333';

describe('keypad reducer', () => {
  it('types numbers', () => expect(press(initialState, '10').entry).toBe('10'));
  it('starts with a decimal point as 0.', () => expect(press(initialState, '. 5').entry).toBe('0.5'));

  it('evaluates with = and records history', () => {
    const asked = press(initialState, '10 ÷ 3 =');
    expect(asked.pending).toEqual({ request: { operation: 'divide', operands: ['10', '3'] }, expression: '10 ÷ 3', then: 'equals' });
    const done = resolve(asked, TEN_THIRDS, true);
    expect(done).toMatchObject({ entry: TEN_THIRDS, rounded: true, expression: '10 ÷ 3 =', pending: null, accumulator: null });
    expect(done.history[0]).toEqual({ expression: '10 ÷ 3', result: TEN_THIRDS, rounded: true });
  });

  it('ignores input while a request is in flight', () => {
    const asked = press(initialState, '10 ÷ 3 =');
    expect(press(asked, '5')).toBe(asked);
    expect(press(asked, 'AC')).toBe(asked);
  });

  it('chains left to right without precedence', () => {
    const asked = press(initialState, '2 + 3 ×');
    expect(asked.pending).toMatchObject({ request: { operation: 'add', operands: ['2', '3'] }, then: 'multiply' });
    const chained = resolve(asked, '5');
    expect(chained).toMatchObject({ accumulator: '5', operation: 'multiply', awaitingOperand: true, entry: '5', expression: '5 ×' });
    expect(chained.history[0].expression).toBe('2 + 3');
    expect(press(chained, '4 =').pending?.request).toEqual({ operation: 'multiply', operands: ['5', '4'] });
  });

  it('replaces an operator pressed right after another', () => {
    expect(press(initialState, '2 + ×')).toMatchObject({ operation: 'multiply', expression: '2 ×', pending: null });
  });

  it('ignores = without a second operand, without an operator, and after a result', () => {
    expect(press(initialState, '2 + =').pending).toBeNull();
    expect(press(initialState, '5 =').pending).toBeNull();
    expect(press(resolve(press(initialState, '1 + 1 ='), '2'), '=').pending).toBeNull();
  });

  it('after a result: digit starts fresh, operator chains, √ applies to it', () => {
    const result = resolve(press(initialState, '10 ÷ 3 ='), TEN_THIRDS, true);
    expect(press(result, '7')).toMatchObject({ entry: '7', expression: '', rounded: false, accumulator: null });
    expect(press(result, '.').entry).toBe('0.');
    expect(press(result, '+')).toMatchObject({ accumulator: TEN_THIRDS, expression: `${TEN_THIRDS} +` });
    expect(press(result, '√').pending?.request).toEqual({ operation: 'sqrt', operands: [TEN_THIRDS] });
  });

  it('applies √ immediately', () => {
    const asked = press(initialState, '2 √');
    expect(asked.pending).toEqual({ request: { operation: 'sqrt', operands: ['2'] }, expression: '√2', then: 'sqrt' });
    const done = resolve(asked, '1.414213562373095048801688724209698', true);
    expect(done).toMatchObject({ expression: '√2 =', accumulator: null });
    expect(done.history[0].expression).toBe('√2');
  });

  it('applies √ to the second operand and keeps the pending operation', () => {
    const root = resolve(press(initialState, '9 + 16 √'), '4');
    expect(root).toMatchObject({ accumulator: '9', operation: 'add', entry: '4', expression: '9 + √16' });
    expect(press(root, '=').pending?.request).toEqual({ operation: 'add', operands: ['9', '4'] });
    expect(press(initialState, '9 + √').pending).toBeNull();
  });

  it('labels percent and power in the expression', () => {
    expect(press(initialState, '15 % 200 =').pending).toMatchObject({ request: { operation: 'percent', operands: ['15', '200'] }, expression: '15 % of 200' });
    expect(press(initialState, '2 ^ 10 =').pending).toMatchObject({ request: { operation: 'power', operands: ['2', '10'] }, expression: '2 ^ 10' });
  });

  it('normalises a trailing decimal point before sending', () => {
    const s = press(initialState, '5. + 1 =');
    expect(s.accumulator).toBe('5');
    expect(s.pending?.request.operands).toEqual(['5', '1']);
  });

  it('handles the sign key', () => {
    expect(press(initialState, '5 ±').entry).toBe('-5');
    expect(press(initialState, '2 + ± 3 =').pending?.request.operands).toEqual(['2', '-3']);
    const result = resolve(press(initialState, '1 + 2 ='), '3');
    expect(press(result, '±').entry).toBe('-3');
    expect(press(result, '± 7').entry).toBe('7');
  });

  it('ignores backspace on a result', () => {
    const result = resolve(press(initialState, '1 + 2 ='), '3');
    expect(press(result, '⌫')).toEqual(result);
  });

  it('sends a scientific-notation result back verbatim when chaining', () => {
    const big = resolve(press(initialState, '1 + 1 ='), '1.5E+40');
    expect(press(big, '× 2 =').pending?.request).toEqual({ operation: 'multiply', operands: ['1.5E+40', '2'] });
  });

  it('shows errors and resets on the next key, keeping history', () => {
    const withHistory = resolve(press(initialState, '1 + 1 ='), '2');
    const failed = reducer(press(withHistory, '1250.75 ÷ 0 ='), { type: 'failed', message: 'Cannot divide by zero.' });
    expect(failed).toMatchObject({ error: 'Cannot divide by zero.', expression: '1250.75 ÷ 0 =', pending: null });
    expect(press(failed, '7')).toMatchObject({ entry: '7', error: null, history: withHistory.history });
    expect(press(failed, '+')).toEqual({ ...initialState, history: withHistory.history });
  });

  it('keeps history across AC and caps it at 50 entries', () => {
    let s = initialState;
    for (let i = 0; i < 51; i++) s = resolve(press(s, '1 + 1 ='), String(i));
    expect(s.history).toHaveLength(50);
    expect(s.history[0].result).toBe('50');
    expect(press(s, 'AC').history).toHaveLength(50);
  });
});
