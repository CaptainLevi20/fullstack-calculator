import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Keypad } from './Keypad';
import type { Action } from '../calculator/reducer';

const cases: [string, Action][] = [
  ['clear', { type: 'clear' }], ['backspace', { type: 'backspace' }], ['percent of', { type: 'operator', operation: 'percent' }],
  ['divide', { type: 'operator', operation: 'divide' }], ['square root', { type: 'sqrt' }], ['power', { type: 'operator', operation: 'power' }],
  ['toggle sign', { type: 'toggleSign' }], ['multiply', { type: 'operator', operation: 'multiply' }], ['subtract', { type: 'operator', operation: 'subtract' }],
  ['add', { type: 'operator', operation: 'add' }], ['equals', { type: 'equals' }], ['decimal point', { type: 'decimal' }],
  ['7', { type: 'digit', digit: '7' }], ['0', { type: 'digit', digit: '0' }],
];
describe('Keypad', () => {
  it.each(cases)('"%s" dispatches its action', async (name, action) => {
    const onAction = vi.fn();
    render(<Keypad onAction={onAction} busy={false} />);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(onAction).toHaveBeenCalledWith(action);
  });
  it('shows the "% of" label', () => {
    render(<Keypad onAction={vi.fn()} busy={false} />);
    expect(screen.getByRole('button', { name: 'percent of' })).toHaveTextContent('% of');
  });
  it('has all 22 keys', () => {
    render(<Keypad onAction={vi.fn()} busy={false} />);
    expect(screen.getAllByRole('button')).toHaveLength(22);
  });
  it('marks = busy while a request is in flight', () => {
    render(<Keypad onAction={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: 'equals' })).toHaveAttribute('aria-busy', 'true');
  });
});
