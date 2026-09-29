"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { DOS_UI, INK, MUTED, RED, SUB } from "@/lib/design/tokens";
import type { ArtistPlan } from "@/repositories/plans";
import type { Profile, ProfileRole } from "@/types/profile";
import type { Business } from "@/types/tenant";

/** THE SETTINGS SHEET — prototype S_profiletab 11402-11440, opened by the top
 *  bar's gear (19263: "if you are on the Profile tab, open settings now; else go
 *  there and open it"). YOUR PLAN with the Artist tools switch (8850-8870:
 *  "Dancer is who you are; Artist is a TOOLSET on that same profile — never a
 *  second identity") and its PRO badge, then the rows.
 *
 *  TILES, NOT ROWS (19 Sep 2026, the user: "remove all extra information from
 *  all setting options and give as buttons with headings and icons. also merge
 *  certain options which have similar functionality … can remove notifications
 *  and keep it inside the notifications section only"). Every option is one
 *  tile — an icon and its heading, nothing under it — in a two-column grid
 *  under a small group head: YOUR PLAN · MONEY · BUSINESS · ACCOUNT. What was
 *  merged: Help & support and Message DanceOS were two doors to one
 *  conversation and are one tile (`/support`); Privacy & data opens the privacy
 *  policy (`/legal/privacy`), which is the one privacy text that exists;
 *  Notifications is GONE from here — the bell's own screen carries "What
 *  reaches you" (S_notif 13800), and it was the same switches twice. Language
 *  stays a tile and says the one true thing when pressed.
 *
 *  ⚠ NO PLAN, NO SUBSCRIPTION, NO ARTIST TOOLS SWITCH HERE SINCE 26 Sep 2026
 *  (the user: "subscriptions also become an option on home tab for all profiles
 *  and is removed from settings for all … subscribe to become an artist should
 *  not be a separate tab in settings like artist tools"). YOUR PLAN is gone
 *  whole — the prototype's Artist tools switch (8855) with it — and the one
 *  door to `/subscription` is the Subscription tile on Home; a studio's and an
 *  organization's mandate is the Subscription tile on its own home. The GST
 *  number tile left MONEY the same day: it is an ORGANIZATION's, under THIS
 *  ORGANIZATION, because the organization login is retired and the number is
 *  the business row's. Payments (S_payments), Invoices (S_invoices) and Refunds
 *  (S_refunds) are pages; Enquiry types is the prototype's own sheet (9000-9030)
 *  saved onto the business. */

const grid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 };
const tile: CSSProperties = { background: "var(--card)", borderRadius: 16, padding: "13px 12px 12px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 9, cursor: "pointer", width: "100%", textAlign: "left", border: "1.5px solid var(--el)", fontFamily: "inherit", color: INK, textDecoration: "none", boxSizing: "border-box", minHeight: 86 };
const head: CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: MUTED, margin: "14px 0 8px" };
const label: CSSProperties = { fontSize: 12.5, fontWeight: 900, lineHeight: 1.2 };
const badgeStyle = (on: boolean): CSSProperties => ({ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.5, padding: "2px 7px", borderRadius: 999, background: on ? "rgba(34,197,94,.16)" : "var(--el)", color: on ? "#22C55E" : SUB, whiteSpace: "nowrap" });

