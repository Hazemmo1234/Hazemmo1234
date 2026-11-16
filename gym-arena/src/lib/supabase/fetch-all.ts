/**
 * Reads EVERY row of a query, page by page. The API returns at most `max_rows` (1000)
 * rows per request (supabase/config.toml), so a plain select silently drops the rest —
 * which made counts and rookie flags wrong on a busy database. Scoring inputs must never
 * be truncated, so loaders that feed the scoring module use this.
 *
 * `page(from, to)` must apply a stable, unique order (e.g. `.order("id")`) so pages never
 * overlap or skip rows.
 */
export const PAGE_SIZE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Splits ids for `.in()` filters so request URLs stay short. */
export function chunk<T>(items: readonly T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
