import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Section } from './Section';

/** Stubs window.matchMedia so `(min-width: 768px)` matches when `wide`. */
function stubViewport(wide: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: wide,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => mql));
  return (next: boolean) => {
    mql.matches = next;
    listeners.forEach((listener) => listener());
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Section', () => {
  it('starts collapsed and toggles open on narrow screens', async () => {
    stubViewport(false);
    render(<Section title="History"><p>content</p></Section>);
    const toggle = screen.getByRole('button', { name: 'History' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('content').parentElement).toHaveAttribute('hidden');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('content').parentElement).not.toHaveAttribute('hidden');
  });

  it('is a plain heading with its content exposed on wide screens', () => {
    stubViewport(true);
    render(<Section title="History"><p>content</p></Section>);
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('content').parentElement).not.toHaveAttribute('hidden');
  });

  it('follows the viewport when it crosses the breakpoint', () => {
    const resize = stubViewport(false);
    render(<Section title="History"><p>content</p></Section>);
    expect(screen.getByText('content').parentElement).toHaveAttribute('hidden');
    act(() => resize(true));
    expect(screen.getByText('content').parentElement).not.toHaveAttribute('hidden');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
