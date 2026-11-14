import { createServiceClient } from "@/lib/supabase/service";
import { tvKeyMatches } from "@/modules/tv/key";

export const dynamic = "force-dynamic";

// M0: key gate only. Live / preseason / between / reveal modes are built in M5.
export default async function TvPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const { data } = await createServiceClient().from("app_settings").select("tv_key").eq("id", 1).single();
  if (!data || !tvKeyMatches(key, data.tv_key)) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-2xl text-text-muted">
        Display not authorized
      </main>
    );
  }
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="display text-6xl">DFN ARENA</p>
    </main>
  );
}
