/**
 * Live board layout (UX C "Live"): the podium shows the first three rows; ranks 4+ are shown
 * 10 rows per page, auto-paging every 12 s. Pure, so the paging is testable.
 */
export const PODIUM_SIZE = 3;
export const ROWS_PER_PAGE = 10;
export const PAGE_SECONDS = 12;

export function splitBoard<T>(board: readonly T[]): { podium: T[]; rest: T[] } {
  return { podium: board.slice(0, PODIUM_SIZE), rest: board.slice(PODIUM_SIZE) };
}

export function pageCount(rows: number, perPage = ROWS_PER_PAGE): number {
  return Math.max(1, Math.ceil(rows / perPage));
}

/** The page shown at a given tick; stays valid when the board shrinks. */
export function pageAt(tick: number, rows: number, perPage = ROWS_PER_PAGE): number {
  return ((tick % pageCount(rows, perPage)) + pageCount(rows, perPage)) % pageCount(rows, perPage);
}

export function pageRows<T>(rows: readonly T[], page: number, perPage = ROWS_PER_PAGE): T[] {
  return rows.slice(page * perPage, page * perPage + perPage);
}

/** PR badge window (UX C: the "PR" badge shows for 60 s after a new best). */
export const PR_SECONDS = 60;

export function isFreshPr(prAt: string | null, serverNowMs: number): boolean {
  if (!prAt) return false;
  const at = Date.parse(prAt);
  return Number.isFinite(at) && serverNowMs - at >= 0 && serverNowMs - at < PR_SECONDS * 1000;
}
