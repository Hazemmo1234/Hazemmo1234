import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";
const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-text-muted",
  brand: "bg-brand/15 text-brand-text",
  success: "bg-up/15 text-up",
  warning: "bg-gold/15 text-gold",
  danger: "bg-down/15 text-down",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}
