import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { getCurrentProfile } from "@/lib/auth";

// M0 placeholder — the Admin dashboard (UX A1) is built in M4.
export default async function AdminDashboardPage() {
  const [profile, t, c] = await Promise.all([getCurrentProfile(), getTranslations("admin"), getTranslations("common")]);
  return (
    <>
      <AppHeader title={profile?.full_name ?? ""} subtitle={t("role")} />
      <main className="p-4 text-start text-text-muted">
        {t("dashboardPlaceholder")} — {c("underConstruction")}
      </main>
    </>
  );
}
