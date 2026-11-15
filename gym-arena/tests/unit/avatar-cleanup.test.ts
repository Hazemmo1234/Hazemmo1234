import { describe, expect, it } from "vitest";
import {
  AVATAR_ATTACH_WINDOW_MS,
  AVATAR_CLEANUP_GRACE_MS,
  cleanupMemberAvatars,
  isAttachable,
  type AvatarCleanupDeps,
} from "@/modules/members/avatar-cleanup";

const MIN = 60_000;
const M = "00000000-0000-4000-c000-000000000001";
const OTHER = "00000000-0000-4000-c000-000000000002";
const T0 = new Date("2026-11-14T10:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);
const file = (n: number) => `members/${M}/0000000${n}-0000-4000-8000-000000000000.webp`;

/** In-memory storage + members table with the same semantics as the real adapters. */
function world() {
  const files = new Map<string, Date>(); // path → uploaded at
  const members = new Map<string, { photoPath: string | null; updatedAt: Date }>();
  const removals: string[][] = [];
  let hook: ((step: string) => Promise<void> | void) | null = null;
  const fail = new Set<string>();
  const tick = async (step: string) => {
    await Promise.resolve();
    if (fail.has(step)) throw new Error(`${step} failed`);
    await hook?.(step);
  };
  const deps: AvatarCleanupDeps = {
    async listFolder(memberId) {
      await tick("list");
      return [...files].filter(([p]) => p.startsWith(`members/${memberId}/`)).map(([path, createdAt]) => ({ path, createdAt }));
    },
    async readMember(memberId) {
      await tick("read");
      const m = members.get(memberId);
      return m ? { ...m } : null;
    },
    async referencedPaths(paths) {
      await tick("refs");
      return new Set([...members.values()].map((m) => m.photoPath).filter((p): p is string => !!p && paths.includes(p)));
    },
    async remove(paths) {
      await tick("remove");
      removals.push(paths);
      for (const p of paths) files.delete(p); // deleting a missing file is a no-op
    },
  };
  return {
    files, members, removals, deps, fail,
    upload: (path: string, when: Date) => files.set(path, when),
    /** what setPhoto does after its own checks: point the member at the file, bump updated_at */
    attach: (memberId: string, path: string | null, when: Date) => members.set(memberId, { photoPath: path, updatedAt: when }),
    onStep: (h: typeof hook) => { hook = h; },
  };
}

describe("avatar cleanup: delayed", () => {
  it("never deletes the previous avatar at the moment of replacement", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.attach(M, file(1), at(0));
    w.upload(file(2), at(60)); w.attach(M, file(2), at(60)); // replaced an hour later
    const r = await cleanupMemberAvatars(M, at(60), w.deps);
    expect(r).toEqual({ removed: [], skipped: "recent_change" });
    expect([...w.files.keys()].sort()).toEqual([file(1), file(2)]);
  });

  it("keeps the previous avatar for the full grace period after the change, then removes it", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.attach(M, file(1), at(0));
    w.upload(file(2), at(60)); w.attach(M, file(2), at(60));
    expect((await cleanupMemberAvatars(M, at(69.9), w.deps)).removed).toEqual([]);
    expect((await cleanupMemberAvatars(M, at(70), w.deps)).removed).toEqual([file(1)]);
    expect([...w.files.keys()]).toEqual([file(2)]);
  });

  it("an unused upload is a candidate only once it is at least 10 minutes old", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.attach(M, file(1), at(0));
    w.upload(file(3), at(20)); // abandoned form
    expect((await cleanupMemberAvatars(M, at(29), w.deps)).removed).toEqual([]);
    expect((await cleanupMemberAvatars(M, at(30), w.deps)).removed).toEqual([file(3)]);
    expect(AVATAR_CLEANUP_GRACE_MS).toBe(10 * MIN);
  });

  it("removing the photo keeps the file for the grace period too", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.attach(M, file(1), at(0));
    w.attach(M, null, at(30));
    expect((await cleanupMemberAvatars(M, at(31), w.deps)).removed).toEqual([]);
    expect((await cleanupMemberAvatars(M, at(40), w.deps)).removed).toEqual([file(1)]);
  });

  it("does nothing for an unknown member", async () => {
    const w = world();
    w.upload(file(1), at(0));
    expect(await cleanupMemberAvatars(M, at(100), w.deps)).toEqual({ removed: [], skipped: "member_not_found" });
    expect(w.files.size).toBe(1);
  });
});

