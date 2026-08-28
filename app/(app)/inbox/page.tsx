import { redirect } from "next/navigation";
import { InboxScreen, type RequestItem } from "@/features/inbox/components/InboxScreen";
import { DOS_TINT } from "@/lib/design/tokens";
import { sessionDayLabel } from "@/lib/format/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClaimsForTenants, findMyPendingClaims } from "@/repositories/claims";
import { findReceivedEnquiries, findSentEnquiries } from "@/repositories/enquiries";
import { findMyPendingInvites, findPendingInvites } from "@/repositories/invites";
import { findProfileById } from "@/repositories/profiles";
import { findMyTenants } from "@/repositories/tenants";

const stampNowIso = (): string => new Date().toISOString();

/* DOS_LINK_WHAT (prototype 1805): the role in words, and the verb of the ask */
const CLAIM_WORDS = {
  artist: { what: "the artist taking it", verb: "list you as the artist on" },
  assistant: { what: "a class assistant", verb: "add you as an assistant on" },
} as const;
const TEAM_WORDS = { what: "on the team", verb: "add you to the team at" } as const;

/** Inbox tab — the prototype's S_chats: Requests and Enquiries, two desks that
 *  count what is waiting on you. Requests are rows that already exist (class
 *  claims, team invites), read from BOTH ends: what is asked of you, and what
 *  your businesses have asked of others. */
export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [profile, tenants] = await Promise.all([findProfileById(supabase, user.id), findMyTenants(supabase)]);
  const tenantIds = tenants.map((t) => t.id);

  const [claimsIn, invitesIn, claimsOut, invitesOutByTenant, enquiriesIn, enquiriesOut] = await Promise.all([
    findMyPendingClaims(supabase),
    findMyPendingInvites(supabase),
    findAskedClaimsForTenants(supabase, tenantIds),
    Promise.all(tenants.map(async (t) => (await findPendingInvites(supabase, t.id)).map((i) => ({ ...i, tenantName: t.name })))),
    findReceivedEnquiries(supabase, tenantIds),
    findSentEnquiries(supabase, user.id),
  ]);

  const requestsIn: RequestItem[] = [
    ...claimsIn.map((c): RequestItem => ({
      kind: "claim",
      id: c.id,
      dir: "in",
      who: c.tenantName,
      what: CLAIM_WORDS[c.kind].what,
      verb: CLAIM_WORDS[c.kind].verb,
      subjectKind: "CLASS",
      subjectTitle: c.classTitle,
      when: c.startsAt ? sessionDayLabel(c.startsAt) : null,
      href: `/c/${c.classShareSlug}`,
      at: c.createdAt,
      note: c.payPerSessionInr > 0 ? `₹${c.payPerSessionInr.toLocaleString("en-IN")} a session` : null,
      claimId: c.id,
    })),
    ...invitesIn.map((i): RequestItem => ({
      kind: "invite",
      id: i.inviteId,
      dir: "in",
      who: i.tenantName,
      what: TEAM_WORDS.what,
      verb: TEAM_WORDS.verb,
      subjectKind: "STUDIO",
      subjectTitle: i.tenantName,
      when: null,
      href: `/join/${i.code}`,
      at: i.createdAt,
      note: `As ${i.memberRole}`,
      inviteCode: i.code,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const requestsOut: RequestItem[] = [
    ...claimsOut.map((c): RequestItem => ({
      kind: "claim",
      id: c.id,
      dir: "out",
      who: c.personName,
      what: CLAIM_WORDS[c.kind].what,
      verb: CLAIM_WORDS[c.kind].verb,
      subjectKind: "CLASS",
      subjectTitle: c.classTitle,
      when: c.startsAt ? sessionDayLabel(c.startsAt) : null,
      href: `/c/${c.classShareSlug}`,
      at: c.createdAt,
      note: null,
      claimId: c.id,
    })),
    ...invitesOutByTenant.flat().map((i): RequestItem => ({
      kind: "invite",
      id: i.id,
      dir: "out",
      who: i.name,
      what: TEAM_WORDS.what,
      verb: TEAM_WORDS.verb,
      subjectKind: "STUDIO",
      subjectTitle: i.tenantName,
      when: null,
      href: null,
      at: i.createdAt,
      note: `${i.email} · as ${i.memberRole}`,
      inviteId: i.id,
      tenantId: i.tenantId,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const accent = DOS_TINT[profile?.role ?? "dancer"] ?? DOS_TINT.dancer;

  return (
    <InboxScreen
      accent={accent}
      requestsIn={requestsIn}
      requestsOut={requestsOut}
      enquiriesIn={enquiriesIn}
      enquiriesOut={enquiriesOut}
      nowIso={stampNowIso()}
    />
  );
}
