/** the street on one line, the city / state / PIN on the next — off a geocoder's
 *  comma-joined address, with its trailing country dropped. A short address
 *  (just "area, city") stays on one line.
 *
 *  Shared by the Rooms desk's studio section and the class page's AT THE STUDIO
 *  (4 Oct 2026), so a studio's address reads the same way on both. */
export function splitAddress(address: string): { street: string; locality: string | null } {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^india$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length <= 2) return { street: parts.join(", ") || address, locality: null };
  return { street: parts.slice(0, -2).join(", "), locality: parts.slice(-2).join(", ") };
}
