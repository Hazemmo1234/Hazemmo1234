import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata = { title: "تسجيل الدخول — DFN Arena" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <Image src="/brand/logo-tile.png" alt="DFN GYM" width={96} height={96} priority className="rounded-2xl" />
          <h1 className="display text-3xl tracking-wide">DFN ARENA</h1>
          <p className="text-sm text-text-muted">دخول فريق العمل</p>
        </div>
        <LoginForm initialError={error === "inactive" ? "inactive" : null} />
      </div>
    </main>
  );
}
