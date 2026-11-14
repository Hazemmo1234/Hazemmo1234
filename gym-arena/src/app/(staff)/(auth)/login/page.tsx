import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const [t, c] = await Promise.all([getTranslations("auth"), getTranslations("common")]);
  return { title: `${t("pageTitle")} — ${c("appName")}` };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [t, c] = await Promise.all([getTranslations("auth"), getTranslations("common")]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <Image src="/brand/logo-tile.png" alt="DFN GYM" width={96} height={96} priority className="rounded-2xl" />
          <h1 className="display text-3xl uppercase tracking-wide">{c("appName")}</h1>
          <p className="text-sm text-text-muted">{t("staffSignIn")}</p>
        </div>
        <LoginForm initialError={error === "inactive" ? "inactive" : null} />
        <div className="mt-6 flex justify-center">
          <LanguageSwitcher />
        </div>
      </div>
    </main>
  );
}
