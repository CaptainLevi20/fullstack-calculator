import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { Section } from './Section';
it('starts collapsed and toggles open', async () => {
  render(<Section title="History"><p>content</p></Section>);
  const toggle = screen.getByRole('button', { name: 'History' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('content').parentElement).toHaveAttribute('hidden');
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('content').parentElement).not.toHaveAttribute('hidden');
});
