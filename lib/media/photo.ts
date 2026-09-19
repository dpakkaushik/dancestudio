import type { PersonKind } from "@/types/profile";

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

/** HOW MANY HEADER PICTURES A PROFILE MAY HOLD — BY KIND (19 Sep 2026, the user:
 *  "Poster on all profiles should be swipeable with limits — Organization &
 *  Studio 10, Artist and Crews 5, User 1"). An organization holds ten, an
 *  artist FIVE (it was ten until today — nothing stored is deleted, the ceiling
 *  is what the door refuses beyond), a plain user one, a crew five. A studio's
 *  ten is its verification photos (`PROOF_MAX`). The database refuses past each
 *  (`add_my_header_photo`, `add_crew_header_photo`); said here so the screens
 *  stop offering the tile at the same count. */
export const HEADER_MAX_ORG = 10;
export const HEADER_MAX_ARTIST = 5;
export const HEADER_MAX_USER = 1;
export const HEADER_MAX_CREW = 5;
export const headerMaxFor = (kind: PersonKind): number => (kind === "org" ? HEADER_MAX_ORG : kind === "artist" ? HEADER_MAX_ARTIST : HEADER_MAX_USER);

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

/* ⚠ THESE ARE STORAGE FOLDERS, NOT TABLE NAMES, AND THEY ARE NEVER RENAMED (Rule
   16): objects live under them, the storage policies test them by name, and the
   RPCs that record a path check the same prefix. The 16 Sep 2026 rename sweep
   turned `tenants` into `businesses` HERE while the migration deliberately kept
   the bucket's `tenants/` — so every studio disc upload was refused by the
   storage policy ("new row violates row-level security policy", a 400) from
   16 to 19 Sep 2026, and nothing typed could see it. Found by shoot-hero.js.
   A CREW's header pictures (19 Sep 2026) share the crew's own `crews/{id}/`
   folder with its disc: the leader is the one writer of both. */
const FOLDER: Record<Exclude<PhotoOwner["kind"], "studioHeader">, string> = { avatar: "avatars", tenant: "tenants", crew: "crews", gallery: "gallery" };

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

/** AN MP3 FOR A ROUTINE (19 Sep 2026, the user: "Music — link or MP3"). Its own
 *  folder in the same public bucket, `routines/{person}/…`, with the same rule
 *  as every other folder here: the storage policy tests the prefix and
 *  `save_routine` re-checks it before it records the path. The bucket takes
 *  audio and 15 MB since `20260919160000`. ⚠ `routines` is a STORAGE FOLDER
 *  and is never renamed (Rule 16). */
export const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a"] as const;
export const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
export const AUDIO_MAX_WORDS = "15 MB";
export const routineAudioPath = (userId: string, file: { name: string; type: string }): string =>
  `routines/${userId}/${randomName()}.${file.type === "audio/mp4" || file.type === "audio/x-m4a" ? "m4a" : "mp3"}`;
export const whyNotATrack = (file: { type: string; size: number }): string | null => {
  if (!(AUDIO_TYPES as readonly string[]).includes(file.type)) {
    return "That has to be an MP3 or M4A file.";
  }
  if (file.size > AUDIO_MAX_BYTES) {
    return `That track is over ${AUDIO_MAX_WORDS} — pick a smaller file, or paste a link instead.`;
  }
  return null;
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
