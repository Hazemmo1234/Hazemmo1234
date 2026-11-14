"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoutIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ variant = "text" }: { variant?: "text" | "icon" }) {
  const router = useRouter();
  const t = useTranslations("common");
  const [pending, setPending] = useState(false);
  const signOut = async () => {
    setPending(true);
    // Sign out of THIS device only. A global sign-out would also end the same person's
    // sessions on other devices (e.g. signing out on the gym iPad would log them out on
    // their phone). Account deactivation (D28) is what ends every session.
    await createClient().auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        aria-label={t("signOut")}
        title={t("signOut")}
        className="grid size-11 place-items-center rounded-xl text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
      >
        <LogoutIcon />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
    >
      <LogoutIcon size={18} />
      {t("signOut")}
    </button>
  );
}
