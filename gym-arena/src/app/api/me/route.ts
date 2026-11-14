import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getCurrentProfile } from "@/lib/auth";

// API_SPECIFICATION: GET /api/me → { id, full_name, role }
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return apiError("UNAUTHENTICATED", "Sign in required");
  return NextResponse.json({ id: profile.id, full_name: profile.full_name, role: profile.role });
}
