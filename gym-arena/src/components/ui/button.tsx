import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

/**
 * One button style system for the whole app. Tap targets ≥ 44 px (AC-32).
 * `primary` = DFN red fill; `secondary` = quiet surface; `ghost` = text only;
 * `danger` = destructive confirmation.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[color,background-color,border-color,transform] duration-[var(--dur-fast)] " +
  "enabled:active:scale-[0.97] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text " +
  "disabled:cursor-not-allowed disabled:opacity-50 select-none whitespace-nowrap";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-border bg-surface-2 text-text hover:border-text-muted/40 hover:bg-surface-2/70",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
  danger: "bg-down/15 text-down hover:bg-down/25",
};
const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClasses(variant, size, className)}>
      {loading && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link {...props} className={buttonClasses(variant, size, className)} />;
}
