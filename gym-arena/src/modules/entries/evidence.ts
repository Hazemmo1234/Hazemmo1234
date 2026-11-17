/**
 * Evidence photos (BR-E6, BR-X3, SECURITY_SPECIFICATION §8). Pure: storage, database and
 * "now" are passed in, so the rules are unit-tested without I/O.
 *
 * Path: entries/{season_id}/{member_id}/{uuid}.webp|jpg in the private `evidence` bucket.
 * The database also checks the folder on every entry insert (entries_before_insert).
 *
 * Abandoned uploads (a photo taken, then the sheet closed) are removed later, never at once:
 * - an upload can be attached to an entry only while fresh (EVIDENCE_ATTACH_WINDOW_MS);
 * - a file is deleted only when older than EVIDENCE_CLEANUP_GRACE_MS AND referenced by no
 *   entry at all — voided entries keep their photo (BR-E8, the audit trail).
 * The windows never overlap, so a cleanup can never delete a file a save is attaching.
 * Idempotent and never throws; a failed cleanup only leaves files for a later run.
 */
export const EVIDENCE_ATTACH_WINDOW_MS = 15 * 60_000;
export const EVIDENCE_CLEANUP_GRACE_MS = 60 * 60_000;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE = new RegExp(`^entries/(${UUID})/(${UUID})/(${UUID})\\.(webp|jpg)$`);

export function evidenceFolder(seasonId: string, memberId: string): string {
  return `entries/${seasonId}/${memberId}`;
}

/** True only for a file directly in this season's folder for this member. */
export function isEvidencePath(path: string, seasonId: string, memberId: string): boolean {
  const m = FILE.exec(path);
  return !!m && m[1] === seasonId.toLowerCase() && m[2] === memberId.toLowerCase();
}

export interface StoredEvidence {
  path: string;
  createdAt: Date;
}

export function isAttachableEvidence(file: StoredEvidence, now: Date): boolean {
  const age = now.getTime() - file.createdAt.getTime();
  return age <= EVIDENCE_ATTACH_WINDOW_MS && age >= -EVIDENCE_ATTACH_WINDOW_MS;
}

export interface EvidenceCleanupDeps {
  listFolder(folder: string): Promise<StoredEvidence[]>;
  /** The subset of `paths` referenced by any entry (voided or not) right now */
  referencedPaths(paths: string[]): Promise<Set<string>>;
  remove(paths: string[]): Promise<void>;
}

export async function cleanupEvidence(
  folder: string,
  now: Date,
  deps: EvidenceCleanupDeps,
): Promise<{ removed: string[]; error?: string }> {
  try {
    const files = await deps.listFolder(folder);
    const candidates = files.filter((f) => now.getTime() - f.createdAt.getTime() >= EVIDENCE_CLEANUP_GRACE_MS).map((f) => f.path);
    if (candidates.length === 0) return { removed: [] };
    const referenced = await deps.referencedPaths(candidates);
    const doomed = candidates.filter((p) => !referenced.has(p));
    if (doomed.length === 0) return { removed: [] };
    await deps.remove(doomed);
    return { removed: doomed };
  } catch (e) {
    return { removed: [], error: e instanceof Error ? e.message : "cleanup_failed" };
  }
}
