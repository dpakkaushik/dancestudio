import Image from "next/image";
import Link from "next/link";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, GOLD, INK, LILAC, LINE, MUTED, SUB } from "@/lib/design/tokens";
import type { PublicTenantProfile } from "@/types/publicProfile";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { enquiryTypesFor } from "@/types/enquiry";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { photoUrl } from "@/lib/media/photo";
import { FollowButton } from "./FollowButton";
import { ProfileShare } from "./ProfileShare";

/** A business's public page, lifted from prototype S_profiletab with
 *  `publicEntity="studio"|"trainer"` (10565-11060): THE PROFILE, LIT LIKE A
 *  PLAYER — the entity's colour bleeding off the top and dying into the page, the
 *  picture as a sharp square with the sleeve's thrown shadow, the role over the
 *  name, the QR beside it, the place under it, then the figures set like
 *  figures; the styles it teaches; the action row (Follow) and the one white bar
 *  the page is for — Schedule; then the people, one row each, headed with a
 *  count.
 *
 *  Left out on purpose, tracked in the parity backlog: the Following figure and
 *  the rank (a business follows nobody and holds no rank), About (no bio field
 *  yet — the prototype's default sentence would be one studio's words on every
 *  studio's page), Call and Enquiry (no numbers, no enquiry desk yet), Photos and
 *  the albums/plans tabs (media, memberships), Stats (Step 25). */

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

const styleInitials = (label: string) => {
  const w = label.replace(/[^A-Za-z0-9 -]/g, " ").trim().split(/[\s-]+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase() || "•";
};

const toolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;

/** The style coin (prototype DosStyleCoin 3400): the style's two letters on its
 *  own colour, the size the row asks for. */
function StyleCoin({ label, size }: { label: string; size: number }) {
  const c = dosStyleColor(label);
  return (
    <span
      title={label}
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        flexShrink: 0,
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 900,
        fontSize: Math.max(9, Math.round(size * 0.34)),
        letterSpacing: 0.3,
        fontFamily: DOS_DISPLAY,
        lineHeight: 1,
        background: toolPaint(c),
        boxShadow: "0 1px 4px rgba(0,0,0,.35)",
      }}
    >
      {styleInitials(label)}
    </span>
  );
}

const shelf: React.CSSProperties = { fontSize: 15, fontWeight: 900, letterSpacing: -0.3, fontFamily: DOS_DISPLAY };
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };

