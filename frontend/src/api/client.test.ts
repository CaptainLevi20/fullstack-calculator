import { describe, expect, it, vi } from 'vitest';
import { BAD_RESPONSE_MESSAGE, NETWORK_ERROR_MESSAGE, calculate } from './client';
import type { CalcRequest } from '../calculator/types';

const add: CalcRequest = { operation: 'add', operands: ['0.1', '0.2'] };
const reply = (status: number, body: string) => vi.fn(async () => new Response(body, { status }));

describe('calculate', () => {
  it('posts the request as JSON and returns the result as a string', async () => {
    const fetchFn = reply(200, '{"result":"0.3","rounded":false}');
    const outcome = await calculate(add, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/api/v1/calculate', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"operation":"add","operands":["0.1","0.2"]}',
    }));
    expect(outcome).toEqual({ kind: 'success', result: '0.3', rounded: false, exchange: { request: add, status: 200, response: { result: '0.3', rounded: false } } });
  });

  it('never converts the result to a number', async () => {
    const long = '0.1000000000000000000000000000000001';
    const outcome = await calculate(add, reply(200, `{"result":"${long}","rounded":false}`));
    expect(outcome.kind === 'success' && outcome.result).toBe(long);
  });

  it('maps an API error', async () => {
    const outcome = await calculate(add, reply(422, '{"error":{"code":"DIVISION_BY_ZERO","message":"Cannot divide by zero."}}'));
    expect(outcome).toMatchObject({ kind: 'apiError', code: 'DIVISION_BY_ZERO', message: 'Cannot divide by zero.', exchange: { status: 422 } });
  });

  it('treats a non-JSON error page as unreachable', async () => {
    const outcome = await calculate(add, reply(502, '<html>Bad Gateway</html>'));
    expect(outcome).toMatchObject({ kind: 'transportError', message: NETWORK_ERROR_MESSAGE, exchange: { status: 502, response: '<html>Bad Gateway</html>' } });
  });

  it('rejects a success body with the wrong shape', async () => {
    const outcome = await calculate(add, reply(200, '{"result":0.3}'));
    expect(outcome).toMatchObject({ kind: 'transportError', message: BAD_RESPONSE_MESSAGE });
  });

  it('reports network failures', async () => {
    const outcome = await calculate(add, vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(outcome).toEqual({ kind: 'transportError', message: NETWORK_ERROR_MESSAGE, exchange: { request: add, status: null, response: null } });
  });

  it('gives up when the server never answers', async () => {
    const hang = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    const outcome = await calculate(add, hang, 20);
    expect(outcome).toMatchObject({ kind: 'transportError', message: NETWORK_ERROR_MESSAGE });
  });
});
