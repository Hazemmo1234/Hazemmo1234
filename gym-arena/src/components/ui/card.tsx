import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`rounded-2xl border border-border bg-surface ${className}`} />;
}

export function CardHeader({ title, action, className = "" }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-14 items-center justify-between gap-3 border-b border-border px-5 ${className}`}>
      <h2 className="text-base font-bold">{title}</h2>
      {action}
    </div>
  );
}
