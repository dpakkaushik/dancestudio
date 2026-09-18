import { PLATFORM_TINT, handleOf, isPlatform, safeHref } from "@/lib/constants/socials";
import { CARD, INK, LINE, MUTED, SUB } from "@/lib/design/tokens";
import type { SocialLink } from "@/types/profile";
import { PlatformIcon, TYPE } from "./profile-kit";

/** THE BIO, UNDER FOLLOW AND ABOVE THE BUTTONS (19 Sep 2026, the user: "Bio
 *  above all buttons below follow / Following"). One block for every public
 *  page — an organization's, a studio's, an artist's, a user's — so the order
 *  cannot drift between them: About as prose (10826-10838, never a boxed card),
 *  then the links rail (10760), each handle in its platform's own colour.
 *
 *  A link that is not http(s) is not drawn at all (11 Sep 2026). A PERSON's
 *  WhatsApp is left off — "a number is not a public handle" (10778) — while a
 *  business's is a public one; the caller says which. Nothing is drawn when
 *  there is nothing to say, so a page never carries an empty heading. */
export function BioBlock({
  about,
  links,
  hideWhatsApp = false,
  editHint = null,
  accent = "#5AC8FA",
}: {
  about: string | null;
  links: SocialLink[];
  hideWhatsApp?: boolean;
  /** what the OWNER reads where their own About would be — "A sentence in your
   *  own words — Edit ›"; null for everybody else, and the block stays quiet */
  editHint?: string | null;
  /** the colour a custom label's handle takes; known platforms wear their own */
  accent?: string;
}) {
  const shown = links
    .map((l) => ({ ...l, href: safeHref(l.url) }))
    .filter((l): l is SocialLink & { href: string } => Boolean(l.href) && !(hideWhatsApp && l.platform === "WhatsApp"));
  if (!about && !editHint && shown.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      {about || editHint ? (
        <div>
          <div style={{ ...TYPE.shelf, color: INK, marginBottom: 6 }}>About</div>
          {about ? <div style={{ fontSize: 13.5, color: SUB, lineHeight: 1.62 }}>{about}</div> : <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>{editHint}</div>}
        </div>
      ) : null}
      {shown.length ? (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: about || editHint ? "10px 0 2px" : "0 0 2px", alignItems: "center" }}>
          {shown.map((l) => (
            <a
              key={l.platform}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "6px 11px", borderRadius: 999, whiteSpace: "nowrap", background: CARD, border: `1px solid ${LINE}`, textDecoration: "none" }}
            >
              <span style={{ flexShrink: 0, lineHeight: 0 }}>
                <PlatformIcon label={l.platform} size={15} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: isPlatform(l.platform) ? PLATFORM_TINT[l.platform] : accent }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
