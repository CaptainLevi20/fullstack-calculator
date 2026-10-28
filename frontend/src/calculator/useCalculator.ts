import { useEffect, useReducer, useRef, useState, type Dispatch } from 'react';
import { calculate, type CalculateFn, type Exchange } from '../api/client';
import { initialState, reducer, type Action, type Pending, type State } from './reducer';

/**
 * Runs the keypad reducer and sends each pending request to the API, feeding
 * the outcome back as `resolved` or `failed`. Also exposes the last exchange
 * for the inspector.
 */
export function useCalculator(api: CalculateFn = calculate): {
  state: State;
  dispatch: Dispatch<Action>;
  exchange: Exchange | null;
} {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  // Remembers which request was sent, so StrictMode's double effect run in
  // development doesn't send it twice. A late answer is harmless: the reducer
  // ignores `resolved`/`failed` when nothing is pending.
  const sent = useRef<Pending | null>(null);
  const { pending } = state;

  useEffect(() => {
    if (!pending || sent.current === pending) return;
    sent.current = pending;
    void api(pending.request).then((outcome) => {
      setExchange(outcome.exchange);
      dispatch(
        outcome.kind === 'success'
          ? { type: 'resolved', result: outcome.result, rounded: outcome.rounded }
          : { type: 'failed', message: outcome.message },
      );
    });
  }, [pending, api]);

  return { state, dispatch, exchange };
}
