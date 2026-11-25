import type { ReactNode } from "react";

/**
 * A person's name that may be cut with "…" (D15: Arabic and English, any script in any mode).
 *
 * - `dir="auto"`: the name's own first letter decides its direction, so the cut is always at
 *   the END of the name — a Latin name in Arabic mode keeps its beginning ("Abdelrahman Moh…"),
 *   an Arabic name keeps right-to-left. The dir attribute also isolates the name from the text
 *   around it. There is deliberately no inner <bdi>: dir="auto" ignores text inside a bdi.
 * - `.name-text` (globals.css): the line keeps the alignment of the surrounding layout
 *   (text-align: match-parent), so a Latin name in an Arabic row still lines up on the right.
 *   An explicit alignment utility (text-center) still wins.
 * - Short names are never cut: `truncate` only clips what does not fit.
 */
export function NameText({
  as: Tag = "span",
  className = "",
  children,
  "data-testid": testId,
}: {
  as?: "span" | "p" | "h1";
  className?: string;
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Tag dir="auto" data-testid={testId} className={`name-text truncate ${className}`}>
      {children}
    </Tag>
  );
}