export function PublicProfile({
  profile,
  path,
  following,
  signedIn,
  isMember,
  canEditPhoto = false,
  scheduleHref,
  manageHref,
}: {
  profile: PublicTenantProfile;
  /** this page's own path — what the QR shares */
  path: string;
  following: boolean;
  signedIn: boolean;
  /** the viewer belongs to this business: no Follow, a Manage door instead */
  isMember: boolean;
  /** an owner or trainer — the pair that may change the business's photo */
  canEditPhoto?: boolean;
  scheduleHref: string;
  manageHref: string;
}) {
  const { tenant } = profile;
  const RG = gradientOf(tenant.name);
  const RC = RG[1];
  const SQ = 206;
  const sqShadow = "0 0 52px 20px rgba(0,0,0,.30), 0 26px 60px -4px rgba(0,0,0,.55), 0 8px 18px rgba(0,0,0,.4)";
  const kind = tenant.type === "studio" ? "STUDIO" : "ARTIST";
  const place = [tenant.area, tenant.city].filter(Boolean).join(", ");
  const mapsHref = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tenant.name} ${place}`)}` : null;
  const face = photoUrl(tenant.photoPath);

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
        {/* ── the profile, lit like a player ── */}
        <div
          style={{
            margin: "0 -16px",
            position: "relative",
            overflow: "hidden",
            background: `linear-gradient(180deg, ${RC}b8 0%, ${RC}55 46%, ${RC}18 74%, ${LILAC} 100%)`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 14px" }}>
            <div
              aria-label={tenant.name}
              style={{
                width: SQ,
                height: SQ,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                background: `linear-gradient(135deg,${RG[0]},${RG[1]})`,
                color: "#fff",
                fontSize: 64,
                fontWeight: 900,
                letterSpacing: 1,
                fontFamily: DOS_DISPLAY,
                boxShadow: sqShadow,
              }}
            >
              {face ? <Image src={face} alt="" width={SQ} height={SQ} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(tenant.name)}
            </div>
          </div>

          {/* who, in the order you read a business: what it is, its name, where it is, then the figures */}
          <div style={{ padding: "10px 16px 2px" }}>
            <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>{kind}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  fontFamily: DOS_DISPLAY,
                  letterSpacing: -0.8,
                  lineHeight: 1.08,
                  color: INK,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {tenant.name}
              </span>
              <ProfileShare path={path} name={tenant.name} />
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 7, fontSize: 15, fontWeight: 700, color: SUB }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: INK }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                </svg>
                On DanceOS since {joinedYear(tenant.createdAt)}
              </span>
              {place ? (
                <>
                  <span style={{ color: LINE }}>·</span>
                  {mapsHref ? (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open this address in Maps"
                      style={{ fontWeight: 800, color: INK, textDecoration: "underline", textDecorationColor: LINE, textUnderlineOffset: 3 }}
                    >
                      {place}
                    </a>
                  ) : (
                    <span style={{ fontWeight: 800, color: INK }}>{place}</span>
                  )}
                </>
              ) : null}
            </div>

            {/* the figures, at the size of figures */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
              <span aria-label={`${profile.followers} followers`}>
                <span
                  data-testid="followers-count"
                  style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtFollowers(profile.followers)}
                </span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Followers</span>
              </span>
              <span aria-label={`${profile.upcomingSessions} upcoming sessions`}>
                <span style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>
                  {profile.upcomingSessions}
                </span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Upcoming</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── the facts: the styles it teaches (DosStyleRow 1767) ── */}
        {profile.styles.length > 0 ? (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "14px 0 6px", alignItems: "center" }}>
            {profile.styles.map((s) => (
              <StyleCoin key={s} label={s} size={34} />
            ))}
            <span style={{ fontSize: 11.5, fontWeight: 700, color: SUB, marginLeft: 4, whiteSpace: "nowrap" }}>
              {profile.styles.join(" · ")}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: MUTED, padding: "14px 0 6px" }}>No published classes yet.</div>
        )}

        {/* ── the actions (10870-10945): follow them; then the one place this
            profile goes ── */}
        <div style={{ marginTop: 12 }}>
          {isMember ? (
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
          ) : null}
          {canEditPhoto ? (
            <div style={{ marginTop: 8 }}>
              <PhotoPicker owner={{ kind: "tenant", id: tenant.id }} hasPhoto={Boolean(tenant.photoPath)} label="Change the photo" />
            </div>
          ) : (
            /* the things you can do TO a business share one line (10883): follow
               it, and ask it something — Call waits for a number on record */
            <div style={{ display: "grid", gridTemplateColumns: enquiryTypesFor(tenant.type).length ? "1fr 1fr" : "1fr", gap: 6 }}>
              <FollowButton
                tenantId={tenant.id}
                initialFollowing={following}
                initialFollowers={profile.followers}
                accent={RC}
                signedIn={signedIn}
              />
              {enquiryTypesFor(tenant.type).length ? (
                <EnquiryButton tenantId={tenant.id} tenantName={tenant.name} tenantType={tenant.type} signedIn={signedIn} accent={RC} />
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
                return (
                  <div key={p.userId} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 4px", minWidth: 0 }}>
                    <span
                      style={{
                        width: 42,
                        height: 42,
                        flexShrink: 0,
                        borderRadius: 13,
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
                      {initialsOf(p.name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      <span style={{ display: "block", ...micro, color: p.role === "Artist" ? GOLD : MUTED, marginTop: 3 }}>
                        {p.role} · {p.classCount} class{p.classCount === 1 ? "" : "es"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
