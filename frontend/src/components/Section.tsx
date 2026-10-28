import { useId, useState, type ReactNode } from 'react';

interface SectionProps {
  title: string;
  children: ReactNode;
}

/**
 * A titled panel. On phones it collapses behind its title (closed by default);
 * from tablet width up the stylesheet always shows the body.
 */
export function Section({ title, children }: SectionProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
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
