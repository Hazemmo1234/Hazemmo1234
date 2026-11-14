"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { HOME_BY_ROLE } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/supabase/types";

type LoginError = "credentials" | "inactive" | "network" | null;

export function LoginForm({ initialError }: { initialError: LoginError }) {
  const router = useRouter();
  const t = useTranslations("auth");
  const [error, setError] = useState<LoginError>(initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !data.user) {
        setError(authError?.status === 400 || authError?.status === 401 ? "credentials" : authError ? "network" : "credentials");
        return;
      }
      // AC-1: inactive accounts are denied with "Account inactive"
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active, role")
        .eq("id", data.user.id)
        .maybeSingle<{ is_active: boolean; role: UserRole }>();
      if (!profile?.is_active) {
        await supabase.auth.signOut();
        setError("inactive");
        return;
      }
      // Go straight to the role's home. Navigating to "/" and relying on the middleware
      // redirect left the client router on "/", so later refreshes re-ran the redirect.
      router.replace(HOME_BY_ROLE[profile.role]);
      router.refresh();
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-surface p-6" noValidate>
      <label className="block">
        <span className="mb-1.5 block text-start text-sm font-semibold">{t("email")}</span>
        <input
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          inputMode="email"
          required
          className="h-12 w-full rounded-xl border border-border bg-surface-2 px-4 text-left outline-none focus:border-brand-text"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-start text-sm font-semibold">{t("password")}</span>
        <input
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          className="h-12 w-full rounded-xl border border-border bg-surface-2 px-4 text-left outline-none focus:border-brand-text"
        />
      </label>
      {error && (
        <p role="alert" className="text-start text-sm font-semibold text-down">
          {t(`errors.${error}`)}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="h-12 w-full rounded-xl bg-brand font-bold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {loading ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
