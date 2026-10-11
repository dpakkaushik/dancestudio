/** WHERE TO GO BACK TO AFTER SIGNING IN (11 Oct 2026, B21: "Sign in to book"
 *  returns to the class). ⚠ Rule 9 (auth): a `next` is a REQUEST, and an open
 *  redirect is the classic hole — so only an in-app path is honoured: it starts
 *  with ONE slash (never `//host`, never a backslash trick), carries no scheme,
 *  and is short. Anything else answers null and the caller goes Home. */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length < 2 || s.length > 200) return null;
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || s.includes("://")) return null;
  if (!/^\/[A-Za-z0-9\-._~/?=&%]*$/.test(s)) return null;
  return s;
}
