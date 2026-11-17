"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";

/** UX C2 "Error: retry banner". */
export function LoadError() {
  const t = useTranslations("coach");
  const router = useRouter();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-down/30 bg-down/10 px-4 py-4 text-sm">
        <AlertIcon size={20} className="shrink-0 text-down" />
        <p className="min-w-0 flex-1 font-semibold">{t("loadError")}</p>
        <Button variant="secondary" onClick={() => router.refresh()}>{t("retry")}</Button>
      </div>
    </main>
  );
}
