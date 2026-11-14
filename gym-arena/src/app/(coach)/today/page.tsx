import { AppHeader } from "@/components/app-header";
import { getCurrentProfile } from "@/lib/auth";

// M0 placeholder — the Today screen (UX C2) is built in M3.
export default async function TodayPage() {
  const profile = await getCurrentProfile();
  return (
    <>
      <AppHeader title={profile?.full_name ?? ""} subtitle="المدرب" />
      <main className="p-4 text-text-muted">شاشة اليوم — قيد الإنشاء (M3)</main>
    </>
  );
}
