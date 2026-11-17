import { describe, expect, it } from "vitest";
import { formatEgyptianMobile, normalizeEgyptianMobile } from "@/lib/phone";
import { createMemberSchema, isMemberAvatarPath, memberPlanSchema, memberStatusSchema, updateMemberSchema } from "@/lib/validation/members";
import { rookieFlags } from "@/modules/members/rookie";
import { scoreSeason, type ParticipantHistory } from "@/modules/scoring";

describe("Egyptian mobile normalization (BR-P3, D12)", () => {
  it.each([
    ["01012345678", "+201012345678"],
    ["010 1234 5678", "+201012345678"],
    ["010-1234-5678", "+201012345678"],
    ["(011) 2345.6789", "+201123456789"],
    ["201212345678", "+201212345678"],
    ["+201512345678", "+201512345678"],
    ["00201012345678", "+201012345678"],
    ["٠١٠١٢٣٤٥٦٧٨", "+201012345678"], // Arabic-Indic digits
    ["۰۱۱۲۳۴۵۶۷۸۹", "+201123456789"], // Persian digits
    ["‎+20 10 1234 5678", "+201012345678"], // LTR mark from copy-paste
  ])("%s → %s", (input, expected) => {
    expect(normalizeEgyptianMobile(input)).toBe(expected);
  });

  it.each(["0101234567", "010123456789", "01312345678", "+14155550100", "02 2345 6789", "", "abc", "+2010123456789"])(
    "rejects %s",
    (input) => expect(normalizeEgyptianMobile(input)).toBeNull(),
  );

  it("formats for display with Western digits", () => {
    expect(formatEgyptianMobile("+201012345678")).toBe("010 1234 5678");
    expect(formatEgyptianMobile("+1555")).toBe("+1555");
  });
});

describe("member validation", () => {
  const ok = { full_name: " Mona Adel ", phone: "010 1234 5678", photo_consent: true };
  it("create: trims, normalizes the phone, defaults consent; strict", () => {
    const r = createMemberSchema.safeParse({ full_name: "A", phone: "01012345678" });
    expect(r.success && r.data).toMatchObject({ full_name: "A", phone: "+201012345678", photo_consent: false });
    expect(createMemberSchema.safeParse(ok).success).toBe(true);
    const issue = (v: unknown) => { const x = createMemberSchema.safeParse(v); return x.success ? null : x.error.issues[0].message; };
    expect(issue({ ...ok, full_name: " " })).toBe("name_required");
    expect(issue({ ...ok, phone: "12345" })).toBe("invalid_phone");
    expect(issue({ ...ok, planned_sessions: 0 })).toBe("invalid_plan");
    expect(issue({ ...ok, planned_sessions: 32 })).toBe("invalid_plan");
    expect(createMemberSchema.safeParse({ ...ok, status: "inactive" }).success).toBe(false);
    expect(createMemberSchema.safeParse({ ...ok, member_code: "GA-000001" }).success).toBe(false);
  });
  it("update / status / plan", () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
    expect(updateMemberSchema.safeParse({ coach_id: "x" }).success).toBe(false); // reassignment has its own endpoint
    expect(updateMemberSchema.safeParse({ photo_path: null }).success).toBe(true);
    expect(memberStatusSchema.safeParse({ status: "active" }).success).toBe(true);
    expect(memberStatusSchema.safeParse({ status: "gone" }).success).toBe(false);
    expect(memberPlanSchema.safeParse({ planned_sessions: 12 }).success).toBe(true);
    expect(memberPlanSchema.safeParse({ planned_sessions: 1.5 }).success).toBe(false);
  });
  it("avatar paths must be in the member's own folder", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const file = "22222222-2222-4222-8222-222222222222";
    expect(isMemberAvatarPath(`members/${id}/${file}.webp`, id)).toBe(true);
    expect(isMemberAvatarPath(`members/${id}/${file}.jpg`, id)).toBe(true);
    expect(isMemberAvatarPath(`members/33333333-3333-4333-8333-333333333333/${file}.webp`, id)).toBe(false);
    expect(isMemberAvatarPath(`members/${id}/../x.webp`, id)).toBe(false);
    expect(isMemberAvatarPath(`members/${id}/${file}.png`, id)).toBe(false);
    expect(isMemberAvatarPath(`entries/${id}/${file}.webp`, id)).toBe(false);
  });
});

describe("rookie flag reuses the scoring definition (decision 2)", () => {
  const season = { type: "championship" as const, startsOn: "2026-12-01", endsOn: "2026-12-31" };
  const rows = [
    { member_id: "vet", category: "pushups" as const, performed_on: "2026-11-01", weight_kg: null, reps: 10, km: null, voided_at: null },
    { member_id: "vet", category: "pushups" as const, performed_on: "2026-12-02", weight_kg: null, reps: 12, km: null, voided_at: null },
    { member_id: "voided-only", category: "bench" as const, performed_on: "2026-11-01", weight_kg: "60", reps: 5, km: null, voided_at: "2026-11-01T10:00:00Z" },
    { member_id: "treadmill-before", category: "treadmill" as const, performed_on: "2026-11-30", weight_kg: null, reps: null, km: "2.5", voided_at: null },
    { member_id: "new", category: "squat" as const, performed_on: "2026-12-05", weight_kg: 80, reps: 5, km: null, voided_at: null },
  ];
  const ids = ["vet", "voided-only", "treadmill-before", "new", "no-entries"];

  it("flags match the scoring module's main/rookies split exactly", () => {
    const flags = rookieFlags(season, ids, rows);
    expect(Object.fromEntries(flags)).toEqual({ vet: false, "voided-only": true, "treadmill-before": false, new: true, "no-entries": true });
    const participants: ParticipantHistory[] = ids.map((id) => ({
      memberId: id, isActive: true, plannedSessions: 12, attendance: [],
      entries: rows.filter((r) => r.member_id === id).map((r) => ({ category: r.category, performedOn: r.performed_on, weightKg: r.weight_kg, reps: r.reps, km: r.km, voided: r.voided_at !== null })),
    }));
    const standings = scoreSeason(season, participants);
    for (const id of ids) {
      expect(flags.get(id), id).toBe(standings.rookies.some((r) => r.memberId === id));
    }
  });
});

describe("ids accepted exactly like Postgres uuid (any UUID-shaped value)", () => {
  it("accepts seed-style ids that strict RFC validation would reject", async () => {
    const { reassignMemberSchema, avatarUploadSchema } = await import("@/lib/validation/members");
    const seedId = "00000000-0000-4000-c000-000000000027"; // variant 'c' — valid for Postgres
    expect(reassignMemberSchema.safeParse({ coach_id: seedId }).success).toBe(true);
    expect(avatarUploadSchema.safeParse({ member_id: seedId, content_type: "image/webp" }).success).toBe(true);
    expect(reassignMemberSchema.safeParse({ coach_id: "not-a-uuid" }).success).toBe(false);
  });
});
