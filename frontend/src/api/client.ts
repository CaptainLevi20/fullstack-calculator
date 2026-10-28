// Typed client for POST /api/v1/calculate. Results stay strings: JSON.parse
// only produces numbers for JSON numbers, and the API never sends any.
import type { CalcRequest } from '../calculator/types';

/** One request/response pair, as shown in the inspector. */
export interface Exchange {
  request: CalcRequest;
  status: number | null; // null when no response arrived
  response: unknown; // parsed JSON, raw text, or null
}

export type CalcOutcome =
  | { kind: 'success'; result: string; rounded: boolean; exchange: Exchange }
  | { kind: 'apiError'; code: string; message: string; exchange: Exchange }
  | { kind: 'transportError'; message: string; exchange: Exchange };

export type CalculateFn = (request: CalcRequest) => Promise<CalcOutcome>;

export const CALCULATE_PATH = '/api/v1/calculate';
export const REQUEST_TIMEOUT_MS = 10_000;
export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Try again.";
export const BAD_RESPONSE_MESSAGE = 'Unexpected response from the server.';

export async function calculate(
  request: CalcRequest,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<CalcOutcome> {
  let res: Response;
  let text: string;
  try {
    res = await fetchFn(CALCULATE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await res.text();
  } catch {
    return { kind: 'transportError', message: NETWORK_ERROR_MESSAGE, exchange: { request, status: null, response: null } };
  }

  const body = parseJSON(text);
  const exchange: Exchange = { request, status: res.status, response: body ?? text };

  if (res.ok) {
    if (isSuccessBody(body)) return { kind: 'success', result: body.result, rounded: body.rounded, exchange };
    return { kind: 'transportError', message: BAD_RESPONSE_MESSAGE, exchange };
  }
  if (isErrorBody(body)) return { kind: 'apiError', code: body.error.code, message: body.error.message, exchange };
  return { kind: 'transportError', message: NETWORK_ERROR_MESSAGE, exchange };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isSuccessBody(body: unknown): body is { result: string; rounded: boolean } {
  const b = body as { result?: unknown; rounded?: unknown } | null;
  return typeof b === 'object' && b !== null && typeof b.result === 'string' && typeof b.rounded === 'boolean';
}

function isErrorBody(body: unknown): body is { error: { code: string; message: string } } {
  const e = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return typeof e === 'object' && e !== null && typeof e.code === 'string' && typeof e.message === 'string';
}
