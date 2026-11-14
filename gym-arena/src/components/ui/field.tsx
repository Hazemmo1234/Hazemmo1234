import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export const inputClasses =
  "h-12 w-full rounded-xl border border-border bg-surface-2 px-4 text-base text-text outline-none transition-colors " +
  "focus:border-brand-text disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-down";

/** Label + input + hint/error, wired for screen readers (aria-describedby / aria-invalid). */
export function Field({
  label,
  hint,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-start text-sm font-semibold">{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClasses} {...input} />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-start text-sm font-semibold text-down">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-start text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Two-to-four option choice, as large buttons (radio group semantics). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: ReactNode;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div>
      <p id={id} className="mb-1.5 text-start text-sm font-semibold">{label}</p>
      <div role="radiogroup" aria-labelledby={id} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors ${
              value === option.value ? "bg-brand text-white" : "text-text-muted hover:text-text"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
