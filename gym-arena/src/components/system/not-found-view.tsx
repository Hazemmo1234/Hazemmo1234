import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";

/**
 * The app's own "page not found" (it used to be the framework's white English page, with the
 * punctuation on the wrong side in Arabic). In the screen language; "/" sends a signed-in staff
 * member to their home and anyone else to sign-in (lib/routes.ts).
 */
export async function NotFoundView() {
  const t = await getTranslations("notFound");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <Image src="/brand/logo-tile.png" alt="DFN GYM" width={72} height={72} className="rounded-2xl" priority />
      <p className="display tabular text-7xl leading-none text-brand-text">{404}</p>
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <p className="max-w-sm text-sm text-text-muted">{t("body")}</p>
      {/* a plain link: "/" is resolved by the middleware, not by the client router */}
      <a href="/" className={buttonClasses("primary", "lg", "mt-2")}>{t("home")}</a>
    </main>
  );
}
