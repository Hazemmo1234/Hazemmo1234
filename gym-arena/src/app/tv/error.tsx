"use client";

import { useEffect } from "react";

/**
 * TV safety net (UX C: never a blank screen). If rendering the TV fails, show the brand tile
 * and a progress ring, and retry by itself every 10 s — nobody is there to press a button.
 * No text: the TV language comes from the TV state, which is what failed to load.
 */
export default function TvError({ reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    const id = setTimeout(() => reset(), 10_000);
    return () => clearTimeout(id);
  }, [reset]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-bg">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand tile */}
      <img src="/brand/logo-tile.png" alt="" width={160} height={160} className="size-40 rounded-3xl" />
      <span aria-hidden="true" className="size-16 animate-spin rounded-full border-8 border-brand border-t-transparent" />
    </main>
  );
}