/** the icon in its tinted circle — one shape for every tile */
function Glyph({ c, children }: { c: string; children: ReactNode }) {
  return (
    <span style={{ width: 34, height: 34, borderRadius: 12, flexShrink: 0, background: `${c}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

const ICONS = {
  gst: (c: string) => <Glyph c={c}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9.5 13h5M9.5 17h5" /></Glyph>,
  payments: (c: string) => <Glyph c={c}><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M3 10.5h18" /><path d="M7 15h3" /></Glyph>,
  invoices: (c: string) => <Glyph c={c}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Glyph>,
  refunds: (c: string) => <Glyph c={c}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Glyph>,
  enquiries: (c: string) => <Glyph c={c}><path d="M4 6h16v10H9l-5 4z" /><path d="M8 10h8M8 13h5" /></Glyph>,
  /* the team desk's glyph (26 Sep 2026) — two people, for the organization's Team tile */
  team: (c: string) => <Glyph c={c}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3 2.7-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><circle cx="16.5" cy="9" r="2.4" /><path d="M15.5 14.6c2.5.1 4.3 1.5 5 4.4" /></Glyph>,
  language: (c: string) => <Glyph c={c}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.6 3.8 5.4 3.8 8.5s-1.2 5.9-3.8 8.5c-2.6-2.6-3.8-5.4-3.8-8.5S9.4 6.1 12 3.5z" /></Glyph>,
  privacy: (c: string) => <Glyph c={c}><path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6z" /><path d="m9.5 12 1.8 1.8L15 10" /></Glyph>,
  help: (c: string) => <Glyph c={c}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.2" /><path d="m6 6 3.7 3.7M18 6l-3.7 3.7M18 18l-3.7-3.7M6 18l3.7-3.7" /></Glyph>,
  admin: (c: string) => <Glyph c={c}><path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6z" /><path d="M12 8v4M12 15.5v.5" /></Glyph>,
  logout: (c: string) => <Glyph c={c}><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="m15 8 5 4-5 4M20 12H9" /></Glyph>,
  /* EDIT PROFILE IS SETTINGS' FIRST OPTION (19 Sep 2026) — the pencil's glyph,
     where the pencil used to be on two heroes */
  edit: (c: string) => <Glyph c={c}><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="m14.5 5.5 4 4" /></Glyph>,
};

function Tile({ icon, children, href, onClick, badge, ariaLabel, pressed, disabled, onNavigate, danger = false }: { icon: ReactNode; children: ReactNode; href?: string; onClick?: () => void; badge?: ReactNode; ariaLabel?: string; pressed?: boolean; disabled?: boolean; onNavigate?: (href: string) => void; danger?: boolean }) {
  const body = (
    <>
      <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", gap: 6 }}>
        {icon}
        {badge}
      </span>
      <span style={{ ...label, color: danger ? RED : INK }}>{children}</span>
    </>
  );
  const style: CSSProperties = danger ? { ...tile, border: `1.5px solid ${RED}` } : tile;
  if (href) {
    return (
      <Link
        href={href}
        /* a tile PUSHES (27 Sep 2026 — see `go`): back from the desk it opens
           returns to the settings list, which is where the press was made */
        onClick={
          onNavigate
            ? (e) => {
                e.preventDefault();
                onNavigate(href);
              }
            : undefined
        }
        style={style}
        aria-label={ariaLabel}
      >
        {body}
      </Link>
    );
  }
  return (
    <button type={onClick ? "button" : "submit"} onClick={onClick} disabled={disabled} aria-label={ariaLabel} aria-pressed={pressed} style={style}>
      {body}
    </button>
  );
}

/** WHICH PROFILE THIS SHEET IS FOR (21 Sep 2026, the user: "settings are
 *  seprate for each profile type according to which profile you are in").
 *
 *  ⚠ THIS SHEET COULD NOT HAVE BEEN PER-PROFILE BEFORE, and the reason is
 *  structural rather than a matter of which tiles it drew: it was rendered by
 *  ONE PAGE — `MyProfilePage`, on `?settings=1` — so the only profile it could
 *  ever be about was the person whose profile tab it was on. It is rendered by
 *  the CHROME now, which knows from the pathname which profile you are acting
 *  as, and the gear is on every screen. */
export type SettingsProfile =
  | {
      kind: "me";
      /** THE ACCOUNT ITSELF, so Edit profile can be Settings' first option
       *  (19 Sep 2026). A chrome with no profile row to hand draws no tile
       *  rather than opening an empty form. */
      profile: Profile | null;
      role: ProfileRole;
      /** the Artist plan, when one has been taken — read for the Enquiry-types
       *  gate only, now that the plan's own tiles have left this sheet (26 Sep 2026) */
      plan: ArtistPlan | null;
      /** ⚠ THE ARTIST PAGE THIS PERSON OWNS, or null — never "the first
       *  business you are on the team of", and never an arbitrary pick among the
       *  ones they own: each studio's and each organization's money is in that
       *  business's own Settings. */
      business: Business | null;
    }
  | { kind: "studio"; business: Business }
  /* ⚠ `{ kind: "org" }` — an organization's own settings (26 Sep 2026) — went
     with organizations on 29 Sep */
  | { kind: "crew"; crew: { id: string; name: string } };

export function SettingsSheet({
  open,
  onClose,
  active,
  isAdmin = false,
}: {
  open: boolean;
  onClose: () => void;
  active: SettingsProfile;
  /** a platform admin gets the panel as a tile; nobody else sees it exists */
  isAdmin?: boolean;
}) {
  const router = useRouter();
  /** ⚠⚠ LEAVING THE SHEET FOR A DESK **PUSHES** (27 Sep 2026, the user: *"fix
   *  back swipe while going in and out from setting menu all items"*) — and this
   *  REVERSES the 19 Sep decision, deliberately.
   *
   *  That day a tile REPLACED the `?settings=1` entry, on the reasoning that
   *  back from a desk should be "the page under the sheet, never the sheet
   *  re-opening itself". The second half of that sentence is the mistake: the
   *  sheet re-opening is not a loop, it is the way BACK — it is where you were
   *  standing when you pressed the tile. What replace actually bought was this:
   *  every single item cost a re-open of the menu (gear → tile → back → gear →
   *  tile → back), which is what "in and out from setting menu all items" is
   *  describing, and there is no way at all to step back into the list.
   *
   *  ⚠ A push is safe here for the same reason the sheet needs no sentinel: its
   *  open state IS the URL. Navigating to a desk drops `?settings=1`, so the
   *  sheet closes itself with no state to race; going back restores the param,
   *  and the chrome draws the sheet again. Nothing closes first, so the 19 Sep
   *  race (a `router.back()` cancelling a push in the same tick) cannot happen —
   *  that bug was about closing AND pushing, not about pushing. */
  const go = (href: string) => router.push(href);
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  /* ⚠ NO NESTED SHEET ANY MORE (27 Sep 2026): Enquiry types was the only one,
     and with it gone `useCloseOnBack` has nothing here to close. This sheet
     registers NO entry of its own and never did — its open state IS the URL
     (`?settings=1`, pushed by the gear), so the entry system-back pops is that
     one; a second, same-URL entry here is what made back re-open Settings on
     19 Sep. The toast state stays: it is what a failed navigation would say. */
  if (!open) return null;

  /* ── WHAT THIS PROFILE IS, in the four shapes the sheet has to draw ── */
  const me = active.kind === "me" ? active : null;
  const studio = active.kind === "studio" ? active.business : null;
  /* the business whose SETTINGS these are: a person's own artist page, or the
     studio you are in. A crew is not a business and has neither. */
  const biz: Business | null = studio ?? me?.business ?? null;
  const profile = me?.profile ?? null;
  const role: ProfileRole = me?.role ?? "user";
  const plan = me?.plan ?? null;

  /* the prototype's "dancer" is the KIND user — a person with no live plan; an
     artist (the plan) gets the business desk's money tiles. ⚠ `role` is never
     `org` since 26 Sep 2026 — the login is retired — so no branch reads it. */
  const isDancer = Boolean(me) && role === "user" && !plan?.active;
  /* ⚠ `flipArtist` IS GONE (26 Sep 2026): the Artist tools switch left this
     sheet with the plan's tiles, and `/subscription` — the Subscription tile on
     Home — is where the plan is taken and ended */

  /* ⚠ ENQUIRIES YOU ACCEPT moved to the contact ⊕ on the business's own home
     (27 Sep 2026) — see the note where its sheet used to be drawn */

  const desk = biz ? `/business/${biz.id}` : null;
  /* a person with no page of their own reads their OWN money screens; a studio
     always reads its desk's, which is the whole point of ask 2 */
  const personal = !studio && (isDancer || !desk);
  /* the sheet says whose settings these are, because it is no longer always
     yours — the switcher's dot answers the same question one control away */
  const whose = studio ? studio.name : active.kind === "crew" ? active.crew.name : (profile?.fullName ?? null);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600, fontFamily: DOS_UI }}>
      <div role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "16px 16px 30px", width: "100%", maxWidth: 430, boxSizing: "border-box", maxHeight: "84vh", overflowY: "auto", color: INK, animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
        <div style={{ borderRadius: 18, padding: "14px 16px 13px", background: "linear-gradient(135deg,#64748B,#0EA5E9)", color: "#fff", marginBottom: 4 }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>Settings</div>
          {/* ⚠ WHOSE (21 Sep 2026). While this sheet could only ever be your own
              it needed no label; now that the gear opens the settings of the
              profile you are IN, a sheet that does not say which one is a sheet
              you can change the wrong thing from. */}
          {whose ? <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>{whose}</div> : null}
        </div>

        {/* ══ A STUDIO'S OWN SETTINGS (21 Sep 2026, the user: "Studio-Invoices
            subscription and refunds to be managed from settings", and their
            answer that verification moves here too).
            ⚠ ALL FOUR LEFT THE STUDIO'S HOME FOR THIS BLOCK, and that reverses
            what the same user asked for yesterday — the standing block I put on
            the studio's home this morning (C51). Their later word wins, and the
            reversal is total rather than partial on purpose: two doors to a
            studio's subscription is what C31 removed and what C51 re-created,
            and this file has recorded the cost of that shape twice.
            ⚠ Verification is the one FORM on the list, so it has a page of its
            own (`/business/{id}/verification`) — a tile opens something. ══ */}
        {studio ? (
          <>
            <div style={head}>THIS STUDIO</div>
            <div style={grid}>
              {/* ⚠ FIRST, THE WAY A PERSON'S IS (22 Sep 2026, the user: "studio
                  edit profile should be in settings"). C22 moved Edit profile
                  here for a person — "all edit profile options to be removed
                  from home and profile pages" — and a studio kept TWO: the
                  pencil on its home's corner and an Edit cell on its public
                  page. Both are gone; this is the door.
                  ⚠ It NAVIGATES, like Invoices and Refunds below, rather than
                  opening a sheet from the chrome — the form needs the studio's
                  whole public profile, and carrying that in the layout would be
                  a read on every desk and every class page for a sheet most
                  visits never open. The same call C53 made for Verification. */}
              {/* ⚠ NO EDIT TILE (26 Sep 2026, the user: "edit profile to be removed
                  from all profiles settings and should be a button on top right
                  with public page view") — the pencil on the studio's own home */}
              <Tile icon={ICONS.gst("#0EA5E9")} href={`${desk}/verification`} onNavigate={go} badge={<span style={badgeStyle(Boolean(studio.verifiedAt))}>{studio.verifiedAt ? "verified" : "not yet"}</span>}>
                Verification
              </Tile>
              {/* ⚠ NO SUBSCRIPTION TILE (26 Sep 2026): it is the Subscription tile
                  on Home for the account, and `/business/{id}/subscription` for
                  this studio's own mandate, reached from the same place */}
              <Tile icon={ICONS.invoices("#3B82F6")} href={`${desk}/invoices`} onNavigate={go}>
                Invoices
              </Tile>
              <Tile icon={ICONS.refunds("#F97316")} href={`${desk}/refunds`} onNavigate={go}>
                Refunds
              </Tile>
              <Tile icon={ICONS.payments("#22C55E")} href={`${desk}/payments`} onNavigate={go}>
                Payments
              </Tile>
              {/* ⚠ ENQUIRY TYPES IS GONE FROM SETTINGS (27 Sep 2026, the user:
                  *"enquiries should be removed from settings"*). Which kinds a
                  business takes is what its Enquiry BUTTON offers, so it is
                  beside the switch that draws that button — the ⊕ under the
                  button row on the business's own home — rather than two screens
                  away under MONEY, which it never had anything to do with. */}
            </div>
          </>
        ) : null}

        {/* ⚠⚠ THE "THIS ORGANIZATION" BLOCK WENT WITH ORGANIZATIONS (29 Sep
            2026). It was the studio block for the third kind of business a
            person opened: its GST number (the organization's own verification,
            on the business row), its Team, and its money. */}

        {/* ── A CREW HAS ONE SETTING, AND IT IS THE SAME ONE A STUDIO HAS
            (22 Sep 2026). ⚠ THIS REVERSES C53's OWN SENTENCE, which said a crew
            has nothing here *because* its name, picture, city and style are the
            pencil on its home — true when it was written, and exactly the thing
            being changed. The user asked for a studio's edit to move into
            Settings and for its view button to match the other profiles; a
            crew's home carried the identical pencil-plus-eye pair, and fixing
            only the screen that was complained about is the mistake C36 made
            and C49 had to come back for. It takes no money, so that is still
            all it has. ── */}
        {active.kind === "crew" ? (
          <>
            <div style={head}>THIS CREW</div>
            {/* ⚠ NO EDIT TILE (26 Sep 2026): a crew is edited by the pencil on its
                own home, like every other profile; it takes no money, so nothing
                else is its */}
            <div style={{ fontSize: 11.5, color: SUB, fontWeight: 700, padding: "2px 2px 2px", lineHeight: 1.5 }}>
              {active.crew.name} is edited from its own home — the pencil top right. It takes no money, so it has nothing else here.
            </div>
          </>
        ) : null}

        {/* ⚠ NO "YOU · Edit profile" BLOCK (26 Sep 2026, the user: "edit profile
            to be removed from all profiles settings and should be a button on
            top right with public page view right now"). C22 (19 Sep) brought the
            pencil here; the user's later word puts it back on every home's
            corner, where it opens EVERY editor at once rather than one form. */}

        {/* ⚠ YOUR PLAN IS GONE WHOLE (26 Sep 2026): the Artist tools switch and
            the Subscription tile are the Subscription tile on Home now, at the
            user's word — "subscribe to become an artist should not be a separate
            tab in settings like artist tools". Nothing is orphaned: /subscription
            is the tile's own screen, and it still takes and ends the plan. */}
        {me ? (
        <>
        {/* ── MONEY: a person's own screens, or their artist page's desk. ⚠ NO
            GST TILE HERE (26 Sep 2026): a GST number is an ORGANIZATION's, under
            THIS ORGANIZATION above. ── */}
        <div style={head}>MONEY</div>
        <div style={grid}>
          <Tile icon={ICONS.payments("#22C55E")} href={personal ? "/payments" : `${desk}/payments`} onNavigate={go}>
            {personal ? "Payments" : "Payments & verification"}
          </Tile>
          <Tile icon={ICONS.invoices("#3B82F6")} href={personal ? "/invoices" : `${desk}/invoices`} onNavigate={go}>
            Invoices
          </Tile>
          <Tile icon={ICONS.refunds("#F97316")} href={personal ? "/refunds" : `${desk}/refunds`} onNavigate={go}>
            Refunds
          </Tile>
        </div>

        {/* ⚠⚠ THE WHOLE `BUSINESS` BLOCK IS GONE (27 Sep 2026, the user:
            *"enquiries should be removed from settings"*). It held one tile —
            Enquiry types for the ARTIST PAGE you own — so removing the tile
            removes the head with it rather than leaving a heading over nothing.
            An artist's kinds are the contact ⊕ on their own home now, beside the
            Enquiry switch that draws the button; a studio's and an
            organization's are on theirs. */}
        </>
        ) : null}

        {/* ── ACCOUNT — the one block every profile carries, because signing out,
            the language, the privacy page and the conversation with DanceOS are
            the ACCOUNT's rather than any one profile's ── */}
        <div style={head}>ACCOUNT</div>
        <div style={grid}>
          <Tile icon={ICONS.language("#06B6D4")} onClick={() => fire("English — more languages are coming")}>
            Language
          </Tile>
          <Tile icon={ICONS.privacy("#64748B")} href="/legal/privacy" onNavigate={go}>
            Privacy & data
          </Tile>
          {/* Help & support and Message DanceOS were two doors to one conversation (10 Sep 2026) — one tile */}
          <Tile icon={ICONS.help("#0EA5E9")} href="/support" onNavigate={go}>
            Help & support
          </Tile>
          {isAdmin ? (
            <Tile icon={ICONS.admin("#A855F7")} href="/admin" onNavigate={go}>
              Admin panel
            </Tile>
          ) : null}
        </div>
        {/* ⚠ LOG OUT IS NOT HERE ANY MORE (21 Sep 2026, the user: "shift log out
            from setting to profile switcher"). It is the last row of the profile
            switcher, which is the chip beside the gear on EVERY screen — so the
            way out went from being two taps inside the Profile tab to one tap
            from anywhere. Nothing is orphaned, which is the test C31 sets. */}

        {/* ⚠⚠ THE ENQUIRY-TYPES SHEET IS DELETED (27 Sep 2026), not left behind
            the tile that used to open it. With the three tiles gone nothing
            could set `enqOpen`, so the sheet, its state, `enqOn`, `flipEnq` and
            the counts were a branch NO SCREEN RENDERS — which lint cannot see,
            because they still referenced each other, and which this repo's own
            rule says is where a defect hides (the dead "Where you stand with
            DanceOS ›" link of 21 Sep survived exactly that way for ten days).
            The control it held lives on in `ContactEditor`, beside the switch
            that decides whether the button exists at all. */}

        {toast ? <div role="status" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650, boxShadow: "0 6px 24px rgba(0,0,0,.45)" }}>{toast}</div> : null}
      </div>
    </div>
  );
}
