import Image from "next/image";
import Link from "next/link";
import { EventCard, type EventCardHost } from "@/features/events/components/EventCard";
import { HeroDot, IdentityHero } from "@/features/profiles/components/hero-kit";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { PlatformIcon, gradientOf } from "@/features/profiles/components/profile-kit";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { safeHref } from "@/lib/constants/socials";
import { CARD, DOS_DISPLAY, DOS_TINT, DOS_UI, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { PublicOrganization, PublicOrganizationStudio } from "@/repositories/publicOrganization";
import type { DanceEvent } from "@/types/event";

/** AN ORGANIZATION'S PUBLIC PAGE (18 Sep 2026, the user: "[the eye] should show
 *  organization profile page, and the same should reflect inside the event cards
 *  with photo"). It amends R9 this far and no further: the same identity hero
 *  every profile page wears — ORGANIZATION over the name, the logo on the disc,
 *  the city, the GST tick when it is verified — then About and its links, THE
 *  STUDIOS IT RUNS (the listed ones, each a door to its own page), and THE
 *  EVENTS IT HOSTS (published, each the app's one event card, wearing the
 *  organization's own name and picture). Nobody follows an organization and it
 *  is not in search's People (R9, R11 stand); this is a page you arrive at from
 *  an event, a studio, or the organization's own eye. Readable signed out. */

const monthYear = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));
const shelf: React.CSSProperties = { fontSize: 15, fontWeight: 900, letterSpacing: -0.3, fontFamily: DOS_DISPLAY };

function Group({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={shelf}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      </div>
      {children}
    </div>
  );
}

export function OrganizationPublicPage({ org, studios, events }: { org: PublicOrganization; studios: PublicOrganizationStudio[]; events: DanceEvent[] }) {
  const grad = gradientOf(org.name);
  const tint = DOS_TINT.org;
  const host: EventCardHost = { name: org.name, photo: photoUrl(org.photoPath), href: null };
  const links = org.socials.map((l) => ({ ...l, href: safeHref(l.url) })).filter((l) => l.href);

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        <IdentityHero
          testId="org-hero"
          name={org.name}
          grad={grad}
          tint={tint}
          eyebrow="Organization"
          verified={org.verified}
          share={<ProfileShare path={`/org/${org.id}`} name={org.name} />}
          meta={
            <>
              {org.city ? <span>{org.city}</span> : null}
              {org.city ? <HeroDot /> : null}
              <span>Since {monthYear(org.since)}</span>
              <HeroDot />
              <span>
                {studios.length} studio{studios.length === 1 ? "" : "s"}
              </span>
            </>
          }
          styles={[]}
          styleAria={(s) => s}
          avatar={photoUrl(org.photoPath)}
          avatarAlt={`${org.name} — logo`}
          shots={[]}
        />

        {org.about ? (
          <div style={{ margin: "14px 0 4px" }}>
            <div style={{ ...shelf, marginBottom: 6 }}>About</div>
            <div style={{ fontSize: 13.5, color: SUB, lineHeight: 1.62 }}>{org.about}</div>
          </div>
        ) : null}

        {links.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {links.map((l) => (
              <a key={l.platform} href={l.href!} target="_blank" rel="noopener noreferrer" aria-label={`${org.name} on ${l.platform}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 999, background: CARD, border: `1px solid ${LINE}`, color: INK, fontSize: 11.5, fontWeight: 800, textDecoration: "none" }}>
                <PlatformIcon label={l.platform} size={14} />
                {l.platform}
              </a>
            ))}
          </div>
        ) : null}

        <Group title="Studios" n={studios.length}>
          {studios.length ? (
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "2px 11px" }}>
              {studios.map((s) => {
                const g = gradientOf(s.name);
                const face = photoUrl(s.photoPath);
                return (
                  <Link key={s.id} href={`/studio/${s.id}`} aria-label={`Open ${s.name}`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 4px", color: INK, textDecoration: "none" }}>
                    <span style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 13, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(150deg,${g[0]},${g[1]})`, color: "#fff", fontSize: 15, fontWeight: 900, fontFamily: DOS_DISPLAY }}>
                      {face ? <Image src={face} alt="" width={42} height={42} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : s.name.trim()[0]?.toUpperCase()}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        {s.verifiedAt ? <VerifiedTick size={13} /> : null}
                      </span>
                      <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>{[s.area, s.city].filter(Boolean).join(", ") || "—"}</span>
                    </span>
                    <span style={{ color: MUTED }}>›</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: MUTED, padding: "6px 2px" }}>No studio on Discover yet.</div>
          )}
        </Group>

        <Group title="Events" n={events.length}>
          {events.length ? events.map((e) => <EventCard key={e.id} event={e} href={`/e/${e.shareSlug}`} host={host} />) : <div style={{ fontSize: 11.5, color: MUTED, padding: "6px 2px" }}>Nothing coming up.</div>}
        </Group>
      </div>
    </div>
  );
}
