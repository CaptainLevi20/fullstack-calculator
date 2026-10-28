import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Display } from './Display';

const TEN_THIRDS = '3.333333333333333333333333333333333';
describe('Display', () => {
  it('shows the expression and the full entry', () => {
    render(<Display expression="10 ÷ 3 =" entry={TEN_THIRDS} rounded={false} error={null} />);
    expect(screen.getByText('10 ÷ 3 =')).toBeInTheDocument();
    expect(screen.getByText(TEN_THIRDS)).toBeInTheDocument();
    expect(screen.queryByText('≈ rounded to 34 digits')).not.toBeInTheDocument();
  });
  it('shows the rounded badge', () => {
    render(<Display expression="" entry={TEN_THIRDS} rounded error={null} />);
    expect(screen.getByText('≈ rounded to 34 digits')).toBeInTheDocument();
  });
  it('replaces the entry with the error and hides the badge', () => {
    render(<Display expression="1250.75 ÷ 0 =" entry="0" rounded error="Cannot divide by zero." />);
    expect(screen.getByText('Cannot divide by zero.')).toHaveClass('display-error');
    expect(document.querySelector('.display-entry')).not.toBeInTheDocument();
    expect(screen.queryByText('≈ rounded to 34 digits')).not.toBeInTheDocument();
  });
  it('announces changes politely', () => {
    const { container } = render(<Display expression="" entry="0" rounded={false} error={null} />);
    expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite');
  });
});
