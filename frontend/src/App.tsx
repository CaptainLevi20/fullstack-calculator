import { useEffect } from 'react';
import { calculate, type CalculateFn } from './api/client';
import { keyToAction } from './calculator/keyboard';
import { useCalculator } from './calculator/useCalculator';
import { Display } from './components/Display';
import { History } from './components/History';
import { Inspector } from './components/Inspector';
import { Keypad } from './components/Keypad';
import { Section } from './components/Section';

function isButtonOutsideKeypad(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button') !== null && target.closest('.keypad') === null;
}

export default function App({ api = calculate }: { api?: CalculateFn }) {
  const { state, dispatch, exchange } = useCalculator(api);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Enter on any other button (section toggles, history rows, copy
      // buttons) must activate that button, not evaluate.
      if (event.key === 'Enter' && isButtonOutsideKeypad(event.target)) return;
      const action = keyToAction(event.key);
      if (!action) return;
      // preventDefault also stops Enter from re-activating a focused keypad key.
      event.preventDefault();
      dispatch(action);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  return (
    <main className="app">
      <h1 className="visually-hidden">Precision Calculator</h1>
      <section className="calculator" aria-label="Calculator">
        <Display expression={state.expression} entry={state.entry} rounded={state.rounded} error={state.error} />
        <Keypad onAction={dispatch} busy={state.pending !== null} />
      </section>
      <aside className="side">
        <Section title="History">
          <History entries={state.history} />
        </Section>
        <Section title="Last API request">
          <Inspector exchange={exchange} />
        </Section>
      </aside>
    </main>
  );
}
