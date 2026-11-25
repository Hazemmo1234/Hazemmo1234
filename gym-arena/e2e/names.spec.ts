import { expect, test } from "./fixtures";
import { LOCAL_ONLY, signIn } from "./helpers";
import { cutAtEndProblems, namesShown, wholeProblems } from "./names";

// Staff screens in Arabic (D15): a member's name is cut at its END in either script (NameText):
// a long Latin name keeps its beginning, an Arabic name stays right-to-left, a short name is
// whole. Real pages and real styles; the seed has only short names, so the names of three listed
// members are swapped in the rendered page for long and short test names — nothing is written
// for this beyond the sign-in itself.
const LONG_LATIN = "Abdelrahman Mohamed Elsayed Abdelaziz Elshennawy";
const LONG_ARABIC = "عبد الرحمن محمد السيد عبد العزيز الشناوي المنصوري";
const SHORT = "Omar Ali";

const SCREENS = [
  { who: "coach1@gym-arena.local", path: "/today" },
  { who: "admin@gym-arena.local", path: "/admin/members" },
] as const;

test.describe("member names on staff screens (Arabic)", () => {
  test.skip(LOCAL_ONLY, "seed accounts exist only locally");
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "coach-mobile", "staff screens: run once, on the phone project");
  });

  for (const screen of SCREENS) {
    test(`${screen.path}: long Latin names keep their beginning, Arabic names stay RTL, short names are whole`, async ({ page }) => {
      await signIn(page, screen.who);
      await page.waitForURL(/\/(today|admin\/dashboard)$/);
      await page.request.post("/api/locale", { data: { locale: "ar" } });
      await page.goto(screen.path);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const rows = "li .name-text.font-bold"; // each listed member's name
      await expect(page.locator(rows).nth(2)).toBeVisible();
      await page.locator(rows).evaluateAll((els, texts) => texts.forEach((t, i) => (els[i]!.textContent = t)), [LONG_LATIN, LONG_ARABIC, SHORT]);
      const [latin, arabic, short] = await namesShown(page, rows);
      expect([...cutAtEndProblems(latin!, "ltr"), ...cutAtEndProblems(arabic!, "rtl"), ...wholeProblems(short!, "ltr")]).toEqual([]);
    });
  }
});
