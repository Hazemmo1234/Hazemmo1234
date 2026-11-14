/** Avatar initials: first letters of the first two words, letters only (Arabic or Latin). */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
