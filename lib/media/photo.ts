/** Photos (parity slice 2). One public bucket, four folders, and the rules the
 *  browser needs to know before it uploads anything.
 *
 *  The bucket is public for READS, so a URL is a plain string built here — no
 *  round trip, no expiry, and a public page does not depend on a signed URL per
 *  image. Writes are path-scoped by storage policy: `avatars/{user}`,
 *  `tenants/{tenant}`, `crews/{crew}`, and since 14 Sep 2026 `gallery/{user}` —
 *  a person's HEADER PICTURES, the ones that swipe across the top of their page
 *  above the round profile disc (15 Sep 2026). */

export const MEDIA_BUCKET = "media";

/** HOW MANY HEADER PICTURES A PERSON MAY HOLD (15 Sep 2026, the user): an
 *  artist ten — the prototype's own ceiling for a Photos rail (10979) — and a
 *  plain user ONE ("use plain user just a profile pic and one header"). The
 *  database refuses past either; said here so the screens stop offering the
 *  tile at the same count. `GALLERY_MAX` is the artist's number under the
 *  name the gallery slice gave it. */
export const HEADER_MAX_ARTIST = 10;
export const HEADER_MAX_USER = 1;
export const GALLERY_MAX = HEADER_MAX_ARTIST;
export const headerMaxFor = (isArtist: boolean): number => (isArtist ? HEADER_MAX_ARTIST : HEADER_MAX_USER);

/** what the bucket itself accepts (mirrored from the migration, so the browser
 *  can refuse a file before spending somebody's data on the upload) */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_WORDS = "5 MB";

export type PhotoOwner =
  | { kind: "avatar"; id: string }
  | { kind: "tenant"; id: string }
  | { kind: "crew"; id: string }
  /** one more header picture for a person — `id` is the person */
  | { kind: "gallery"; id: string }
  /** one more header picture for a STUDIO (15 Sep 2026) — `id` is the studio,
   *  and the file goes into its OWNER's folder in the PRIVATE proof bucket,
   *  because a studio's header pictures ARE the photos it showed DanceOS to be
   *  verified; `orgId` is that owner */
  | { kind: "studioHeader"; id: string; orgId: string };

const FOLDER: Record<Exclude<PhotoOwner["kind"], "studioHeader">, string> = { avatar: "avatars", tenant: "businesses", crew: "crews", gallery: "gallery" };

const extOf = (file: { type: string }): string => (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
const randomName = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`);

/** The path a new photo takes. The folder is the whole of the authority check —
 *  the storage policy reads it, and so does the RPC that records it — so it is
 *  built in one place. The random suffix means a replacement is a NEW object: a
 *  browser that cached the old one is not left showing it. A studio's header
 *  picture is the one that does not go in `media` at all — see `proofPath`. */
export const photoPath = (owner: PhotoOwner, file: { name: string; type: string }): string => {
  if (owner.kind === "studioHeader") {
    return `proof/${owner.orgId}/${randomName()}.${extOf(file)}`;
  }
  return `${FOLDER[owner.kind]}/${owner.id}/${randomName()}.${extOf(file)}`;
};

/** Where a stored path is served from. Null in, null out — the caller draws
 *  initials instead, which is what every one of these screens did before. */
export const photoUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
};

/** Why a file was refused, in words a person can act on — or null when it is fine. */
export const whyNotAPhoto = (file: { type: string; size: number }): string | null => {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return "That has to be a JPEG, PNG or WebP image.";
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return `That image is over ${PHOTO_MAX_WORDS} — pick a smaller one.`;
  }
  return null;
};
