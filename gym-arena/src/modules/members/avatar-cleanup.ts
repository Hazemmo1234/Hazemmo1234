/**
 * Deferred avatar cleanup (M2 decision 4, hardened). Pure: storage and database access
 * and "now" are passed in, so the rules below are unit-tested without I/O.
 *
 * Rules
 * - Nothing is deleted at the moment a photo is replaced or removed. The previous avatar
 *   stays in storage (and any signed URL already handed out keeps working).
 * - A file is a cleanup candidate only when BOTH
 *     (a) it was uploaded at least AVATAR_CLEANUP_GRACE_MS ago, and
 *     (b) the member's row has not changed for at least AVATAR_CLEANUP_GRACE_MS
 *         (members.updated_at moves on every photo change, so a just-replaced avatar is
 *         kept for the full grace period).
 * - Immediately before deleting, every candidate is re-checked against the database:
 *   a file referenced by ANY member is never deleted, and if the member's row changed
 *   since the first read the run stops without deleting anything.
 * - Only fresh uploads (younger than AVATAR_ATTACH_WINDOW_MS) can be attached to a
 *   member. Attachable files and deletable files therefore never overlap (5 min < 10 min),
 *   so a concurrent replacement can never attach a file that a cleanup is deleting.
 * - Idempotent: deleting an already-deleted file is a no-op, so concurrent or repeated
 *   runs are harmless.
 * - Never throws. A failed cleanup only leaves files for a later run; it can never
 *   affect member updates or the photo currently in use.
 * - TV consent plays no part: a referenced photo is kept whatever the consent setting,
 *   and turning consent off never triggers a cleanup.
 */
export const AVATAR_ATTACH_WINDOW_MS = 5 * 60_000;
export const AVATAR_CLEANUP_GRACE_MS = 10 * 60_000;

export interface StoredAvatar {
  path: string;
  createdAt: Date;
}

export interface AvatarCleanupDeps {
  /** Files currently in members/{memberId}/ */
  listFolder(memberId: string): Promise<StoredAvatar[]>;
  /** The member's current photo_path and updated_at, or null when the member is not found */
  readMember(memberId: string): Promise<{ photoPath: string | null; updatedAt: Date } | null>;
  /** The subset of `paths` that any member's photo_path references right now */
  referencedPaths(paths: string[]): Promise<Set<string>>;
  remove(paths: string[]): Promise<void>;
}

export interface AvatarCleanupResult {
  removed: string[];
  /** why nothing (more) was removed this run, for logs and tests */
  skipped?: "member_not_found" | "recent_change" | "nothing_to_remove" | "changed_during_cleanup";
  error?: string;
}

const age = (now: Date, at: Date) => now.getTime() - at.getTime();

/** Can a just-uploaded file be attached to a member? (Fresh uploads only; see rules.) */
export function isAttachable(file: StoredAvatar, now: Date): boolean {
  const a = age(now, file.createdAt);
  return a <= AVATAR_ATTACH_WINDOW_MS && a >= -AVATAR_ATTACH_WINDOW_MS; // small clock skew tolerated
}

export async function cleanupMemberAvatars(memberId: string, now: Date, deps: AvatarCleanupDeps): Promise<AvatarCleanupResult> {
  try {
    const member = await deps.readMember(memberId);
    if (!member) return { removed: [], skipped: "member_not_found" };
    if (age(now, member.updatedAt) < AVATAR_CLEANUP_GRACE_MS) return { removed: [], skipped: "recent_change" };

    const files = await deps.listFolder(memberId);
    const candidates = files
      .filter((f) => f.path !== member.photoPath && age(now, f.createdAt) >= AVATAR_CLEANUP_GRACE_MS)
      .map((f) => f.path);
    if (candidates.length === 0) return { removed: [], skipped: "nothing_to_remove" };

    // Re-check right before deleting: the database is the authority on what is in use.
    const [referenced, again] = await Promise.all([deps.referencedPaths(candidates), deps.readMember(memberId)]);
    if (!again || again.updatedAt.getTime() !== member.updatedAt.getTime() || again.photoPath !== member.photoPath) {
      return { removed: [], skipped: "changed_during_cleanup" };
    }
    const doomed = candidates.filter((p) => !referenced.has(p) && p !== again.photoPath);
    if (doomed.length === 0) return { removed: [], skipped: "nothing_to_remove" };
    await deps.remove(doomed);
    return { removed: doomed };
  } catch (e) {
    return { removed: [], error: e instanceof Error ? e.message : "cleanup_failed" };
  }
}
