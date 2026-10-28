import { useState } from 'react';
import type { HistoryEntry } from '../calculator/types';

export function History({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return <p className="empty">No calculations yet.</p>;
  return (
    <ol className="history">
      {entries.map((entry, i) => (
        // Entries are only ever prepended, so counting from the oldest keeps
        // keys stable (until the history reaches its cap and starts dropping).
        <HistoryRow key={entries.length - i} entry={entry} />
      ))}
    </ol>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        className={open ? 'history-row history-row--open' : 'history-row'}
        title={entry.result}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="history-expression">{entry.expression}</span>
        <span className="history-value">{`${entry.rounded ? '≈ ' : ''}${entry.result}`}</span>
      </button>
    </li>
  );
}
