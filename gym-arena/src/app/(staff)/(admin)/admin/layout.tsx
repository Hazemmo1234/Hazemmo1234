import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentProfile } from "@/lib/auth";

// Middleware already limits /admin/* to admins (AC-2); this is defence in depth.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/today");
  return <AdminShell fullName={profile.full_name}>{children}</AdminShell>;
}
