// Pure string rules for the number being typed. Numbers stay strings so the
// browser never rounds them through IEEE-754 doubles.

/** Most digits an operand may have; matches the backend's limit. */
export const MAX_DIGITS = 34;

export function countDigits(entry: string): number {
  return entry.replace(/[^0-9]/g, '').length;
}

export function appendDigit(entry: string, digit: string): string {
  if (entry === '0') return digit;
  if (entry === '-0') return `-${digit}`;
  if (countDigits(entry) >= MAX_DIGITS) return entry;
  return entry + digit;
}

export function appendDecimalPoint(entry: string): string {
  return entry.includes('.') ? entry : `${entry}.`;
}

export function toggleSign(entry: string): string {
  return entry.startsWith('-') ? entry.slice(1) : `-${entry}`;
}

export function deleteLast(entry: string): string {
  const rest = entry.slice(0, -1);
  return rest === '' || rest === '-' || rest === '0' || rest === '-0' ? '0' : rest;
}

/** Drops a trailing decimal point so "5." is sent as "5". */
export function normalizeOperand(entry: string): string {
  return entry.endsWith('.') ? entry.slice(0, -1) : entry;
}
