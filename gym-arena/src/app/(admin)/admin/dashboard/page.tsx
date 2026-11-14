import { AppHeader } from "@/components/app-header";
import { getCurrentProfile } from "@/lib/auth";

// M0 placeholder — the Admin dashboard (UX A1) is built in M4.
export default async function AdminDashboardPage() {
  const profile = await getCurrentProfile();
  return (
    <>
      <AppHeader title={profile?.full_name ?? ""} subtitle="الإدارة" />
      <main className="p-4 text-text-muted">لوحة التحكم — قيد الإنشاء (M4)</main>
    </>
  );
}
