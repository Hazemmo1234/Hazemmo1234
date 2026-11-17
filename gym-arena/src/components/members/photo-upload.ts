"use client";

import { compressImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

/**
 * Photo replacement, in the approved order (decision 4):
 * 1. compress and upload the NEW file to a one-time signed URL in the member's folder;
 * 2. PATCH the member — the server checks the file and updates the database;
 * 3. the server then deletes the previous photo and any orphaned uploads.
 * If 1 or 2 fails, the member keeps the photo they already had.
 */
export type PhotoResult = { ok: true } | { ok: false; reason: string };

async function json(res: Response) {
  return (await res.json().catch(() => null)) as { error?: { reason?: string } } | null;
}

export async function replaceMemberPhoto(memberId: string, file: File): Promise<PhotoResult> {
  let image: { blob: Blob; type: "image/webp" | "image/jpeg" };
  try {
    image = await compressImage(file);
  } catch {
    return { ok: false, reason: "photo_unreadable" };
  }
  const signed = await fetch("/api/uploads/avatar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ member_id: memberId, content_type: image.type }),
  });
  if (!signed.ok) return { ok: false, reason: (await json(signed))?.error?.reason ?? "photo_failed" };
  const { path, token } = (await signed.json()) as { path: string; token: string };

  const { error } = await createClient().storage.from("avatars").uploadToSignedUrl(path, token, image.blob, { contentType: image.type });
  if (error) return { ok: false, reason: "photo_failed" };

  const attach = await fetch(`/api/members/${memberId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ photo_path: path }),
  });
  if (!attach.ok) return { ok: false, reason: (await json(attach))?.error?.reason ?? "photo_failed" };
  return { ok: true };
}

export async function removeMemberPhoto(memberId: string): Promise<PhotoResult> {
  const res = await fetch(`/api/members/${memberId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ photo_path: null }),
  });
  return res.ok ? { ok: true } : { ok: false, reason: (await json(res))?.error?.reason ?? "photo_failed" };
}
