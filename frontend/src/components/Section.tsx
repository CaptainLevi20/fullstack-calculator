import { useId, useState, type ReactNode } from 'react';
import { useMediaQuery } from './useMediaQuery';

// Keep in sync with the two-column breakpoint in styles.css.
const WIDE_SCREEN = '(min-width: 768px)';

interface SectionProps {
  title: string;
  children: ReactNode;
}

/**
 * A titled panel. On phones it collapses behind its title (closed by default);
 * on wider screens it is a plain heading with its content always shown, so
 * assistive technology never hears "collapsed" for something on screen.
 */
export function Section({ title, children }: SectionProps) {
  const wide = useMediaQuery(WIDE_SCREEN);
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  if (wide) {
    return (
      <section className="section">
        <h2 className="section-heading">
          <span className="section-title">{title}</span>
        </h2>
        <div id={bodyId} className="section-body">
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <h2 className="section-heading">
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          {title}
        </button>
      </h2>
      <div id={bodyId} className="section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
