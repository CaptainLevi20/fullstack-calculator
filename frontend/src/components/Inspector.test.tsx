import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Inspector } from './Inspector';
import type { Exchange } from '../api/client';

const exchange: Exchange = { request: { operation: 'divide', operands: ['10', '3'] }, status: 200, response: { result: '3.3', rounded: true } };
const body = '{"operation":"divide","operands":["10","3"]}';
afterEach(() => vi.useRealTimers());

describe('Inspector', () => {
  it('shows the last exchange', () => {
    render(<Inspector exchange={exchange} origin="http://localhost:8080" clipboard={{ writeText: vi.fn() }} />);
    expect(screen.getByText('POST /api/v1/calculate')).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByText('← 200')).toBeInTheDocument();
    expect(screen.getByText('{"result":"3.3","rounded":true}')).toBeInTheDocument();
  });
  it('copies the request JSON and confirms for 1.5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn(async () => {});
    render(<Inspector exchange={exchange} origin="http://localhost:8080" clipboard={{ writeText }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    expect(writeText).toHaveBeenCalledWith(body);
    expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument();
  });
  it('copies a cURL command', async () => {
    const writeText = vi.fn(async () => {});
    render(<Inspector exchange={exchange} origin="http://localhost:8080" clipboard={{ writeText }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy cURL' }));
    expect(writeText).toHaveBeenCalledWith(`curl -X POST http://localhost:8080/api/v1/calculate -H "Content-Type: application/json" -d '${body}'`);
  });
  it('reports a clipboard failure', async () => {
    render(<Inspector exchange={exchange} origin="http://localhost:8080" clipboard={{ writeText: vi.fn(async () => { throw new Error('denied'); }) }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument();
  });
  it('shows a network failure and an empty state', () => {
    const { rerender } = render(<Inspector exchange={{ ...exchange, status: null, response: null }} origin="" clipboard={{ writeText: vi.fn() }} />);
    expect(screen.getByText('← no response')).toBeInTheDocument();
    rerender(<Inspector exchange={null} origin="" clipboard={{ writeText: vi.fn() }} />);
    expect(screen.getByText('No requests yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeDisabled();
  });
});
