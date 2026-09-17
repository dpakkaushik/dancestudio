import Image from "next/image";
import Link from "next/link";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";

import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { enquiryTypesFor } from "@/types/enquiry";
import { photoUrl } from "@/lib/media/photo";
import { FollowButton } from "./FollowButton";
import type { PublicTenantProfileWithFaces } from "@/repositories/publicProfile";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { TenantFollower } from "@/types/follow";
import { TYPE } from "./profile-kit";
import { ReportButton } from "@/features/reports/components/ReportButton";
import { ProfileShare } from "./ProfileShare";
import { BusinessEditButton } from "./BusinessEditSheet";
import { TenantFollowersButton } from "./TenantFollowersButton";
import { PLATFORM_TINT, handleOf, isPlatform, safeHref } from "@/lib/constants/socials";
import { PlatformIcon } from "./profile-kit";
import type { HeroShot } from "./HeroRail";
import { HeroDot, HeroPlace, IdentityHero } from "./hero-kit";

/** A business's public page, lifted from prototype S_profiletab with
 *  `publicEntity="studio"|"trainer"` (10565-11060): THE PROFILE, LIT LIKE A
 *  PLAYER — the entity's colour bleeding off the top and dying into the page, the
 *  role over the name, the QR beside it, the place under it, then the figures set
 *  like figures; the styles it teaches; the action row (Follow) and the one white
 *  bar the page is for — Schedule; then the people, one row each, headed with a
 *  count.
 *
 *  THE HERO IS THE ONE EVERY PROFILE PAGE WEARS (15 Sep 2026, the user: "when a
 *  user clicks over a studio or artist he will see the same: scrollable header
 *  and profile image, name — but below that only what is relevant, like running
 *  classes, events"). So the square this page drew for itself is gone:
 *  `IdentityHero` draws the HEADER — a studio's photos of its space, an artist
 *  page's owner's own pictures — and the round DISC with the business's picture,
 *  and what follows is what a visitor came for.
 *
 *  Left out on purpose, tracked in the parity backlog: the Following figure and
 *  the rank (a business follows nobody and holds no rank), the albums/plans tabs
 *  (memberships), Stats (Step 25). */

/** Every business wears a gradient of its own until real photos arrive — the
 *  same six the Discover card draws from (StudioCard GRADS). */
const GRADS: [string, string][] = [
  ["#E84393", "#F39C12"],
  ["#3B82F6", "#7C3AED"],
  ["#922B21", "#00CEC9"],
  ["#8E44AD", "#E84393"],
  ["#7C3AED", "#EC4899"],
  ["#0D9488", "#3498DB"],
];

const hashOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
};

export const gradientOf = (name: string): [string, string] => GRADS[hashOf(name) % GRADS.length];

const initialsOf = (name: string) =>
  name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "D";

/** "1.2k" — the prototype's fmtF (4189) */
export const fmtFollowers = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

const joinedYear = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(iso));



const shelf: React.CSSProperties = TYPE.shelf;

/** Call — a real tel: hand-off to the number on record (10879); drawn only when
 *  there is one. Exported because a PERSON's page calls the same way a
 *  business's does (N8): one Call, not two that drift apart. */
export function CallButton({ phone }: { phone: string }) {
  return (
    <a href={`tel:${phone.replace(/\s+/g, "")}`} aria-label="Call" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 38, borderRadius: 11, fontWeight: 800, fontSize: 11, boxSizing: "border-box", padding: "0 4px", overflow: "hidden", whiteSpace: "nowrap", background: CARD, color: INK, border: `1px solid ${LINE}`, textDecoration: "none" }}>
      <span style={{ flexShrink: 0, lineHeight: 0, color: SUB }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6.6 3.6c.5-.5 1.4-.4 1.8.2l1.5 2.1c.4.5.3 1.2-.1 1.7l-.9 1c-.2.3-.3.8-.1 1.1a11 11 0 0 0 3 3c.3.2.8.2 1.1-.1l1-.9c.5-.4 1.2-.5 1.7-.1l2.1 1.5c.6.4.7 1.3.2 1.8l-1 1c-.6.6-1.4.8-2.2.6a15.6 15.6 0 0 1-6.8-4.1 15.6 15.6 0 0 1-4.1-6.8c-.2-.8 0-1.6.6-2.2z" />
        </svg>
      </span>
      Call
    </a>
  );
}
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };

