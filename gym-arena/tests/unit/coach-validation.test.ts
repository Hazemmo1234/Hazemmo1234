import { describe, expect, it } from "vitest";
import { createCoachSchema, updateCoachSchema } from "@/lib/validation/coaches";

const issue = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => (r.success ? null : r.error!.issues[0].message);

describe("coach validation (UX A4, SECURITY §1)", () => {
  const ok = { full_name: " Coach Sara ", email: " Sara@Gym-Arena.local ", password: "a-long-pass" };
  it("normalizes name and email", () => {
    const r = createCoachSchema.safeParse(ok);
    expect(r.success && r.data).toMatchObject({ full_name: "Coach Sara", email: "sara@gym-arena.local" });
  });
  it("requires a name, a valid email and a password of at least 10 characters", () => {
    expect(issue(createCoachSchema.safeParse({ ...ok, full_name: " " }))).toBe("name_required");
    expect(issue(createCoachSchema.safeParse({ ...ok, full_name: "x".repeat(81) }))).toBe("name_too_long");
    expect(issue(createCoachSchema.safeParse({ ...ok, email: "not-an-email" }))).toBe("invalid_email");
    expect(issue(createCoachSchema.safeParse({ ...ok, password: "123456789" }))).toBe("password_too_short");
    expect(issue(createCoachSchema.safeParse({ ...ok, password: "x".repeat(73) }))).toBe("password_too_long");
  });
  it("rejects extra fields (a role cannot be smuggled in)", () => {
    expect(createCoachSchema.safeParse({ ...ok, role: "admin" }).success).toBe(false);
    expect(updateCoachSchema.safeParse({ role: "admin" }).success).toBe(false);
  });
  it("update: name and/or status, at least one", () => {
    expect(updateCoachSchema.safeParse({ is_active: false }).success).toBe(true);
    expect(updateCoachSchema.safeParse({ full_name: "New" }).success).toBe(true);
    expect(issue(updateCoachSchema.safeParse({}))).toBe("nothing_to_update");
    expect(updateCoachSchema.safeParse({ is_active: "no" }).success).toBe(false);
  });
});
