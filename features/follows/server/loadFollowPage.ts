import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFollowersAction, loadFollowingAction, type FollowListResult } from "@/features/profiles/server-actions/followLists";
import { crewTeamRows, studioTeamRows } from "@/features/profiles/teamFollowing";
import { findCrewById, findCrewMembers } from "@/repositories/crews";
import { findMyFollowedCrews, findMyFollowedPeople, findMyFollowing } from "@/repositories/follows";
import { findArtistIds } from "@/repositories/profiles";
import { findPublicBusiness, findPublicStudioTeam } from "@/repositories/publicProfile";

/** ⚠⚠ A FOLLOW LIST IS A PAGE OF ITS OWN (12 Oct 2026, the user: "follower
 *  following list whenever opened from anywhere should open a seprate page do
 *  it excatly how insta does it but give filters").
 *
 *  Both lists are read in ONE server pass, so switching between Followers and
 *  Following on the page is instant — Instagram's two tabs. Every read is one
 *  the sheets already made (`loadFollowersAction`, `loadFollowingAction`, and a
 *  business's and a crew's TEAM for its Following, 2 Oct 2026), so nothing a
 *  reader may see changes: this is the same rows, given a screen. What is new is
 *  the viewer's own follow state on each row, which is the viewer's OWN rows
 *  (`follower_id = me`), for the Follow / Following button. */

export type FollowSubjectKind = "person" | "business" | "crew";
export type FollowEntryKind = "user" | "artist" | "studio" | "crew";

export interface FollowEntry {
  key: string;
  name: string;
  sub: string;
  href: string;
  photoPath: string | null;
  kind: FollowEntryKind;
  /** what the Follow button would follow — null for yourself */
  target: { type: "person" | "business" | "crew"; id: string } | null;
  /** the VIEWER follows it today */
  following: boolean;
}

export interface FollowPageData {
  subject: { kind: FollowSubjectKind; id: string; name: string; photoPath: string | null; isMe: boolean };
  followers: FollowEntry[];
  following: FollowEntry[];
  /** a list the viewer may not read is said, never drawn as nobody */
  followersError: string | null;
  followingError: string | null;
  /** a business's and a crew's Following is its TEAM — the tab says so */
  followingIsTeam: boolean;
}

type Raw = FollowListResult["rows"][number];

/** what a row points at, read off its own href — the one shape every list shares */
function targetOf(href: string): { type: "person" | "business" | "crew"; id: string; kind: FollowEntryKind } | null {
  const m = /^\/(person|studio|artist|crew)\/([0-9a-f-]{36})/.exec(href);
  if (!m) return null;
  if (m[1] === "person") return { type: "person", id: m[2], kind: "user" };
  if (m[1] === "crew") return { type: "crew", id: m[2], kind: "crew" };
  return { type: "business", id: m[2], kind: m[1] === "studio" ? "studio" : "artist" };
}

export async function loadFollowPage(
  supabase: SupabaseClient,
  me: string,
  kind: FollowSubjectKind,
  id: string
): Promise<FollowPageData | null> {
  /* WHOSE LIST — the page's own heading */
  let subject: FollowPageData["subject"] | null = null;
  if (kind === "person") {
    const { data } = await supabase.from("profiles").select("full_name, profile_photo_path").eq("id", id).is("deleted_at", null).maybeSingle();
    if (data) subject = { kind, id, name: (data as { full_name: string }).full_name, photoPath: (data as { profile_photo_path: string | null }).profile_photo_path, isMe: id === me };
  } else if (kind === "business") {
    const b = await findPublicBusiness(supabase, id).catch(() => null);
    if (b) subject = { kind, id, name: b.name, photoPath: b.photoPath ?? null, isMe: false };
  } else {
    const c = await findCrewById(supabase, id).catch(() => null);
    if (c) subject = { kind, id, name: c.name, photoPath: c.photo ?? null, isMe: false };
  }
  if (!subject) return null;

  const [followersRes, followingRes, myPeople, myBusinesses, myCrews] = await Promise.all([
    loadFollowersAction({ kind, id }),
    kind === "person"
      ? loadFollowingAction(id === me ? undefined : { userId: id })
      : kind === "business"
        ? findPublicStudioTeam(supabase, id).then((t) => ({ error: null, rows: studioTeamRows(t) }) as FollowListResult)
        : findCrewMembers(supabase, id).then(
            (m) => ({ error: null, rows: crewTeamRows(m) }) as FollowListResult,
            () => ({ error: "That list could not be read just now.", rows: [] }) as FollowListResult
          ),
    findMyFollowedPeople(supabase).catch(() => []),
    findMyFollowing(supabase).catch(() => []),
    findMyFollowedCrews(supabase).catch(() => []),
  ]);

  const followedPeople = new Set(myPeople.map((p) => p.userId));
  const followedBusinesses = new Set(myBusinesses.map((b) => b.businessId));
  const followedCrews = new Set(myCrews.map((c) => c.crewId));

  /* an ARTIST is a person with a live plan — one read for both lists */
  const personIds = [...followersRes.rows, ...followingRes.rows].map((r) => targetOf(r.href)).filter((t) => t?.type === "person").map((t) => t!.id);
  const artists = await findArtistIds(supabase, personIds).catch(() => new Set<string>());

  const entry = (r: Raw): FollowEntry => {
    const t = targetOf(r.href);
    const kindOfRow: FollowEntryKind = t ? (t.type === "person" ? (artists.has(t.id) ? "artist" : "user") : t.kind) : "user";
    const following = !t ? false : t.type === "person" ? followedPeople.has(t.id) : t.type === "business" ? followedBusinesses.has(t.id) : followedCrews.has(t.id);
    /* a person's row says what they are, then where — the same words the
       Following rows already carry for a studio and a crew */
    const sub =
      t?.type === "person" && !r.id.startsWith("t-")
        ? [kindOfRow === "artist" ? "Artist" : "User", r.sub].filter(Boolean).join(" · ")
        : (r.sub ?? "");
    return {
      key: r.id,
      name: r.name,
      sub,
      href: r.href,
      photoPath: r.photoPath,
      kind: kindOfRow,
      target: t && !(t.type === "person" && t.id === me) ? { type: t.type, id: t.id } : null,
      following,
    };
  };

  return {
    subject,
    followers: followersRes.rows.map(entry),
    following: followingRes.rows.map(entry),
    followersError: followersRes.error,
    followingError: followingRes.error,
    followingIsTeam: kind !== "person",
  };
}
