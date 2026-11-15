"use client";

/**
 * D13: photos are compressed in the browser before upload — longest side ≤ 1280 px,
 * WebP ~80 %, or JPEG ~80 % where the browser cannot encode WebP (e.g. iPhone Safari).
 * EXIF rotation is applied so portraits from phones stay upright.
 */
export const MAX_IMAGE_SIDE = 1280;

export async function compressImage(file: File): Promise<{ blob: Blob; type: "image/webp" | "image/jpeg" }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, type: "image/webp" };
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode_failed");
  return { blob: jpeg, type: "image/jpeg" };
}
