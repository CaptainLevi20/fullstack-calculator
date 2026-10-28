import { useEffect, useState } from 'react';
import { CALCULATE_PATH, type Exchange } from '../api/client';
import { buildCurl } from '../api/curl';

type Clip = Pick<Clipboard, 'writeText'>;

interface InspectorProps {
  exchange: Exchange | null;
  origin?: string;
  clipboard?: Clip;
}

/** Shows the last API exchange and lets the reader copy it as JSON or cURL. */
export function Inspector({ exchange, origin = window.location.origin, clipboard = navigator.clipboard }: InspectorProps) {
  const body = exchange ? JSON.stringify(exchange.request) : '';
  const failed = exchange !== null && (exchange.status === null || exchange.status >= 400);
  return (
    <div className="inspector">
      <div className="inspector-actions">
        <CopyButton label="Copy JSON" text={body} clipboard={clipboard} disabled={exchange === null} />
        <CopyButton label="Copy cURL" text={buildCurl(origin, body)} clipboard={clipboard} disabled={exchange === null} />
      </div>
      {exchange === null ? (
        <p className="empty">No requests yet.</p>
      ) : (
        <div className="inspector-log">
          <div className="inspector-meta">POST {CALCULATE_PATH}</div>
          <pre className="inspector-json">{body}</pre>
          <div className={failed ? 'inspector-meta inspector-meta--error' : 'inspector-meta'}>
            ← {exchange.status ?? 'no response'}
          </div>
          {exchange.response !== null && (
            <pre className="inspector-json">
              {typeof exchange.response === 'string' ? exchange.response : JSON.stringify(exchange.response)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const FEEDBACK_MS = 1500;

function CopyButton({ label, text, clipboard, disabled }: { label: string; text: string; clipboard?: Clip; disabled: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      if (!clipboard) throw new Error('Clipboard unavailable');
      await clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <button type="button" className="copy-button" disabled={disabled} onClick={copy}>
      {state === 'copied' ? '✓ Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
