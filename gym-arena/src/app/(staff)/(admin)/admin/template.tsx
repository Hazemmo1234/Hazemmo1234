import type { ReactNode } from "react";

// Re-mounted on every navigation (unlike the layout), so the new page content enters with the
// shared page motion (globals.css .page-enter; off under reduced motion).
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
