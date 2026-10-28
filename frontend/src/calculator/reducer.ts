// The keypad as a pure state machine. Binary operations evaluate strictly left
// to right; each evaluation becomes a `pending` request that the app sends to
// the API and answers with `resolved` or `failed`.
import { appendDecimalPoint, appendDigit, deleteLast, normalizeOperand, toggleSign } from './entry';
import type { BinaryOperation, CalcRequest, HistoryEntry } from './types';

export type Action =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operator'; operation: BinaryOperation }
  | { type: 'sqrt' }
  | { type: 'equals' }
  | { type: 'resolved'; result: string; rounded: boolean }
  | { type: 'failed'; message: string };

type KeyAction = Exclude<Action, { type: 'resolved' } | { type: 'failed' }>;

export interface Pending {
  request: CalcRequest;
  expression: string;
  /** What to do with the result: finish, apply to a pending operation, or chain into a new one. */
  then: 'equals' | 'sqrt' | BinaryOperation;
}

export interface State {
  entry: string; // number on the result line
  overwrite: boolean; // next digit/decimal replaces entry
  accumulator: string | null; // first operand of the pending binary operation
  operation: BinaryOperation | null;
  awaitingOperand: boolean; // operator pressed, second operand not entered yet
  rounded: boolean;
  expression: string; // upper display line
  error: string | null;
  pending: Pending | null; // request in flight; input is locked while set
  history: HistoryEntry[]; // newest first
}

export const HISTORY_LIMIT = 50;

export const SYMBOLS: Record<BinaryOperation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  percent: '% of',
};

export const initialState: State = {
  entry: '0',
  overwrite: false,
  accumulator: null,
  operation: null,
  awaitingOperand: false,
  rounded: false,
  expression: '',
  error: null,
  pending: null,
  history: [],
};

export function reducer(state: State, action: Action): State {
  if (state.pending) {
    if (action.type === 'resolved') return resolve(state, state.pending, action.result, action.rounded);
    if (action.type === 'failed') {
      return { ...state, error: action.message, expression: `${state.pending.expression} =`, pending: null };
    }
    return state;
  }
  if (action.type === 'resolved' || action.type === 'failed') return state;
  if (state.error !== null) {
    const fresh = { ...initialState, history: state.history };
    return action.type === 'digit' || action.type === 'decimal' ? keypress(fresh, action) : fresh;
  }
  return keypress(state, action);
}

function keypress(state: State, action: KeyAction): State {
  switch (action.type) {
    case 'digit':
    case 'decimal': {
      const base = state.overwrite ? '0' : state.entry;
      const entry = action.type === 'digit' ? appendDigit(base, action.digit) : appendDecimalPoint(base);
      return { ...state, entry, overwrite: false, awaitingOperand: false, rounded: false, expression: operatorExpression(state) };
    }
    case 'toggleSign':
      if (state.awaitingOperand) return { ...state, entry: '-0', overwrite: false, awaitingOperand: false };
      return { ...state, entry: toggleSign(state.entry) };
    case 'backspace':
      return state.overwrite ? state : { ...state, entry: deleteLast(state.entry) };
    case 'clear':
      return { ...initialState, history: state.history };
    case 'operator': {
      const next = action.operation;
      if (state.accumulator !== null && state.operation !== null) {
        if (state.awaitingOperand) {
          return { ...state, operation: next, expression: `${state.accumulator} ${SYMBOLS[next]}` };
        }
        return { ...state, pending: binaryPending(state.accumulator, state.operation, state.entry, next) };
      }
      const accumulator = normalizeOperand(state.entry);
      return {
        ...state,
        entry: accumulator,
        accumulator,
        operation: next,
        awaitingOperand: true,
        overwrite: true,
        rounded: false,
        expression: `${accumulator} ${SYMBOLS[next]}`,
      };
    }
    case 'sqrt': {
      if (state.awaitingOperand) return state;
      const x = normalizeOperand(state.entry);
      return { ...state, pending: { request: { operation: 'sqrt', operands: [x] }, expression: `√${x}`, then: 'sqrt' } };
    }
    case 'equals':
      if (state.accumulator === null || state.operation === null || state.awaitingOperand) return state;
      return { ...state, pending: binaryPending(state.accumulator, state.operation, state.entry, 'equals') };
  }
}

function binaryPending(accumulator: string, operation: BinaryOperation, entry: string, then: Pending['then']): Pending {
  const b = normalizeOperand(entry);
  return {
    request: { operation, operands: [accumulator, b] },
    expression: `${accumulator} ${SYMBOLS[operation]} ${b}`,
    then,
  };
}

function operatorExpression(state: State): string {
  return state.accumulator !== null && state.operation !== null ? `${state.accumulator} ${SYMBOLS[state.operation]}` : '';
}

function resolve(state: State, pending: Pending, result: string, rounded: boolean): State {
  const history = [{ expression: pending.expression, result, rounded }, ...state.history].slice(0, HISTORY_LIMIT);
  const base: State = { ...state, history, entry: result, rounded, overwrite: true, pending: null };
  switch (pending.then) {
    case 'equals':
      return { ...base, accumulator: null, operation: null, expression: `${pending.expression} =` };
    case 'sqrt':
      return state.accumulator !== null && state.operation !== null
        ? { ...base, expression: `${state.accumulator} ${SYMBOLS[state.operation]} ${pending.expression}` }
        : { ...base, expression: `${pending.expression} =` };
    default:
      return {
        ...base,
        accumulator: result,
        operation: pending.then,
        awaitingOperand: true,
        expression: `${result} ${SYMBOLS[pending.then]}`,
      };
  }
}
