import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { History } from './History';

const TEN_THIRDS = '3.333333333333333333333333333333333';
describe('History', () => {
  it('lists entries in the given order with the rounded prefix and full value on hover', () => {
    render(<History entries={[{ expression: '10 ÷ 3', result: TEN_THIRDS, rounded: true }, { expression: '15 % of 200', result: '30', rounded: false }]} />);
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('10 ÷ 3');
    expect(rows[0]).toHaveTextContent(`≈ ${TEN_THIRDS}`);
    expect(rows[0]).toHaveAttribute('title', TEN_THIRDS);
    expect(rows[1]).toHaveTextContent('30');
  });
  it('expands and collapses a row on click', async () => {
    render(<History entries={[{ expression: '√2', result: '1.414213562373095048801688724209698', rounded: true }]} />);
    const row = screen.getByRole('button');
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(row).toHaveClass('history-row--open');
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });
  it('has an empty state', () => {
    render(<History entries={[]} />);
    expect(screen.getByText('No calculations yet.')).toBeInTheDocument();
  });
});
