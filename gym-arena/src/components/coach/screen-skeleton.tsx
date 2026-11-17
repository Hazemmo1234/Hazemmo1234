import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while Today / Activity load on a slow gym connection (instant feedback after a tap).
 * Not used on the member card: a loading boundary there would stream a 200 before the page
 * can answer 404 for another coach's client.
 */
export function ScreenSkeleton() {
  return (
    <main aria-busy="true" className="mx-auto max-w-3xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-12 rounded-xl" />
      {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
    </main>
  );
}
