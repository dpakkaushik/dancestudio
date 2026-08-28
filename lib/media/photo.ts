/** Photos (parity slice 2). One public bucket, three folders, and the rules the
 *  browser needs to know before it uploads anything.
 *
 *  The bucket is public for READS, so a URL is a plain string built here — no
 *  round trip, no expiry, and a public page does not depend on a signed URL per
 *  image. Writes are path-scoped by storage policy: `avatars/{user}`,
 *  `tenants/{tenant}`, `crews/{crew}`. */

export const MEDIA_BUCKET = "media";

/** what the bucket itself accepts (mirrored from the migration, so the browser
 *  can refuse a file before spending somebody's data on the upload) */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_WORDS = "5 MB";

export type PhotoOwner = { kind: "avatar"; id: string } | { kind: "tenant"; id: string } | { kind: "crew"; id: string };

const FOLDER: Record<PhotoOwner["kind"], string> = { avatar: "avatars", tenant: "tenants", crew: "crews" };

/** The path a new photo takes. The folder is the whole of the authority check —
 *  the storage policy reads it, and so does the RPC that records it — so it is
 *  built in one place. The random suffix means a replacement is a NEW object: a
 *  browser that cached the old one is not left showing it. */
export const photoPath = (owner: PhotoOwner, file: { name: string; type: string }): string => {
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `${FOLDER[owner.kind]}/${owner.id}/${rand}.${ext}`;
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
