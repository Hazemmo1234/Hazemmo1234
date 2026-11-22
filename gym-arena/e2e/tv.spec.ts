import { expect, test } from "./fixtures";
import { LOCAL_ONLY, TV_KEY, requireWriteTarget, signIn } from "./helpers";

// M5 TV (UX section C, API_SPECIFICATION "TV", BR-X2, AC-26). Real API, real database.
// @writes: the first TV request of a day writes that day's rank snapshot (server-side, idempotent).
test.describe("TV state API and screen @writes", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "tv", "TV tests run on the TV project");
    requireWriteTarget();
  });

  test("invalid or missing key → 401 and no data (AC-26)", async ({ page }) => {
    for (const url of ["/api/tv/state", "/api/tv/state?key=wrong"]) {
      const res = await page.request.get(url);
      expect(res.status()).toBe(401);
      expect(JSON.stringify(await res.json())).not.toMatch(/board|gym_name/);
    }
  });

  test("valid key → stable contract with allow-listed fields only (BR-X2)", async ({ page }) => {
    const res = await page.request.get(`/api/tv/state?key=${TV_KEY}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const state = await res.json();
    expect(Object.keys(state).sort()).toEqual(
      ["between", "board", "gym_name", "locale", "mode", "next_season_in_days", "next_season_starts_on", "preseason", "recent_bests", "reveal", "rookies", "season", "server_time", "version"].sort(),
    );
    expect(["live", "preseason", "between", "reveal"]).toContain(state.mode);
    const text = JSON.stringify(state);
    expect(text).not.toMatch(/member_id|member_code|phone|\+20\d|coach|photo_path|evidence|entries\//);
    for (const row of state.board) {
      expect(Object.keys(row).sort()).toEqual(["categories", "gap_to_next", "initials", "movement", "name", "photo_url", "pr_at", "rank", "ref", "total"]);
      expect(Number.isInteger(row.total)).toBe(true);
    }
    // the version only changes when the content does
    const again = await (await page.request.get(`/api/tv/state?key=${TV_KEY}`)).json();
    expect(again.version).toBe(state.version);
  });

  test("the TV renders the live board and matches the staff leaderboard (AC-20)", async ({ page }) => {
    const state = await (await page.request.get(`/api/tv/state?key=${TV_KEY}`)).json();
    await page.goto(`/tv?key=${TV_KEY}`);
    await expect(page.getByText("DFN GYM")).toBeVisible();
    if (state.mode !== "live") return;
    await expect(page.getByText(/مباشر|Live/).first()).toBeVisible();
    if (state.board.length > 0) await expect(page.getByText(state.board[0].name).first()).toBeVisible();
    await signIn(page, "admin@gym-arena.local");
    const staff = await (await page.request.get("/api/leaderboard")).json();
    expect(state.board.map((r: { rank: number; total: number }) => [r.rank, r.total])).toEqual(
      staff.main.map((r: { rank: number; total_display: number }) => [r.rank, r.total_display]),
    );
  });

  // The screen itself, driven by deterministic TV states (the poll response is replaced; the
  // server-rendered first state is real). State-based assertions — no sleeps beyond one poll.
  test("reveal sequence resumes at the right step after a refresh (AC-24) and holds the final podium", async ({ page }) => {
    const now = Date.now();
    const state = (startedSecondsAgo: number) => ({
      version: `reveal-${startedSecondsAgo}`,
      server_time: new Date(now).toISOString(),
      locale: "en",
      gym_name: "DFN GYM",
      mode: "reveal",
      season: { name: "Arena — Past (seed)", type: "championship", starts_on: "2026-01-01", ends_on: "2026-01-31", days_left: 0 },
      next_season_starts_on: null,
      next_season_in_days: null,
      between: null,
      board: [],
      rookies: [],
      recent_bests: [],
      preseason: null,
      reveal: {
        started_at: new Date(now - startedSecondsAgo * 1000).toISOString(),
        winners: [
          { ref: "w1", place: 1, name: "Champion Person", photo_url: null, initials: "CP", total: 812 },
          { ref: "w2", place: 2, name: "Second Person", photo_url: null, initials: "SP", total: 790 },
          { ref: "w3", place: 3, name: "Third Person", photo_url: null, initials: "TP", total: 701 },
        ],
      },
    });
    let current = state(8); // 8 s in: third place (intro is 6 s)
    await page.route("**/api/tv/state*", (route) => route.fulfill({ json: current }));
    await page.goto(`/tv?key=${TV_KEY}`);
    await expect(page.getByText("Third place")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Third Person")).toBeVisible();
    await expect(page.getByText("Champion Person")).toHaveCount(0); // the champion is not shown early

    current = state(120); // a TV switched on two minutes later lands on the final podium
    await page.reload();
    await expect(page.getByText("Final podium")).toBeVisible({ timeout: 15_000 });
    for (const n of ["Champion Person", "Second Person", "Third Person"]) await expect(page.getByText(n)).toBeVisible();
  });

  test("between seasons: results coming soon, no standings; network loss keeps the last state (AC-29)", async ({ page }) => {
    const between = {
      version: "between-1",
      server_time: new Date().toISOString(),
      locale: "en",
      gym_name: "DFN GYM",
      mode: "between",
      season: { name: "Arena — Ended", type: "championship", starts_on: "2026-01-01", ends_on: "2026-01-31", days_left: 0 },
      next_season_starts_on: null,
      next_season_in_days: null,
      between: { reason: "awaiting_close" },
      board: [],
      rookies: [],
      recent_bests: [],
      preseason: null,
      reveal: null,
    };
    let fail = false;
    await page.route("**/api/tv/state*", (route) => (fail ? route.abort("internetdisconnected") : route.fulfill({ json: between })));
    await page.goto(`/tv?key=${TV_KEY}`);
    await expect(page.getByText("Results coming soon")).toBeVisible({ timeout: 15_000 });
    fail = true;
    await expect(page.getByText("Reconnecting")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Results coming soon")).toBeVisible(); // never a blank screen
    fail = false;
    await expect(page.getByText("Reconnecting")).toHaveCount(0, { timeout: 15_000 });
  });

  test("a rotated key turns a running screen into 'Display not authorized'", async ({ page }) => {
    let revoked = false;
    await page.route("**/api/tv/state*", (route) =>
      revoked ? route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "Display not authorized" } } }) : route.fallback(),
    );
    await page.goto(`/tv?key=${TV_KEY}`);
    await expect(page.getByText("DFN GYM")).toBeVisible();
    revoked = true;
    await expect(page.getByText(/Display not authorized|الشاشة غير مصرّح لها/)).toBeVisible({ timeout: 15_000 });
  });
});

