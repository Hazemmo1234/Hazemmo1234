import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LOCAL_ONLY, expectLanguage, signIn } from "./helpers";

// M4 leaderboards (UX C6, A1, A3, C2): real UI, real API, real database (no mocks).
// Read-only: nothing here writes rows.
const LAYOUTS = { narrow: { width: 360, height: 740 }, phone: { width: 390, height: 844 }, ipad: { width: 820, height: 1180 } };
const C = {
  en: { nav: "Coach navigation", board: "Leaderboard", main: "Main", rookies: "Rookies", yours: "Your client", pts: "pts" },
  ar: { nav: "قائمة المدرب", board: "الترتيب", main: "الرئيسية", rookies: "المبتدئون", yours: "عميلك", pts: "نقطة" },
} as const;

type Row = { rank: number; member_id: string | null; own: boolean; full_name: string; is_rookie: boolean; total: number; total_display: number };
type Board = { season: { id: string; type: string } | null; main: Row[]; rookies: Row[] };

async function as(page: Page, email: string, locale: "ar" | "en") {
  await signIn(page, email);
  await page.waitForURL(/\/(today|admin\/dashboard)$/);
  await page.request.post("/api/locale", { data: { locale } });
}
const boardOf = async (page: Page): Promise<Board> => (await page.request.get("/api/leaderboard")).json();
const panel = (page: Page) => page.getByRole("tabpanel");

