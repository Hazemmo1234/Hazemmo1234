import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { getCurrentProfile } from "@/lib/auth";

// M0 placeholder — the Today screen (UX C2) is built in M3.
export default async function TodayPage() {
  const [profile, t, c] = await Promise.all([getCurrentProfile(), getTranslations("coach"), getTranslations("common")]);
  return (
    <>
      <AppHeader title={profile?.full_name ?? ""} subtitle={t("role")} />
      <main className="p-4 text-start text-text-muted">
        {t("todayPlaceholder")} — {c("underConstruction")}
      </main>
    </>
  );
}
