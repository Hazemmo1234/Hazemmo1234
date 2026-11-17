"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon } from "@/components/ui/icons";

// UX C2/A-screens "Error: retry banner" — any failed admin page load lands here.
export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("states");
  return (
    <div role="alert" className="rounded-2xl border border-down/30 bg-down/5">
      <EmptyState
        icon={<AlertIcon className="text-down" />}
        title={t("loadErrorTitle")}
        description={t("loadErrorBody")}
        action={<Button variant="secondary" onClick={reset}>{t("retry")}</Button>}
      />
    </div>
  );
}
