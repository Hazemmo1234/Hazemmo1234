"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon } from "@/components/ui/icons";

// Coach screens (UX C2 "Error: retry banner"): a failed page load never leaves a blank screen.
export default function CoachError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("states");
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div role="alert" className="rounded-2xl border border-down/30 bg-down/5">
        <EmptyState
          icon={<AlertIcon className="text-down" />}
          title={t("loadErrorTitle")}
          description={t("loadErrorBody")}
          action={<Button variant="secondary" onClick={reset}>{t("retry")}</Button>}
        />
      </div>
    </main>
  );
}
