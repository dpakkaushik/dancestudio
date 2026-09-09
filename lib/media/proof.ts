/** R16 (9 Sep 2026): the photos an organization shows DanceOS to be verified.
 *
 *  A SECOND bucket, and a private one. The `media` bucket is public for reads
 *  because everything in it is already on a page the public can see; these are
 *  a business's premises handed to a stranger who has to judge them, so nothing
 *  here is served by a guessable URL. Every read is a short-lived signed URL,
 *  and the storage policy only signs one for the organization itself or a
 *  platform admin.
 *
 *  Writes are path-scoped exactly as the avatar folder is: `proof/{org}/…`, the
 *  folder IS the authority check, and `add_org_proof_photo` checks it again. */

export const PROOF_BUCKET = "org-proof";

/** The count DanceOS asks for. Said here once; the database says it too, and
 *  the onboarding button counts against these two numbers. */
export const PROOF_MIN = 5;
export const PROOF_MAX = 10;

/** How long a signed read lives. Long enough to render a page and scroll it,
 *  short enough that a copied URL is worthless by the time it is pasted. */
export const PROOF_URL_SECONDS = 600;

/** The path a new proof photo takes. The random name means a replacement is a
 *  new object, so a browser holding the old one is not left showing it. */
export const proofPath = (orgId: string, file: { type: string }): string => {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `proof/${orgId}/${rand}.${ext}`;
};

export interface ProofPhoto {
  id: string;
  path: string;
  /** a signed URL, or null when one could not be minted (an expired session,
   *  a file removed from the bucket behind the row's back) */
  url: string | null;
}

/** What an organization still has to do about its photos, in a sentence — or
 *  null when it has enough. The same arithmetic in the button, the timeline and
 *  the admin's queue. */
export const proofShortfall = (count: number): string | null => {
  if (count >= PROOF_MIN) return null;
  const short = PROOF_MIN - count;
  return count === 0
    ? `Add ${PROOF_MIN} photos of your space`
    : `${short} more photo${short === 1 ? "" : "s"} — DanceOS needs at least ${PROOF_MIN}`;
};
