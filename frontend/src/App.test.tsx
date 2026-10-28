import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import type { CalcOutcome } from './api/client';
import type { CalcRequest } from './calculator/types';

const TEN_THIRDS = '3.333333333333333333333333333333333';
type Canned = { result: string; rounded: boolean } | { code: string; message: string };
function fakeApi(results: Record<string, Canned>) {
  return vi.fn(async (request: CalcRequest): Promise<CalcOutcome> => {
    const r = results[JSON.stringify(request)];
    const exchange = { request, status: 'result' in r ? 200 : 422, response: r };
    return 'result' in r ? { kind: 'success', ...r, exchange } : { kind: 'apiError', ...r, exchange };
  });
}
const key = (name: string) => screen.getByRole('button', { name });

describe('App', () => {
  it('calculates from the keypad and fills history and inspector', async () => {
    const api = fakeApi({ '{"operation":"divide","operands":["10","3"]}': { result: TEN_THIRDS, rounded: true } });
    render(<App api={api} />);
    for (const name of ['1', '0', 'divide', '3', 'equals']) await userEvent.click(key(name));
    await waitFor(() => expect(screen.getByText('≈ rounded to 34 digits')).toBeInTheDocument());
    expect(document.querySelector('.display-entry')).toHaveTextContent(TEN_THIRDS);
    await userEvent.click(key('History')); // sections start collapsed; hidden rows are not in the a11y tree
    expect(screen.getByRole('button', { name: /10 ÷ 3/ })).toBeInTheDocument(); // history row
    expect(screen.getByText('{"operation":"divide","operands":["10","3"]}')).toBeInTheDocument();
  });

  it('accepts the physical keyboard', async () => {
    const api = fakeApi({ '{"operation":"add","operands":["2","3"]}': { result: '5', rounded: false } });
    render(<App api={api} />);
    await userEvent.keyboard('2+3{Enter}');
    await waitFor(() => expect(api).toHaveBeenCalledWith({ operation: 'add', operands: ['2', '3'] }));
  });

  it('Enter on a focused key evaluates once', async () => {
    const api = fakeApi({ '{"operation":"add","operands":["2","3"]}': { result: '5', rounded: false } });
    render(<App api={api} />);
    for (const name of ['2', 'add', '3']) await userEvent.click(key(name)); // focus stays on "3"
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith({ operation: 'add', operands: ['2', '3'] });
  });

  it('Enter on a focused digit key does not press that key again', async () => {
    const api = fakeApi({});
    render(<App api={api} />);
    await userEvent.click(key('7')); // focus stays on "7"; nothing to evaluate yet
    await userEvent.keyboard('{Enter}');
    expect(document.querySelector('.display-entry')).toHaveTextContent(/^7$/);
    expect(api).not.toHaveBeenCalled();
  });

  it('Enter on a non-keypad button activates that button instead of evaluating', async () => {
    const api = fakeApi({});
    render(<App api={api} />);
    await userEvent.keyboard('2+3');
    const history = key('History');
    history.focus();
    await userEvent.keyboard('{Enter}');
    expect(history).toHaveAttribute('aria-expanded', 'true');
    expect(api).not.toHaveBeenCalled();
  });

  it('shows API errors in the display', async () => {
    const api = fakeApi({ '{"operation":"divide","operands":["1","0"]}': { code: 'DIVISION_BY_ZERO', message: 'Cannot divide by zero.' } });
    render(<App api={api} />);
    await userEvent.keyboard('1/0{Enter}');
    expect(await screen.findByText('Cannot divide by zero.')).toBeInTheDocument();
  });

  it('ignores shortcuts with modifier keys', async () => {
    render(<App api={fakeApi({})} />);
    await userEvent.keyboard('{Control>}1{/Control}');
    expect(document.querySelector('.display-entry')).toHaveTextContent(/^0$/);
  });
});
