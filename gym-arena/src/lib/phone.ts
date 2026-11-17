/**
 * Egyptian mobile numbers (BR-P3, D12). Staff may type them in any common form;
 * they are stored E.164-normalized as +201XXXXXXXXX (the database checks the format).
 * Accepted: 01XXXXXXXXX · 201XXXXXXXXX · +201XXXXXXXXX · 00201XXXXXXXXX, with spaces,
 * dashes, dots or brackets, and with Arabic-Indic or Persian digits.
 */
const ARABIC_INDIC = /[\u0660-\u0669]/g; // Arabic-Indic digits zero to nine
const PERSIAN = /[\u06F0-\u06F9]/g; // Persian digits zero to nine
const VALID = /^\+201[0125]\d{8}$/;

export function normalizeEgyptianMobile(input: string): string | null {
  let s = input
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-.()‎‏]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  else if (s.startsWith("20")) s = `+${s}`;
  else if (s.startsWith("0")) s = `+2${s}`;
  return VALID.test(s) ? s : null;
}

/** Display form: 010 1234 5678 (local, Western digits, BR-L5). */
export function formatEgyptianMobile(e164: string): string {
  const local = e164.replace(/^\+20/, "0");
  return local.length === 11 ? `${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}` : e164;
}