describe("avatar cleanup: referenced-file protection", () => {
  it("never deletes the member's current photo, however old", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.attach(M, file(1), at(0));
    expect(await cleanupMemberAvatars(M, at(10_000), w.deps)).toEqual({ removed: [], skipped: "nothing_to_remove" });
    expect(w.files.has(file(1))).toBe(true);
  });

  it("never deletes a file referenced by any member, even another one", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.upload(file(2), at(0));
    w.attach(M, file(1), at(0));
    w.members.set(OTHER, { photoPath: file(2), updatedAt: at(0) }); // impossible under the DB path check; defence in depth
    expect(await cleanupMemberAvatars(M, at(100), w.deps)).toEqual({ removed: [], skipped: "nothing_to_remove" });
    expect(w.files.size).toBe(2);
  });

  it("re-checks the database right before deleting and stops if the member changed meanwhile", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.upload(file(2), at(0)); w.attach(M, file(1), at(0));
    w.onStep((step) => {
      // a replacement lands between the first read and the final re-check
      if (step === "list") w.attach(M, file(2), at(100));
    });
    expect(await cleanupMemberAvatars(M, at(100), w.deps)).toEqual({ removed: [], skipped: "changed_during_cleanup" });
    expect(w.files.size).toBe(2);
  });

  it("TV consent plays no part: a referenced photo is kept whatever the consent", async () => {
    // the cleanup has no consent input at all; a consent change only bumps updated_at,
    // which can only postpone a cleanup
    const w = world();
    w.upload(file(1), at(0)); w.attach(M, file(1), at(0));
    w.attach(M, file(1), at(50)); // consent turned off: same photo, row updated
    expect((await cleanupMemberAvatars(M, at(51), w.deps)).skipped).toBe("recent_change");
    expect((await cleanupMemberAvatars(M, at(500), w.deps)).removed).toEqual([]);
    expect(w.files.has(file(1))).toBe(true);
  });
});

describe("avatar cleanup: concurrency", () => {
  it("concurrent replacements: both uploads survive, whichever wins, and the winner is never deleted", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.attach(M, file(1), at(0));
    // two people replace the photo at the same moment
    w.upload(file(2), at(60)); w.upload(file(3), at(60));
    w.attach(M, file(2), at(60));
    const a = cleanupMemberAvatars(M, at(60), w.deps);
    w.attach(M, file(3), at(60.01));
    const b = cleanupMemberAvatars(M, at(60.01), w.deps);
    await Promise.all([a, b]);
    expect([...w.files.keys()].sort()).toEqual([file(1), file(2), file(3)]); // nothing deleted yet

    // ten minutes later only the unreferenced ones go; the winner stays
    const later = await Promise.all([cleanupMemberAvatars(M, at(71), w.deps), cleanupMemberAvatars(M, at(71), w.deps)]);
    expect([...w.files.keys()]).toEqual([file(3)]);
    expect(later.every((r) => !r.error)).toBe(true);
  });

  it("files that can still be attached can never be deleted (the windows don't overlap)", () => {
    expect(AVATAR_ATTACH_WINDOW_MS).toBeLessThan(AVATAR_CLEANUP_GRACE_MS);
    const now = at(100);
    expect(isAttachable({ path: file(1), createdAt: at(95) }, now)).toBe(true);
    expect(isAttachable({ path: file(1), createdAt: at(94.9) }, now)).toBe(false);
    expect(isAttachable({ path: file(1), createdAt: at(104) }, now)).toBe(true); // clock skew
    expect(isAttachable({ path: file(1), createdAt: at(106) }, now)).toBe(false);
  });

  it("concurrent and repeated cleanups are idempotent", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.upload(file(2), at(0)); w.upload(file(3), at(0));
    w.attach(M, file(3), at(0));
    const runs = await Promise.all(Array.from({ length: 5 }, () => cleanupMemberAvatars(M, at(100), w.deps)));
    expect(runs.every((r) => !r.error)).toBe(true);
    expect([...w.files.keys()]).toEqual([file(3)]);
    expect(await cleanupMemberAvatars(M, at(200), w.deps)).toEqual({ removed: [], skipped: "nothing_to_remove" });
  });
});

describe("avatar cleanup: failures", () => {
  for (const step of ["read", "list", "refs", "remove"]) {
    it(`a failing ${step} step is reported, never thrown, and deletes nothing`, async () => {
      const w = world();
      w.upload(file(1), at(0)); w.upload(file(2), at(0)); w.attach(M, file(2), at(0));
      w.fail.add(step);
      const r = await cleanupMemberAvatars(M, at(100), w.deps);
      expect(r).toEqual({ removed: [], error: `${step} failed` });
      expect(w.files.size).toBe(2);
      expect(w.members.get(M)!.photoPath).toBe(file(2)); // the photo in use is untouched
      // the next run (once the failure is gone) finishes the job
      w.fail.clear();
      expect((await cleanupMemberAvatars(M, at(101), w.deps)).removed).toEqual([file(1)]);
    });
  }

  it("non-Error failures are reported too", async () => {
    const w = world();
    w.attach(M, null, at(0));
    const deps = { ...w.deps, readMember: () => Promise.reject("boom") };
    expect(await cleanupMemberAvatars(M, at(100), deps)).toEqual({ removed: [], error: "cleanup_failed" });
  });

  it("stops when the member disappears between the two reads", async () => {
    const w = world();
    w.upload(file(1), at(0)); w.attach(M, null, at(0));
    w.onStep((step) => { if (step === "list") w.members.delete(M); });
    expect(await cleanupMemberAvatars(M, at(100), w.deps)).toEqual({ removed: [], skipped: "changed_during_cleanup" });
    expect(w.files.size).toBe(1);
  });
});