test.describe("leaderboards", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "viewports are set per test; run once");
  });
  test.afterEach(async ({ page }) => {
    await page.request.post("/api/locale", { data: { locale: "ar" } });
  });

  test("API: staff only; a coach gets the global board without other coaches' ids or private fields", async ({ page }) => {
    const anon = await page.request.get("/api/leaderboard");
    expect(anon.status()).toBe(401);

    await as(page, "coach1@gym-arena.local", "en");
    const board = await boardOf(page);
    expect(board.season?.type).toBe("championship");
    // global, not the coach's own slice: other coaches' members are on it (checked directly —
    // the old "> 1000 rows" proxy only held on one long-lived database; scale is proven in the
    // DB suite's scale test, which builds its own 1,100 participants)
    expect([...board.main, ...board.rookies].filter((r) => !r.own).length).toBeGreaterThan(0);
    const own = [...board.main, ...board.rookies].filter((r) => r.own);
    const { members } = await (await page.request.get("/api/members?status=active")).json();
    const mine = new Set((members as Array<{ id: string }>).map((m) => m.id));
    expect(own.length).toBeGreaterThan(0);
    for (const r of [...board.main, ...board.rookies]) {
      if (r.own) expect(mine.has(r.member_id!)).toBe(true);
      else expect(r.member_id).toBeNull();
    }
    expect(JSON.stringify(board)).not.toMatch(/"phone"|member_code|photo_path|weight_kg|attend/);
    // ranks: non-decreasing, shared on equal exact totals (D10), main board never has rookies (BR-R2)
    for (const [i, r] of board.main.entries()) {
      expect(r.is_rookie).toBe(false);
      if (i > 0) expect(r.rank).toBeGreaterThanOrEqual(board.main[i - 1].rank);
      if (i > 0 && r.rank === board.main[i - 1].rank) expect(r.total).toBe(board.main[i - 1].total);
    }
    expect(board.rookies.every((r) => r.is_rookie)).toBe(true);

    // K1: a closed season is served from its frozen results, flagged final; the open one is live
    expect((board as Board & { final: boolean }).final).toBe(false);
    const { seasons } = await (await page.request.get("/api/seasons")).json();
    const closed = (seasons as Array<{ id: string; name: string; closed_at: string | null }>).find((x) => x.name === "M4 frozen season" && x.closed_at)
      ?? (seasons as Array<{ id: string; closed_at: string | null; type: string }>).find((x) => x.closed_at && x.type === "championship");
    // always present: the seed's closed season (no frozen rows) or the K1 DB fixture
    expect(closed, "a closed season to read").toBeTruthy();
    const frozen = await (await page.request.get(`/api/leaderboard?season_id=${closed!.id}`)).json();
    expect(frozen.final).toBe(true);
    for (const r of [...frozen.main, ...frozen.rookies] as Row[]) if (!r.own) expect(r.member_id).toBeNull();
    // never a live recomputation: the seed's past season has no stored results → an empty final board
    const seedPast = (seasons as Array<{ id: string; name: string }>).find((x) => x.name === "Arena — Past (seed)");
    expect(seedPast, "seed past season").toBeTruthy();
    expect(await (await page.request.get(`/api/leaderboard?season_id=${seedPast!.id}`)).json()).toMatchObject({ final: true, main: [], rookies: [] });

    expect((await page.request.get("/api/leaderboard?season_id=not-a-uuid")).status()).toBe(404);
    expect((await page.request.get("/api/leaderboard?season_id=11111111-1111-4111-8111-111111111111")).status()).toBe(404);

    // global: the coach's board is the admin's board, row for row (same ranks, same points,
    // both lists) — only identities are masked
    await page.context().clearCookies();
    await as(page, "admin@gym-arena.local", "en");
    const adminBoard = await boardOf(page);
    const shape = (rows: Row[]) => rows.map((r) => [r.rank, r.total, r.is_rookie]);
    expect(shape(board.main)).toEqual(shape(adminBoard.main));
    expect(shape(board.rookies)).toEqual(shape(adminBoard.rookies));
    expect(adminBoard.main.length + adminBoard.rookies.length).toBeGreaterThan(own.length);
  });

  for (const locale of ["ar", "en"] as const) {
    test(`coach leaderboard (${locale}): tabs, own clients highlighted and openable, 360 / 390 / iPad`, async ({ page }) => {
      const c = C[locale];
      await as(page, "coach1@gym-arena.local", locale);
      const board = await boardOf(page);
      for (const [name, size] of Object.entries(LAYOUTS)) {
        await page.setViewportSize(size);
        await page.goto("/leaderboard");
        await expectLanguage(page, locale);
        await expect(page.getByRole("navigation", { name: c.nav }).getByRole("link", { name: c.board }), name).toHaveAttribute("aria-current", "page");
        await expect(page.getByRole("tab", { name: new RegExp(c.main) })).toHaveAttribute("aria-selected", "true");
        await expect(panel(page).getByRole("listitem")).toHaveCount(board.main.length);
        // own clients: highlighted, labelled, and the only links
        const ownMain = board.main.filter((r) => r.own);
        await expect(panel(page).locator("li[data-own]")).toHaveCount(ownMain.length);
        await expect(panel(page).getByRole("link")).toHaveCount(ownMain.length);
        if (ownMain.length) await expect(panel(page).locator("li[data-own]").first()).toContainText(c.yours);
      }
      // the first row shows the same rank, name and points as the API
      const first = board.main[0];
      const row = panel(page).getByRole("listitem").first();
      await expect(row).toContainText(first.full_name);
      await expect(row).toContainText(String(first.total_display));

      await page.getByRole("tab", { name: new RegExp(c.rookies) }).click();
      await expect(page.getByRole("tab", { name: new RegExp(c.rookies) })).toHaveAttribute("aria-selected", "true");
      await expect(panel(page).getByRole("listitem")).toHaveCount(board.rookies.length);
      await expectLanguage(page, locale);

      // opening an own client goes to their card, which shows the same rank
      const ownRookie = board.rookies.find((r) => r.own);
      if (ownRookie) {
        await panel(page).getByRole("link").first().click();
        await expect(page).toHaveURL(/\/members\/[0-9a-f-]{36}$/);
        await expect(page.getByTestId("card-rank")).toContainText(String(board.rookies.filter((r) => r.own)[0].rank));
      }
    });
  }

  test("Today rows and the member card show the board's rank and total (AC-20)", async ({ page }) => {
    await page.setViewportSize(LAYOUTS.phone);
    await as(page, "coach1@gym-arena.local", "en");
    const board = await boardOf(page);
    // an own, ranked client whose name is unique among the coach's clients (names can repeat)
    const own = [...board.main, ...board.rookies].filter((r) => r.own);
    const ranked = board.main.find((r) => r.own && own.filter((o) => o.full_name === r.full_name).length === 1)!;
    expect(ranked).toBeTruthy();
    await page.goto("/today");
    const item = page.getByRole("main").getByRole("listitem").filter({ hasText: ranked.full_name }).first();
    await expect(item.getByTestId("row-rank")).toHaveText(`#${ranked.rank}`);
    await expect(item).toContainText(String(ranked.total_display));
    await item.getByRole("link").click();
    await expect(page.getByTestId("card-rank")).toHaveText(`#${ranked.rank} of ${board.main.length}`);
    // the card API carries the same numbers
    const id = page.url().split("/").pop()!;
    const card = (await (await page.request.get(`/api/members/${id}`)).json()).card ?? null;
    if (card) expect({ rank: card.rank, rank_of: card.rank_of, total: card.total }).toEqual({ rank: ranked.rank, rank_of: board.main.length, total: ranked.total });
  });

  for (const locale of ["ar", "en"] as const) {
    test(`admin dashboard (${locale}): Top 5, new bests, weekly activity, entries per category`, async ({ page }) => {
      await as(page, "admin@gym-arena.local", locale);
      const board = await boardOf(page);
      for (const size of [LAYOUTS.narrow, LAYOUTS.ipad, { width: 1280, height: 900 }]) {
        await page.setViewportSize(size);
        await page.goto("/admin/dashboard");
        await expectLanguage(page, locale);
        const top = page.getByTestId("top5").getByRole("listitem");
        await expect(top).toHaveCount(Math.min(5, board.main.length));
        await expect(top.first()).toContainText(board.main[0].full_name);
        await expect(top.first()).toContainText(String(board.main[0].total_display));
        await expect(page.getByTestId("per-category").getByRole("listitem")).toHaveCount(6);
      }
    });
  }

  test("Admin Members: rank and total columns match the board (A3)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await as(page, "admin@gym-arena.local", "en");
    const board = await boardOf(page);
    const leader = board.main[0];
    // names are not unique: find the leader by their member code (the admin board carries ids)
    const { member } = await (await page.request.get(`/api/members/${leader.member_id}`)).json();
    await page.goto(`/admin/members?q=${encodeURIComponent(member.member_code)}`);
    const row = page.getByRole("listitem").filter({ hasText: member.member_code });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("member-rank")).toHaveText(String(leader.rank));
    await expect(row.getByTestId("member-total")).toHaveText(String(leader.total_display));
    await expectLanguage(page, "en");
  });
});
