"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { CityPicker } from "@/features/geo/components/CityPicker";
import { createOrganizationAction, type OrganizationActionState } from "@/features/organizations/server-actions/organizations";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { DeskAddButton, VerifiedTick } from "@/features/settings/components/settings-kit";
import { DOS_TOOLS, SHEET_ANIMATION, dosToolPaint } from "@/features/tenants/components/biz-kit";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { photoUrl } from "@/lib/media/photo";
import { priceWords, type PlanCatalogRow } from "@/repositories/plans";
import type { StudioSubscriptionState } from "@/repositories/subscriptions";
import type { Tenant } from "@/types/tenant";

const CARD = "var(--card)";
const EL = "var(--el)";
const ACCENT = DOS_TOOLS.organizations.c;
const initialState: OrganizationActionState = { error: null };

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: EL,
  border: `1.5px solid ${EL}`,
  borderRadius: 12,
  padding: "11px 12px",
  color: INK,
  fontSize: 14,
  fontWeight: 600,
  outline: "none",
};

/** the section head (2622): 9.5px, 900, tracked, muted */
const Head = ({ children }: { children: string }) => <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", margin: "2px 0 8px" }}>{children}</div>;

/* the organization's mark, when it has no picture yet (BusinessHub's own shape) */
const OrgI = ({ size = 19, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21h18" />
    <path d="M5 21V7l7-4 7 4v14" />
    <path d="M9 21v-5h6v5M9 10h2M13 10h2M9 14h2M13 14h2" />
  </svg>
);

/** THE ORGANIZATIONS HUB — `/organizations`, the tile beside Studios on every
 *  person's Home (26 Sep 2026, the user: "make organization a tab on home for
 *  artist and users and mechanism to create and open an organization similar
 *  to studios and managing subscription also the same way for organization").
 *
 *  It is `BusinessHub` cut lean: the tile's word in the tile's colour, ONE price
 *  line under it, ＋ Add organization (or the gate's own sentence in its place —
 *  the same shape the Studios hub uses, because a control that would be refused
 *  says less than the refusal), then YOUR ORGANIZATIONS as one card each. The
 *  card is the door to the organization's home (a stretched link), wears its
 *  GST standing where a studio's wears its badge, and offers Subscribe once the
 *  number is verified — the `SubscribeButton` a studio's card offers, since an
 *  organization's mandate is a studio's for the third kind.
 *
 *  ⚠ NO PIN, NO ROOMS, NO STYLES on the sheet: an organization is not a place
 *  on Discover — its events carry their own venues — so what is asked is a
 *  name, where it is based, and how to reach it. The MOBILE NUMBER and EMAIL are
 *  required and are the organization's own (the user: "not take directly what
 *  the user used for their login"). */
export function OrganizationsHub({
  organizations,
  whyNoOrganization,
  subscriptions = {},
  orgPrice = null,
}: {
  /** the organizations this account OWNS */
  organizations: Tenant[];
  /** THE GATE, in the database's words: null when one may be opened, else the sentence */
  whyNoOrganization: string | null;
  /** each organization's own subscription, and the sentence between it and the public */
  subscriptions?: Record<string, StudioSubscriptionState>;
  /** what one organization costs, from the price list; null when none is on offer */
  orgPrice?: PlanCatalogRow | null;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  /* the action revalidates in place, so the sheet closes itself once a creation lands */
  const [state, formAction, isPending] = useActionState(async (prev: OrganizationActionState, formData: FormData) => {
    const result = await createOrganizationAction(prev, formData);
    if (result.created) {
      setSheetOpen(false);
      setName("");
      setArea("");
      setCity("");
      setPhone("");
      setEmail("");
      if (result.note) fire(result.note);
    }
    return result;
  }, initialState);
  /* system back closes the sheet, exactly as tapping the scrim does */
  useCloseOnBack(() => setSheetOpen(false), sheetOpen);

  const phoneOk = /^\+?[0-9][0-9 ]{7,17}$/.test(phone.trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ok = name.trim().length > 0 && city.length > 0 && phoneOk && emailOk;
  const canOpen = whyNoOrganization === null;

  const cardStyle: React.CSSProperties = {
    position: "relative",
    background: CARD,
    border: `1.5px solid ${EL}`,
    borderLeft: `4px solid ${ACCENT}`,
    borderRadius: 16,
    padding: "12px 13px",
    marginBottom: 9,
    color: INK,
  };

  const face = (t: Tenant) => {
    const src = photoUrl(t.photoPath);
    return (
      <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, overflow: "hidden", position: "relative", background: `${ACCENT}1c`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {src ? <Image src={src} alt="" fill sizes="42px" style={{ objectFit: "cover" }} /> : <OrgI color={ACCENT} />}
      </span>
    );
  };

  /** ONE CARD PER ORGANIZATION: the face, the name with the GST tick when the
   *  number is verified, the place, LIVE once it is public — and the WORK
   *  beneath it: Subscribe once the number is in, or the sentence that says
   *  what is still in the way. */
  const orgCard = (t: Tenant) => {
    const st = subscriptions[t.id];
    const live = st ? st.whyNotPublic === null : false;
    const gstOk = Boolean(t.gstinVerifiedAt);
    const canSubscribe = Boolean(st && !st.subscription?.hasAccess && orgPrice && gstOk);
    const loc = [t.area, t.city].filter(Boolean).join(", ");
    return (
      <div key={t.id} data-testid="org-card" style={cardStyle}>
        {/* the stretched link: the whole card is the door to the organization's home */}
        <Link href={`/business/${t.id}`} aria-label={`${t.name} — open the organization`} style={{ position: "absolute", inset: 0, zIndex: 1, borderRadius: 16 }} />
        <div style={{ position: "relative", zIndex: 0, display: "flex", alignItems: "center", gap: 11 }}>
          {face(t)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              {/* the tick is the GST number, verified — an organization's whole verified state */}
              {gstOk ? <VerifiedTick size={14} /> : null}
            </div>
            <div style={{ fontSize: 10, color: SUB, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[loc, gstOk ? "GST verified" : "GST number needed"].filter(Boolean).join(" · ")}</div>
          </div>
          {live ? (
            <span data-testid="org-live" style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999, background: "#DCFCE722", color: "#22C55E", border: "1.5px solid #22C55E55" }}>
              LIVE
            </span>
          ) : null}
        </div>

        {/* the work — above the stretched link, so a press lands on the control */}
        {!live ? (
          <div style={{ position: "relative", zIndex: 2, marginTop: 10 }}>
            {canSubscribe && orgPrice ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <SubscribeButton planKey={orgPrice.key} tenantId={t.id} label={`Subscribe · ${priceWords(orgPrice.priceInr, orgPrice.period)}`} onDone={fire} style={{ background: ACCENT }} />
                <span style={{ fontSize: 10.5, color: SUB, lineHeight: 1.45 }}>GST verified — subscribe to put it and its events in front of the public.</span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: SUB, lineHeight: 1.45 }}>{st?.whyNotPublic ?? "Verify its GST number from its Settings, then subscribe it."}</span>
                {!gstOk ? (
                  <Link href={`/business/${t.id}/gst`} aria-label={`Add ${t.name}'s GST number`} style={{ flexShrink: 0, display: "inline-block", padding: "6px 11px", borderRadius: 999, fontWeight: 900, fontSize: 11.5, textDecoration: "none", background: LILAC, border: `1.5px solid ${EL}`, color: INK }}>
                    GST number
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, paddingBottom: "var(--dos-foot, 40px)" }}>
      <div style={{ padding: "14px 16px 0" }}>
        {/* the same paint, and the same word, as the tile you pressed to get here */}
        <div style={{ borderRadius: 22, padding: "15px 17px 14px", marginBottom: 8, position: "relative", overflow: "hidden", color: "#fff", background: dosToolPaint(ACCENT) }}>
          <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>{DOS_TOOLS.organizations.name}</h1>
        </div>
        {/* THE PRICE, ONCE, FROM THE PRICE LIST — the one fact the cards cannot
            say until there is one (26 Sep 2026: ₹5,000 a month, the user's number) */}
        <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, margin: "0 2px 12px" }}>
          {orgPrice ? `An organization is ${priceWords(orgPrice.priceInr, orgPrice.period).replace("/mo", " a month")} once its GST number is verified.` : "No organization plan is on offer right now — message DanceOS from Settings › Help & support."}
        </div>

        {whyNoOrganization ? (
          <div role="status" aria-label={`Cannot add an organization: ${whyNoOrganization}`} style={{ borderRadius: 16, border: `1.5px dashed var(--el)`, padding: "13px 14px", background: CARD, marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 900, color: INK }}>＋ Add organization</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4, lineHeight: 1.5 }}>{whyNoOrganization}</div>
          </div>
        ) : (
          <DeskAddButton label="Add organization" onClick={() => setSheetOpen(true)} />
        )}

        <Head>YOUR ORGANIZATIONS</Head>
        {organizations.length ? (
          organizations.map(orgCard)
        ) : (
          <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px", lineHeight: 1.5 }}>
            No organizations yet — the button above opens one. Verify its GST number, then its own subscription puts it and its events in front of the public; you run it from the profile switcher.
          </div>
        )}
      </div>

      {sheetOpen && canOpen ? (
        <div onClick={() => setSheetOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600 }}>
          <div role="dialog" aria-modal="true" aria-label="New organization" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "18px 16px 28px", width: "100%", maxWidth: 430, boxSizing: "border-box", maxHeight: "88vh", overflowY: "auto", color: INK, animation: SHEET_ANIMATION }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>New organization</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px", lineHeight: 1.5 }}>
              An organization puts on events and names its team. It stays private until its GST number is verified and it is subscribed; then its page and its events are in front of the public.
            </div>
            <form action={formAction}>
              <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>Organization name</div>
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. EEE Dance Company" style={inp} />

              <div style={{ fontSize: 12, color: SUB, margin: "14px 0 4px" }}>Area (optional)</div>
              <input name="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Andheri West" style={inp} />

              <input type="hidden" name="city" value={city} />
              <div style={{ margin: "12px 0 0" }}>
                <CityPicker value={city || null} label="City" onChange={(next) => setCity(next ?? "")} />
              </div>

              {/* THE ORGANIZATION'S OWN CONTACT, REQUIRED (26 Sep 2026) — never the
                  number or address the person signed in with */}
              <div style={{ fontSize: 12, color: SUB, margin: "14px 0 4px" }}>Mobile number — the organization&apos;s</div>
              <input name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={inp} />
              {phone.trim() && !phoneOk ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 4 }}>A mobile number is 8 to 18 digits.</div> : null}
              <div style={{ fontSize: 12, color: SUB, margin: "14px 0 4px" }}>Email — the organization&apos;s</div>
              <input name="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@example.com" style={inp} />
              {email.trim() && !emailOk ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 4 }}>That is not an email address.</div> : null}
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>Both are shown on its page as Call and Mail, and both are yours to change from its Settings.</div>

              {state.error ? <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginTop: 12 }}>{state.error}</div> : null}
              <button
                type="submit"
                disabled={!ok || isPending}
                style={{ marginTop: 14, width: "100%", textAlign: "center", padding: "13px", borderRadius: 999, border: "none", fontFamily: "inherit", background: ok ? "var(--text)" : EL, color: ok ? "var(--solid)" : "var(--muted)", fontWeight: 800, fontSize: 13.5, cursor: ok ? "pointer" : "default" }}
              >
                {isPending ? "Opening…" : "Open organization"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {toast ? <div role="status" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 700, maxWidth: 360, textAlign: "center" }}>{toast}</div> : null}
    </div>
  );
}
