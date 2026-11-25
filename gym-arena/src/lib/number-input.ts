/**
 * Numbers typed on any phone keyboard: Arabic-Indic and Persian digits and the Arabic
 * decimal mark become Western digits and "." (BR-L5: Western digits everywhere).
 */
export function normalizeNumberInput(raw: string): string {
  return raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u066B,]/g, ".")
    .replace(/\s/g, "");
}
