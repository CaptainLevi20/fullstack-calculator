interface DisplayProps {
  expression: string;
  entry: string;
  rounded: boolean;
  error: string | null;
}

export function Display({ expression, entry, rounded, error }: DisplayProps) {
  return (
    <div className="display" aria-live="polite">
      <div className="display-expression">{expression}</div>
      {error !== null ? (
        <div className="display-error">{error}</div>
      ) : (
        <div className="display-entry">{entry}</div>
      )}
      {rounded && error === null && <span className="display-badge">≈ rounded to 34 digits</span>}
    </div>
  );
}
