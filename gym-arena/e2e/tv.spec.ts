import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { LOCAL_ONLY, TV_KEY, requireWriteTarget, signIn } from "./helpers";
import { cutAtEndProblems, namesShown, wholeProblems } from "./names";

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
    // no ids, codes, phones, coach references or evidence; the only coach data is a D34 tag's text
    expect(text).not.toMatch(/member_id|member_code|GA-\d|phone|\+20\d|coach_id|coach_name|photo_path|evidence|entries\//);
    for (const row of state.board) {
      expect(Object.keys(row).sort()).toEqual(["categories", "gap_to_next", "initials", "movement", "name", "photo_url", "pr_at", "rank", "ref", "tag", "total"]);
      expect(Number.isInteger(row.total)).toBe(true);
    }
    // D34: names shown more than once carry distinct tags (coach name or "#number"); others carry none
    type Shown = { name: string; tag: { kind: "coach" | "member"; text: string } | null };
    const shown: Shown[] = [...state.board, ...state.rookies];
    const byName = new Map<string, Shown[]>();
    for (const r of shown) byName.set(r.name.trim().toLowerCase(), [...(byName.get(r.name.trim().toLowerCase()) ?? []), r]);
    for (const [name, rows] of byName) {
      if (rows.length < 2) continue;
      expect(rows.every((r) => r.tag !== null), `${name}: every duplicate is tagged`).toBe(true);
      expect(new Set(rows.map((r) => `${r.tag!.kind}:${r.tag!.text}`)).size, `${name}: tags differ`).toBe(rows.length);
      for (const r of rows) {
        expect(["coach", "member"]).toContain(r.tag!.kind);
        if (r.tag!.kind === "member") expect(r.tag!.text).toMatch(/^#\d+$/);
      }
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
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    const res = await page.request.get("/api/leaderboard");
    expect(res.status()).toBe(200);
    const staff = await res.json();
    expect(state.board.map((r: { rank: number; total: number }) => [r.rank, r.total])).toEqual(
      staff.main.map((r: { rank: number; total_display: number }) => [r.rank, r.total_display]),
    );
  });

  // The screen itself, driven by deterministic TV states (the poll response is replaced; the
  // server-rendered first state is real). State-based assertions — no sleeps beyond one poll.
  test("reveal sequence resumes at the right step after a refresh (AC-24) and holds the final podium", async ({ page }) => {
    test.setTimeout(60_000); // two page loads, each waiting for one 10 s poll
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

  // Podium regression (UX C). Playwright's toBeVisible() passes for text a parent clips away,
  // which is how the #1 card once hid the leader's name (squeezed to 0 px) and points (below
  // the card's clipped edge). These tests check the real geometry: every podium name and points
  // element has a size, lies inside every clipping ancestor and inside the screen, and no
  // podium card needs more height than it has. Long full names and the widest totals.
  const LONG = ["Abdelrahman Mohamed Elsayed Abdelaziz", "Mostafa Abdelhamid Ibrahim Elshennawy", "Mohamed Ahmed Abdelmoneim Elgendy", "Youssef Abdelrahman Mahmoud Elsherbiny"];
  const tvBase = (locale: "en" | "ar", now: number) => ({
    server_time: new Date(now).toISOString(),
    locale,
    gym_name: "DFN GYM",
    season: { name: "Arena — Podium", type: "championship", starts_on: "2026-11-01", ends_on: "2026-11-30", days_left: 6 },
    next_season_starts_on: null,
    next_season_in_days: null,
    between: null,
    rookies: [],
    recent_bests: [],
    preseason: null,
    reveal: null,
  });
  const initialsOf = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2);

  /** Every podium name/points element that is not fully shown, and every card that overflows. */
  const podiumProblems = (page: Page) =>
    page.evaluate(() => {
      const out: string[] = [];
      const sel = '[data-testid="podium-name"],[data-testid="podium-total"],[data-testid="winner-name"],[data-testid="winner-total"]';
      for (const el of document.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect();
        const id = `${el.getAttribute("data-testid")} "${(el.textContent ?? "").trim().slice(0, 20)}"`;
        if (b.width < 1 || b.height < 1) {
          out.push(`${id}: zero size`);
          continue;
        }
        if (b.left < -0.5 || b.top < -0.5 || b.right > window.innerWidth + 0.5 || b.bottom > window.innerHeight + 0.5) out.push(`${id}: outside the screen`);
        for (let a = el.parentElement; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.overflowX === "visible" && s.overflowY === "visible") continue;
          const ab = a.getBoundingClientRect();
          if (b.top < ab.top - 0.5 || b.bottom > ab.bottom + 0.5 || b.left < ab.left - 0.5 || b.right > ab.right + 0.5) {
            out.push(`${id}: clipped by <${a.tagName.toLowerCase()} class="${String(a.className).slice(0, 50)}">`);
            break;
          }
        }
      }
      for (const card of document.querySelectorAll<HTMLElement>('[data-testid="podium-card"]')) {
        if (card.scrollHeight > card.clientHeight + 1) out.push(`podium card needs ${card.scrollHeight} px but has ${card.clientHeight} px`);
      }
      return out;
    });

  /** UX C at 1080p (readable at 5 m): names ≥ 40 px, points ≥ 56 px. Font sizes on the unscaled stage. */
  const expectReadable = async (page: Page, name: string, points: string) => {
    const px = (id: string) => page.getByTestId(id).evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    for (const size of await px(name)) expect(size, `${name} font size`).toBeGreaterThanOrEqual(40);
    for (const size of await px(points)) expect(size, `${points} font size`).toBeGreaterThanOrEqual(56);
  };

  for (const locale of ["en", "ar"] as const) {
    test(`live podium: 1st, 2nd and 3rd show their name and points in full (${locale})`, async ({ page }) => {
      test.setTimeout(45_000); // one 10 s poll
      const now = Date.now();
      const pr = new Date(now - 2_000).toISOString(); // PR badge on every podium card
      const row = (rank: number, name: string, total: number, movement: number) => ({ ref: `p${rank}`, rank, name, photo_url: null, initials: initialsOf(name), total, movement, gap_to_next: rank === 1 ? 0 : 1, pr_at: rank <= 3 ? pr : null, categories: {} });
      const live = {
        ...tvBase(locale, now),
        version: `podium-${locale}`,
        mode: "live",
        board: [row(1, LONG[0]!, 1000, 12), row(2, LONG[1]!, 999, -10), row(3, LONG[2]!, 998, 15), ...Array.from({ length: 12 }, (_, i) => row(i + 4, `Member ${i + 4}`, 900 - i, 0))],
      };
      await page.route("**/api/tv/state*", (route) => route.fulfill({ json: live }));
      await page.goto(`/tv?key=${TV_KEY}`);
      await expect(page.getByTestId("podium-name")).toHaveText([LONG[0]!, LONG[1]!, LONG[2]!], { timeout: 15_000 });
      for (const [i, total] of [1000, 999, 998].entries()) await expect(page.getByTestId("podium-total").nth(i)).toContainText(String(total)); // count-up finished
      await expectReadable(page, "podium-name", "podium-total");
      for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 3840, height: 2160 }]) {
        await page.setViewportSize(size);
        // the stage rescales after the resize; a lasting problem still fails after the timeout
        await expect.poll(() => podiumProblems(page), { message: `${size.width}×${size.height}`, timeout: 5_000 }).toEqual([]);
      }
    });

    test(`final podium: every winner's name and points stay on screen, ties included (${locale})`, async ({ page }) => {
      test.setTimeout(60_000);
      const now = Date.now();
      const winner = (place: number, name: string, total: number) => ({ ref: `w-${name}`, place, name, photo_url: null, initials: initialsOf(name), total });
      const cases = [
        [winner(1, LONG[0]!, 1000), winner(2, LONG[1]!, 999), winner(3, LONG[2]!, 998)],
        [winner(1, LONG[0]!, 1000), winner(2, LONG[1]!, 999), winner(3, LONG[2]!, 998), winner(3, LONG[3]!, 998)], // BR-W1: a tie for 3rd
        [winner(1, LONG[0]!, 1000), winner(1, LONG[3]!, 1000), winner(3, LONG[2]!, 998)], // a tie for 1st
      ];
      let current = cases[0]!;
      await page.route("**/api/tv/state*", (route) =>
        route.fulfill({ json: { ...tvBase(locale, now), version: `final-${current.length}-${current[1]!.place}`, mode: "reveal", board: [], reveal: { started_at: new Date(now - 600_000).toISOString(), winners: current } } }),
      );
      for (const winners of cases) {
        current = winners;
        await page.goto(`/tv?key=${TV_KEY}`);
        await expect(page.getByTestId("winner-name")).toHaveCount(winners.length, { timeout: 15_000 });
        await expectReadable(page, "winner-name", "winner-total");
        await expect.poll(() => podiumProblems(page), { message: `places ${winners.map((w) => w.place).join("-")}`, timeout: 5_000 }).toEqual([]);
      }
    });
  }

  // Names are cut at their END in either script (NameText): a long Latin name in Arabic mode keeps
  // its beginning ("Abdelrahman Moh…", never "…lsayed Abdelaziz"), an Arabic name stays
  // right-to-left in English mode, short names are never cut, and a cut-able line keeps the
  // alignment of the surrounding layout. Real geometry (e2e/names.ts).
  const LATIN = ["Abdelrahman Mohamed Elsayed Abdelaziz Elshennawy", "Mostafa Abdelhamid Ibrahim Elsherbiny Mansour", "Youssef Abdelrahman Mahmoud Elgendy Abdelmoneim"];
  const ARABIC = ["عبد الرحمن محمد السيد عبد العزيز الشناوي المنصوري", "مصطفى عبد الحميد إبراهيم الشربيني عبد المنعم", "يوسف عبد الرحمن محمود الجندي عبد الله الدسوقي"];
  const SHORT = { latin: "Omar Ali", arabic: "منى علي" };
  const byText = (list: Awaited<ReturnType<typeof namesShown>>, text: string) => {
    const n = list.find((x) => x.text === text);
    if (!n) throw new Error(`name not shown: ${text}`);
    return n;
  };

  for (const locale of ["ar", "en"] as const) {
    test(`names are cut at their end in either script; short names are whole (${locale})`, async ({ page }) => {
      test.setTimeout(75_000); // two page loads, each waiting for one 10 s poll
      const now = Date.now();
      const row = (rank: number, name: string) => ({ ref: `n${rank}`, rank, name, photo_url: null, initials: initialsOf(name), total: 1000 - rank, movement: 0, gap_to_next: rank === 1 ? 0 : 1, pr_at: null, categories: {} });
      const rookie = (rank: number, name: string) => ({ ref: `k${rank}`, rank, name, photo_url: null, initials: initialsOf(name), total: 300 - rank });
      const names = [LATIN[0]!, ARABIC[0]!, SHORT.latin, LATIN[1]!, ARABIC[1]!, SHORT.latin + " Hassan", SHORT.arabic];
      const live = {
        ...tvBase(locale, now),
        version: `names-${locale}`,
        mode: "live",
        board: [...names.map((n, i) => row(i + 1, n)), ...Array.from({ length: 6 }, (_, i) => row(i + 8, `Member ${i + 8}`))],
        rookies: [rookie(1, LATIN[2]!), rookie(2, "Sara Adel"), rookie(3, ARABIC[2]!)],
      };
      const final = {
        ...tvBase(locale, now),
        version: `names-final-${locale}`,
        mode: "reveal",
        board: [],
        reveal: { started_at: new Date(now - 600_000).toISOString(), winners: [{ ref: "w1", place: 1, name: LATIN[0]!, photo_url: null, initials: "AM", total: 1000 }, { ref: "w2", place: 2, name: ARABIC[0]!, photo_url: null, initials: "عم", total: 999 }, { ref: "w3", place: 3, name: SHORT.latin, photo_url: null, initials: "OA", total: 998 }] },
      };
      let current: object = live;
      await page.route("**/api/tv/state*", (route) => route.fulfill({ json: current }));
      await page.goto(`/tv?key=${TV_KEY}`);
      await expect(page.getByTestId("podium-name")).toHaveText([LATIN[0]!, ARABIC[0]!, SHORT.latin], { timeout: 15_000 });
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

      const podium = await namesShown(page, '[data-testid="podium-name"]');
      const board = await namesShown(page, '[data-testid="board-name"]');
      const rookies = await namesShown(page, '[data-testid="rookie-name"]');
      const problems = [
        ...cutAtEndProblems(byText(podium, LATIN[0]!), "ltr"), // 1st place
        ...cutAtEndProblems(byText(podium, ARABIC[0]!), "rtl"), // 2nd place
        ...wholeProblems(byText(podium, SHORT.latin), "ltr"), // 3rd place
        ...cutAtEndProblems(byText(board, LATIN[1]!), "ltr"),
        ...cutAtEndProblems(byText(board, ARABIC[1]!), "rtl"),
        ...wholeProblems(byText(board, SHORT.latin + " Hassan"), "ltr"),
        ...wholeProblems(byText(board, SHORT.arabic), "rtl"),
        ...cutAtEndProblems(byText(rookies, LATIN[2]!), "ltr"),
        ...cutAtEndProblems(byText(rookies, ARABIC[2]!), "rtl"),
        ...wholeProblems(byText(rookies, "Sara Adel"), "ltr"),
      ];
      expect(problems).toEqual([]);
      // a standings line keeps the screen's alignment, whatever the script of the name
      for (const name of [SHORT.latin + " Hassan", SHORT.arabic]) expect(byText(board, name).startGap, `${name} aligned with the layout`).toBeLessThanOrEqual(2);

      current = final;
      await page.goto(`/tv?key=${TV_KEY}`);
      await expect(page.getByTestId("winner-name")).toHaveCount(3, { timeout: 15_000 });
      const winners = await namesShown(page, '[data-testid="winner-name"]');
      expect([
        ...cutAtEndProblems(byText(winners, LATIN[0]!), "ltr"),
        ...cutAtEndProblems(byText(winners, ARABIC[0]!), "rtl"),
        ...wholeProblems(byText(winners, SHORT.latin), "ltr"),
      ]).toEqual([]);
    });
  }

  // Ten standings rows and the rookies strip share the 824 px column. At a 66 px row pitch the
  // list shrank and its 10th row (rank 13) sat under the strip. Real geometry, 1080p and 720p.
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    test(`all ten standings rows are clear of the rookies strip (${viewport.width}×${viewport.height})`, async ({ page }) => {
      test.setTimeout(45_000);
      await page.setViewportSize(viewport);
      const now = Date.now();
      // D34 worst case: every other row (podium included) and every rookie carries a name tag
      const tag = (n: number) => (n % 2 ? { kind: "coach", text: "Coach Abdelrahman" } : { kind: "member", text: `#${100 + n}` });
      const row = (rank: number) => ({ ref: `g${rank}`, rank, name: `Member ${rank}`, tag: rank % 2 ? tag(rank) : null, photo_url: null, initials: "M", total: 1000 - rank, movement: 0, gap_to_next: rank === 1 ? 0 : 1, pr_at: null, categories: {} });
      const rookie = (rank: number) => ({ ref: `r${rank}`, rank, name: `Rookie Number ${rank}`, tag: tag(rank), photo_url: null, initials: "R", total: 300 - rank });
      const live = { ...tvBase("en", now), version: "geometry", mode: "live", board: Array.from({ length: 13 }, (_, i) => row(i + 1)), rookies: Array.from({ length: 5 }, (_, i) => rookie(i + 1)) };
      await page.route("**/api/tv/state*", (route) => route.fulfill({ json: live }));
      await page.goto(`/tv?key=${TV_KEY}`);
      // wait for the MOCKED board (the first poll replaces the server-rendered state), not just any 10 rows
      await expect(page.getByTestId("board-name").first()).toHaveText("Member 4", { timeout: 15_000 });
      await expect(page.getByTestId("board-name")).toHaveCount(10);
      await page.waitForTimeout(800); // page-in animation
      const geometry = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-testid="standings-list"] li')].map((li) => li.getBoundingClientRect());
        const strip = document.querySelector('[data-testid="rookies-strip"]')!.getBoundingClientRect();
        return { lastBottom: Math.max(...rows.map((r) => r.bottom)), stripTop: strip.top, stripBottom: strip.bottom, height: window.innerHeight };
      });
      expect(geometry.lastBottom, "10th row ends above the rookies strip").toBeLessThanOrEqual(geometry.stripTop);
      expect(geometry.stripBottom, "strip stays on the screen").toBeLessThanOrEqual(geometry.height);
      // tags are drawn, and a tagged podium card keeps all of its content inside the card
      const tags = await page.evaluate(() => {
        const out = { board: 0, podiumOverflow: [] as string[] };
        out.board = document.querySelectorAll('[data-testid="standings-list"] [data-testid="name-tag"]').length;
        for (const card of document.querySelectorAll('[data-testid="podium-card"]')) {
          const c = card.getBoundingClientRect();
          for (const el of card.querySelectorAll("*")) {
            const r = el.getBoundingClientRect();
            if (r.height > 0 && (r.bottom > c.bottom + 0.5 || r.top < c.top - 0.5)) { out.podiumOverflow.push((el.textContent ?? "").slice(0, 24)); break; }
          }
        }
        return out;
      });
      expect(tags.board).toBe(5); // ranks 5, 7, 9, 11, 13
      expect(tags.podiumOverflow).toEqual([]);
    });
  }

  test("a wrong key shows the branded 'not authorized' screen with how to fix it, in the TV language", async ({ page }) => {
    await page.goto("/tv?key=not-the-key");
    const screen = page.getByTestId("tv-not-authorized");
    await expect(screen).toBeVisible();
    await expect(screen.locator("p").nth(1)).not.toBeEmpty(); // the hint line
    expect(await screen.textContent()).not.toMatch(/GA-\d|Arena —/); // nothing about the gym's data
  });

  test("between seasons: results coming soon, no standings; network loss keeps the last state (AC-29)", async ({ page }) => {
    test.setTimeout(75_000); // three 10 s polls: first state, the lost one, the recovered one
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
    test.setTimeout(45_000);
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

