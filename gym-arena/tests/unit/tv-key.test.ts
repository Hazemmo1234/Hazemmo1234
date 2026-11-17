import { describe, expect, it } from "vitest";
import { tvKeyMatches } from "@/modules/tv/key";

describe("TV key (D3, AC-26)", () => {
  it("accepts only the exact key", () => {
    expect(tvKeyMatches("abc123", "abc123")).toBe(true);
    expect(tvKeyMatches("abc124", "abc123")).toBe(false);
    expect(tvKeyMatches("abc", "abc123")).toBe(false);
    expect(tvKeyMatches(null, "abc123")).toBe(false);
    expect(tvKeyMatches(undefined, "abc123")).toBe(false);
  });
});
