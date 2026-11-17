import type { ReactNode } from "react";
import { CoachNav } from "@/components/coach/coach-nav";

// Coach frame (UX section A — mobile first): content + a tab bar at the bottom on phones,
// a narrow rail on the start side from iPad up (logical CSS: right in Arabic, left in English).
export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <div className="md:flex">
      <CoachNav />
      <div className="min-w-0 flex-1 pb-24 md:pb-0">{children}</div>
    </div>
  );
}
