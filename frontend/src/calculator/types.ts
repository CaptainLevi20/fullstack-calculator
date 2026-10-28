export type BinaryOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percent';
export type Operation = BinaryOperation | 'sqrt';

/** Body of POST /api/v1/calculate. Operands are decimal strings. */
export interface CalcRequest {
  operation: Operation;
  operands: string[];
}

export interface HistoryEntry {
  expression: string;
  result: string;
  rounded: boolean;
}
