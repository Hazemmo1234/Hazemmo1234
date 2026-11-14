import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, directionOf, isLocale, resolveLocale } from "@/i18n/config";
import { ERROR_STATUS } from "@/lib/api";
import { errorCodeFromDb, statusFor } from "@/lib/errors";
import { formatDate, formatNumber, formatPoints, formatTime } from "@/lib/i18n/format";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

type Tree = { [key: string]: string | Tree };
const keysOf = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : keysOf(v, `${prefix}${k}.`)));
const valuesOf = (tree: Tree): string[] => Object.values(tree).flatMap((v) => (typeof v === "string" ? [v] : valuesOf(v)));

describe("message catalogs (AC-33, TEST_PLAN localization)", () => {
  it("Arabic and English have identical key sets", () => {
    expect(keysOf(ar).sort()).toEqual(keysOf(en).sort());
  });

  it("no message is empty", () => {
    for (const value of [...valuesOf(ar), ...valuesOf(en)]) expect(value.trim().length).toBeGreaterThan(0);
  });

  it("Arabic messages are actually Arabic and English ones contain no Arabic", () => {
    const arabic = /[؀-ۿ]/;
    const sameInBoth = new Set(["common.appName"]); // brand name
    const arFlat = Object.fromEntries(keysOf(ar).map((k, i) => [k, valuesOf(ar)[i]]));
    const enFlat = Object.fromEntries(keysOf(en).map((k, i) => [k, valuesOf(en)[i]]));
    for (const key of keysOf(ar)) {
      if (sameInBoth.has(key)) continue;
      expect(arabic.test(arFlat[key]), `ar:${key}`).toBe(true);
      expect(arabic.test(enFlat[key]), `en:${key}`).toBe(false);
    }
  });

  it("every API error code has a translation in both languages", () => {
    for (const code of [...Object.keys(ERROR_STATUS), "UNKNOWN"]) {
      expect(ar.errors, code).toHaveProperty(code);
      expect(en.errors, code).toHaveProperty(code);
    }
  });

  it("Arabic digits never appear in the catalogs (BR-L5: Western digits)", () => {
    for (const value of [...valuesOf(ar), ...valuesOf(en)]) expect(value).not.toMatch(/[٠-٩۰-۹]/);
  });
});

describe("no hard-coded Arabic in the source (D15)", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  it("only the Arabic catalog and the language's own name contain Arabic text", () => {
    const offenders = walk("src")
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => !f.endsWith("language-switcher.tsx")) // "العربية" is the language's own name
      .filter((f) => /[؀-ۿ]/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("locale resolution (BR-L1 … BR-L3)", () => {
  it("Arabic is the default; direction follows the language", () => {
    expect(DEFAULT_LOCALE).toBe("ar");
    expect(LOCALES).toEqual(["ar", "en"]);
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });

  it("profile → cookie → Arabic", () => {
    expect(resolveLocale("en", "ar")).toBe("en");
    expect(resolveLocale(null, "en")).toBe("en");
    expect(resolveLocale(undefined, undefined)).toBe("ar");
    expect(resolveLocale("fr", "de")).toBe("ar");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("formatting (BR-L5)", () => {
  it("uses Western digits in both languages", () => {
    for (const locale of LOCALES) {
      expect(formatPoints(726.15, locale)).toBe("726");
      expect(formatNumber(110.8333, locale)).toBe("110.8");
      expect(formatDate("2026-11-14", locale)).toMatch(/14/);
      expect(formatDate("2026-11-14", locale)).toMatch(/2026/);
      expect(formatDate("2026-11-14", locale)).not.toMatch(/[٠-٩]/);
      expect(formatTime(new Date("2026-01-15T10:05:00Z"), locale)).toBe("12:05"); // Cairo winter = UTC+2
    }
  });

  it("rounds points half-up (SCORING §5)", () => {
    expect(formatPoints(726.5, "en")).toBe("727");
    expect(formatPoints(726.49, "ar")).toBe("726");
    expect(formatPoints(0, "ar")).toBe("0");
    expect(formatPoints(1000, "en")).toBe("1000");
  });

  it("month names are localized", () => {
    expect(formatDate("2026-11-14", "en")).toBe("14 November 2026");
    expect(formatDate("2026-11-14", "ar")).toContain("نوفمبر");
  });
});

describe("database errors → stable API codes", () => {
  it("maps rule violations raised by the database", () => {
    expect(errorCodeFromDb("ALREADY_LOGGED_TODAY")).toBe("ALREADY_LOGGED_TODAY");
    expect(errorCodeFromDb("NO_ACTIVE_SEASON: date must be within the active season")).toBe("NO_ACTIVE_SEASON");
    expect(errorCodeFromDb("SEASON_CLOSED")).toBe("SEASON_CLOSED");
    expect(errorCodeFromDb("VOID_WINDOW_PASSED")).toBe("VOID_WINDOW_PASSED");
    expect(errorCodeFromDb("FORBIDDEN: not your client")).toBe("FORBIDDEN");
    expect(errorCodeFromDb("MEMBER_INACTIVE")).toBe("FORBIDDEN");
    expect(errorCodeFromDb("VALIDATION: a reason is required")).toBe("VALIDATION");
    expect(errorCodeFromDb('new row for relation "entries" violates check constraint "entries_shape"')).toBe("VALIDATION");
    expect(errorCodeFromDb("permission denied for table entries")).toBe("FORBIDDEN");
    expect(errorCodeFromDb("NOT_FOUND")).toBe("NOT_FOUND");
    expect(errorCodeFromDb("something else")).toBe("UNKNOWN");
    expect(errorCodeFromDb(null)).toBe("UNKNOWN");
    expect(statusFor("UNKNOWN")).toBe(500);
    expect(statusFor("VOID_WINDOW_PASSED")).toBe(403);
  });
});
