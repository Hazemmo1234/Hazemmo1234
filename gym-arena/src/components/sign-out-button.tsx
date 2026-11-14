"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const t = useTranslations("common");
  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      className="min-h-11 rounded-lg px-3 text-sm text-text-muted hover:text-text"
    >
      {t("signOut")}
    </button>
  );
}
