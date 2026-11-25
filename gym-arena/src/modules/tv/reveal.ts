/**
 * Winner reveal sequence (UX C "Reveal", BR-S8, AC-24). Pure: the step is a function of the
 * time elapsed since `reveal_started_at` (server time), so a TV that is refreshed — or switched
 * on — in the middle of the reveal resumes at the correct step.
 *
 * "THE CHAMPIONS OF <season>" → 3rd (8 s) → 2nd (8 s) → "THE CHAMPION IS…" (4 s) → 1st with a
 * gold burst → the final podium is held. Places nobody holds are skipped (ties — D10: with
 * ranks 1, 1, 3 there is no second place).
 */
export type RevealStepKind = "intro" | "third" | "second" | "drumroll" | "champion" | "final";

export interface RevealStep {
  kind: RevealStepKind;
  /** seconds from the start of the reveal */
  startsAt: number;
  /** seconds; Infinity for the held final podium */
  duration: number;
}

export const REVEAL_DURATIONS: Record<Exclude<RevealStepKind, "final">, number> = {
  intro: 6,
  third: 8,
  second: 8,
  drumroll: 4,
  champion: 8,
};

export function revealTimeline(places: ReadonlySet<number>): RevealStep[] {
  const kinds: RevealStepKind[] = ["intro"];
  if (places.has(3)) kinds.push("third");
  if (places.has(2)) kinds.push("second");
  if (places.has(1)) kinds.push("drumroll", "champion");
  const steps: RevealStep[] = [];
  let at = 0;
  for (const kind of kinds) {
    const duration = REVEAL_DURATIONS[kind as Exclude<RevealStepKind, "final">];
    steps.push({ kind, startsAt: at, duration });
    at += duration;
  }
  steps.push({ kind: "final", startsAt: at, duration: Number.POSITIVE_INFINITY });
  return steps;
}

/** The step showing `elapsedSeconds` after the reveal started (negative → the intro). */
export function revealStepAt(steps: readonly RevealStep[], elapsedSeconds: number): { step: RevealStep; progress: number } {
  const t = Math.max(0, elapsedSeconds);
  for (const step of steps) {
    if (t < step.startsAt + step.duration) {
      return { step, progress: Number.isFinite(step.duration) ? (t - step.startsAt) / step.duration : 1 };
    }
  }
  const last = steps[steps.length - 1]!;
  return { step: last, progress: 1 };
}