export function PublicProfile({
  profile,
  header = [],
  path,
  following,
  signedIn,
  canFollow = true,
  isMember,
  canEditPhoto = false,
  canEdit = false,
  ownerId = null,
  followers = null,
  scheduleHref,
  manageHref,
}: {
  profile: PublicTenantProfileWithFaces;
  /** THE HEADER PICTURES (15 Sep 2026): a studio's photos of its space, an
   *  artist page's owner's own — whatever `business_header_photos` let this
   *  viewer see */
  header?: HeaderPhoto[];
  /** this page's own path — what the QR shares */
  path: string;
  following: boolean;
  signedIn: boolean;
  /** false for an organization viewer — one follows nothing (8 Sep 2026) */
  canFollow?: boolean;
  /** the viewer belongs to this business: no Follow, a Manage door instead */
  isMember: boolean;
  /** an owner or trainer — the pair that may change the business's photo. The
   *  control is inside the Edit sheet since 16 Sep 2026, never on the hero */
  canEditPhoto?: boolean;
  /** the owner — the one who edits the pictures, About, Since, the number and
   *  the links (10613) */
  canEdit?: boolean;
  /** the owner's own id when the VIEWER is the owner — the folder in the
   *  private bucket a new header picture goes into; null for everybody else */
  ownerId?: string | null;
  /** the owner's list — null for everybody else, and the figure stays a figure (B6) */
  followers?: TenantFollower[] | null;
  scheduleHref: string;
  manageHref: string;
}) {
  const { tenant } = profile;
  const RG = gradientOf(tenant.name);
  const RC = RG[1];
  const place = [tenant.area, tenant.city].filter(Boolean).join(", ");
  const face = photoUrl(tenant.photoPath);
  const shots: HeroShot[] = header
    .filter((h) => h.url)
    .map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${tenant.name}`, signed: h.signed }));

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        paddingBottom: 40,
        boxSizing: "border-box",
      }}
    >
      <div style={{ padding: "0 16px" }}>
        {/* ── the profile, lit like a player — the one hero every profile page wears ── */}
        <IdentityHero
          testId="public-hero"
          name={tenant.name}
          grad={RG}
          tint={RC}
          eyebrow={tenant.type === "studio" ? "Studio" : "Artist"}
          /* the tick is DanceOS's to give — set when a verification actually clears (DosVerified 10592) */
          verified={Boolean(tenant.verifiedAt)}
          share={<ProfileShare path={path} name={tenant.name} />}
          meta={
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: INK }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                </svg>
                {tenant.foundedYear ? `Since ${tenant.foundedYear}` : `On DanceOS since ${joinedYear(tenant.createdAt)}`}
              </span>
              {place ? (
                <>
                  <HeroDot />
                  <HeroPlace text={place} query={`${tenant.name} ${place}`} />
                </>
              ) : null}
            </>
          }
          /* the styles it teaches, off its published classes (DosStyleRow 1767) */
          styles={profile.styles}
          styleAria={(s) => `${s} — a style this business teaches`}
          avatar={face}
          avatarAlt={tenant.name}
          shots={shots}
        >
          {/* the figures, at the size of figures */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
            {/* a number, never a name (Step 15) — unless you are the business
                whose followers they are, and then it opens (B6) */}
            {followers ? (
              <TenantFollowersButton count={profile.followers} followers={followers} />
            ) : (
              <span aria-label={`${profile.followers} followers`}>
                <span
                  data-testid="followers-count"
                  style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtFollowers(profile.followers)}
                </span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Followers</span>
              </span>
            )}
          </div>
        </IdentityHero>

        {/* ── a business with nothing published yet says so where the styles would be ── */}
        {profile.styles.length === 0 ? <div style={{ fontSize: 12, color: MUTED, padding: "14px 0 6px" }}>No published classes yet.</div> : <div style={{ height: 10 }} />}

        {/* ── the links rail (10760): every public handle the business gave, WhatsApp included — a business's number is a public one ── */}
        {tenant.socials.length ? (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "2px 0 6px", alignItems: "center" }}>
            {tenant.socials.map((l) => {
              /* an address that is not http(s) is not drawn at all (11 Sep 2026) */
              const href = safeHref(l.url);
              if (!href) {
                return null;
              }
              return (
                <a key={l.platform} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "6px 11px", borderRadius: 999, whiteSpace: "nowrap", background: CARD, border: `1px solid ${LINE}`, textDecoration: "none" }}>
                  <span style={{ flexShrink: 0, lineHeight: 0 }}>
                    <PlatformIcon label={l.platform} size={15} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: isPlatform(l.platform) ? PLATFORM_TINT[l.platform] : "#5AC8FA" }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
                </a>
              );
            })}
          </div>
        ) : null}

        {/* ── About as prose, not a boxed card (10826-10838) ── */}
        {tenant.about || canEdit ? (
          <div style={{ margin: "14px 0 4px" }}>
            <div style={{ ...shelf, color: INK, marginBottom: 6 }}>About</div>
            {tenant.about ? <div style={{ fontSize: 13.5, color: SUB, lineHeight: 1.62 }}>{tenant.about}</div> : <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>A sentence in the business&apos;s own words — Edit ›</div>}
          </div>
        ) : null}

        {/* ── the actions (10870-10945): follow, call, ask — one line; then the one place this
            profile goes ── */}
        <div style={{ marginTop: 12 }}>
          {isMember ? (
            <div style={{ display: "grid", gridTemplateColumns: canEdit ? (tenant.phone ? "2fr 1fr 1fr" : "2fr 1fr") : tenant.phone ? "2fr 1fr" : "1fr", gap: 6 }}>
            <Link
              href={manageHref}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 38,
                borderRadius: 11,
                fontWeight: 800,
                fontSize: 11,
                background: CARD,
                color: INK,
                border: `1px solid ${LINE}`,
                textDecoration: "none",
              }}
            >
              You are on this team · Manage ›
            </Link>
            {tenant.phone ? <CallButton phone={tenant.phone} /> : null}
            {canEdit ? <BusinessEditButton tenant={tenant} photos={header} ownerId={ownerId} canEditPhoto={canEditPhoto} /> : null}
            </div>
          ) : null}
          {isMember ? null : (
            /* the things you can do TO a business share one line (10883): follow
               it, and ask it something — Call waits for a number on record */
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${(canFollow ? 1 : 0) + (tenant.phone ? 1 : 0) + (enquiryTypesFor(tenant.type).length ? 1 : 0)}, 1fr)`, gap: 6 }}>
              {canFollow ? (
                <FollowButton
                  tenantId={tenant.id}
                  initialFollowing={following}
                  initialFollowers={profile.followers}
                  accent={RC}
                  signedIn={signedIn}
                />
              ) : null}
              {tenant.phone ? <CallButton phone={tenant.phone} /> : null}
              {enquiryTypesFor(tenant.type).length ? (
                <EnquiryButton tenantId={tenant.id} tenantName={tenant.name} tenantType={tenant.type} signedIn={signedIn} accent={RC} enquiryTypes={tenant.enquiryTypes} />
              ) : null}
            </div>
          )}
          <div style={{ height: 8 }} />
          <Link
            href={scheduleHref}
            aria-label="Schedule"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              height: 42,
              borderRadius: 12,
              fontWeight: 900,
              fontSize: 12.5,
              background: INK,
              color: LILAC,
              border: `1.5px solid ${INK}`,
              textDecoration: "none",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
              <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
            </svg>
            Schedule
          </Link>
        </div>

        {/* ── the people, in one language (11000-11060): a row per person, the
            group headed with a count ── */}
        {profile.faculty.length > 0 ? (
          <div style={{ marginTop: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
              <span style={shelf}>Faculty</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                {profile.faculty.length}
              </span>
            </div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 16, padding: "2px 11px" }}>
              {profile.faculty.map((p) => {
                const g = gradientOf(p.name);
                const pface = photoUrl(p.avatarPath);
                return (
                  <Link key={p.userId} href={`/person/${p.userId}`} aria-label={`Open ${p.name}`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 4px", minWidth: 0, color: INK, textDecoration: "none" }}>
                    <span
                      style={{
                        width: 42,
                        height: 42,
                        flexShrink: 0,
                        borderRadius: 13,
                        overflow: "hidden",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: `linear-gradient(150deg,${g[0]},${g[1]})`,
                        color: "#fff",
                        fontSize: 15,
                        fontWeight: 900,
                        letterSpacing: 0.4,
                        fontFamily: DOS_DISPLAY,
                      }}
                    >
                      {pface ? <Image src={pface} alt="" width={42} height={42} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(p.name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      <span style={{ display: "block", ...micro, color: p.role === "Artist" ? GOLD : MUTED, marginTop: 3 }}>
                        {p.role} · {p.classCount} class{p.classCount === 1 ? "" : "es"}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ flexShrink: 0, color: LINE, fontSize: 15, fontWeight: 600 }}>›</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      {/* the quiet control at the foot of a public page (10 Sep 2026) — not for
          its own members, who have the hub for anything that is wrong */}
      {isMember ? null : (
        <ReportButton subjectKind="business" subjectId={tenant.id} subjectName={tenant.name} signedIn={signedIn} />
      )}
    </div>
  );
}
