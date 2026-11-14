"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type LoginError = "credentials" | "inactive" | "network" | null;

const MESSAGES: Record<Exclude<LoginError, null>, string> = {
  credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  inactive: "الحساب غير مفعّل — تواصل مع الإدارة",
  network: "تعذّر الاتصال، حاول مرة أخرى",
};

export function LoginForm({ initialError }: { initialError: LoginError }) {
  const router = useRouter();
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
        .select("is_active")
        .eq("id", data.user.id)
        .maybeSingle<{ is_active: boolean }>();
      if (!profile?.is_active) {
        await supabase.auth.signOut();
        setError("inactive");
        return;
      }
      router.replace("/");
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
        <span className="mb-1.5 block text-sm font-semibold">البريد الإلكتروني</span>
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
        <span className="mb-1.5 block text-sm font-semibold">كلمة المرور</span>
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
        <p role="alert" className="text-sm font-semibold text-down">
          {MESSAGES[error]}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="h-12 w-full rounded-xl bg-brand font-bold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {loading ? "جارٍ الدخول…" : "دخول"}
      </button>
    </form>
  );
}
