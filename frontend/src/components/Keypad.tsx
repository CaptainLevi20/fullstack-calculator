import type { Action } from '../calculator/reducer';

interface Key {
  label: string;
  name: string; // accessible name
  action: Action;
  kind: 'digit' | 'function' | 'operator' | 'equals';
  className?: string;
}

const digit = (d: string): Key => ({ label: d, name: d, action: { type: 'digit', digit: d }, kind: 'digit' });
const op = (label: string, name: string, operation: Extract<Action, { type: 'operator' }>['operation']): Key => ({
  label,
  name,
  action: { type: 'operator', operation },
  kind: 'operator',
});

// Grid order, four columns. "=" spans two rows and "0" spans two columns.
const KEYS: Key[] = [
  { label: 'AC', name: 'clear', action: { type: 'clear' }, kind: 'function' },
  { label: '⌫', name: 'backspace', action: { type: 'backspace' }, kind: 'function' },
  { ...op('% of', 'percent of', 'percent'), kind: 'function' },
  op('÷', 'divide', 'divide'),
  { label: '√', name: 'square root', action: { type: 'sqrt' }, kind: 'function' },
  { ...op('xʸ', 'power', 'power'), kind: 'function' },
  { label: '±', name: 'toggle sign', action: { type: 'toggleSign' }, kind: 'function' },
  op('×', 'multiply', 'multiply'),
  digit('7'), digit('8'), digit('9'),
  op('−', 'subtract', 'subtract'),
  digit('4'), digit('5'), digit('6'),
  op('+', 'add', 'add'),
  digit('1'), digit('2'), digit('3'),
  { label: '=', name: 'equals', action: { type: 'equals' }, kind: 'equals', className: 'key--tall' },
  { ...digit('0'), className: 'key--wide' },
  { label: '.', name: 'decimal point', action: { type: 'decimal' }, kind: 'digit' },
];

interface KeypadProps {
  onAction: (action: Action) => void;
  busy: boolean;
}

export function Keypad({ onAction, busy }: KeypadProps) {
  return (
    <div className="keypad">
      {KEYS.map((key) => (
        <button
          key={key.name}
          type="button"
          className={['key', `key--${key.kind}`, key.className].filter(Boolean).join(' ')}
          aria-label={key.name === key.label ? undefined : key.name}
          aria-busy={key.kind === 'equals' && busy ? true : undefined}
          onClick={() => onAction(key.action)}
        >
          {key.label}
        </button>
      ))}
    </div>
  );
}
