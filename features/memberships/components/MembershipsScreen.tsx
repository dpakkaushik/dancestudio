"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { confirmCheckoutAction, startMembershipCheckoutAction } from "@/features/payments/server-actions/payments";
import { openCashfreeCheckout } from "@/lib/cashfree/checkout-client";
import { DOS_TOOLS, DeskHero } from "@/features/businesses/components/biz-kit";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead, ToolTitle, toolBtn } from "@/components/ui/ToolCard";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import { DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import type { MembershipWithUsage, MyPass, PassUse } from "@/repositories/memberships";

/** MEMBERSHIPS (19 Sep 2026, the user: "Users should be able to buy from Studio
 *  and Artist Profile Pages and track from memberships section in tools. Artist
 *  should be able to create and track usage of memberships they have created
 *  and memberships they have purchased").
 *
 *  So this one screen has two sides, and an artist is the account that has
 *  both: YOURS — the passes you hold, each with the progress bar that is the
 *  whole point of a membership — and ON SALE, what your studio or your page
 *  sells, each with how many went and how much of what was sold has actually
 *  been danced. A plain user sees only the first; a studio owner only the
 *  second; an artist both, which is why they are segments of one page rather
 *  than two tiles.
 *
 *  THE FOUR THINGS AND NOTHING ELSE (the user's own list): a name, classes or
 *  hours with how many, a price, and how many may be sold. */

const card: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };
/** the Memberships tool's own colour — every card's face, wash and figures */
const TINT = DOS_TOOLS.memberships.c;

/** HOW FAR THROUGH — the one thing a membership is for (the user: "progress bar
 *  for completion"). Drawn from two real numbers, never a stored percentage. */
export function ProgressBar({ used, total, tint = "#22C55E", testId }: { used: number; total: number; tint?: string; testId?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div data-testid={testId} data-pct={pct} aria-label={`${used} of ${total} used`} style={{ marginTop: 6 }}>
      <div style={{ height: 6, borderRadius: 999, background: "var(--el)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: tint }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: SUB, marginTop: 4 }}>
        <span>
          {used} of {total} used
        </span>
        <span>{total - used} left</span>
      </div>
    </div>
  );
}

const unitWord = (unit: "classes" | "hours", n: number) => (unit === "hours" ? `${n} ${n === 1 ? "hour" : "hours"}` : `${n} ${n === 1 ? "class" : "classes"}`);

const dayWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** WHAT ONE PASS WAS SPENT ON (30 Sep 2026) — `pass_uses`, the RPC the 19 Sep
 *  migration shipped for exactly this and nothing ever called. The bar says how
 *  far through a pass is; this says WHERE it went, one line per seat, newest
 *  first. Drawn under a holder's bar on the seller's usage page and under your
 *  own pass on the Memberships tile, so both ends read the same rows.
 *  ⚠ Not drawn at all for a pass nothing has been spent on — an empty "Spent on"
 *  under a full bar would be the heading said twice. */
export function SpentOn({ uses, unit }: { uses: PassUse[]; unit: "classes" | "hours" }) {
  if (uses.length === 0) return null;
  return (
    <div data-testid="spent-on" style={{ marginTop: 8, paddingTop: 8, borderTop: "1.5px solid var(--el)" }}>
      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 4 }}>SPENT ON</div>
      {uses.map((u) => (
        <Link key={`${u.classId}-${u.startsAt}`} href={`/c/${u.shareSlug}`} aria-label={`Open ${u.style} · ${DOS_LEVEL_LABEL[u.level] ?? u.level}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 10.5, textDecoration: "none", color: INK }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <b>{u.style}</b> · {DOS_LEVEL_LABEL[u.level] ?? u.level}
            <span style={{ color: SUB }}> · {dayWords(u.startsAt)}</span>
          </span>
          <span style={{ flexShrink: 0, color: SUB }}>{unitWord(unit, u.units)}</span>
        </Link>
      ))}
    </div>
  );
}

/* ⚠ `SellerFace` went on 3 Oct 2026 — the seller's face is the head of the
   shared `ToolCard` now (`ToolFace`: `DISC_RADIUS`, initials when there is no
   photo), at a profile's size rather than 34px. */

export function MembershipsScreen({
  passes,
  selling,
  canSell,
  business = null,
  sellerPhotos = {},
  usesByPass = {},
  openOnBooked = false,
  seller = null,
}: {
  /** open on the passes you hold — `?show=booked`, where a payment lands (2 Oct 2026) */
  openOnBooked?: boolean;
  /** what this person HOLDS */
  passes: MyPass[];
  /** what their studio or artist page SELLS — empty for a plain user */
  selling: MembershipWithUsage[];
  canSell: boolean;
  /** ⚠ ONE BUSINESS'S DESK (21 Sep 2026): set when this is a STUDIO's own
   *  Memberships tile rather than a person's. Then there is nothing to switch
   *  to — a studio holds no passes, because a business is not a person
   *  (`guard_person_only`) — so the segments go and the page says whose it is. */
  business?: { id: string; name: string } | null;
  /** the seller's picture, keyed by business id — read once for the whole list by
   *  the page (28 Sep 2026). A business missing from this map draws initials, and
   *  a STUDIO's own desk passes none at all, because that side sells rather than
   *  holds and the page it is on already says whose it is. */
  sellerPhotos?: Record<string, string | null>;
  /** what each of YOUR passes has been spent on, keyed by pass id (30 Sep 2026);
   *  a pass missing from the map has spent nothing and draws no list */
  usesByPass?: Record<string, PassUse[]>;
  /** WHO SELLS what is on the Manage side — the studio, or the artist the page
   *  belongs to — the profile every on-sale card leads with (3 Oct 2026) */
  seller?: { name: string; photoPath: string | null; kind: "studio" | "artist" } | null;
  /* ⚠ NO `sellerId` / `sellerName` ANY MORE (21 Sep 2026): the form left this
     desk for `/memberships/new`, which resolves whose membership it is on the
     server rather than taking it from a prop. A dead prop is a lie. */
}) {
  const router = useRouter();
  /* ⚠ MANAGE IS FIRST, AND IT IS WHERE THE TILE OPENS (20 Sep 2026, the user:
     "Manage Membership and classes to be first option in order and when opening
     the tile"). Somebody who SELLS memberships opens on the ones they sell;
     somebody who only holds passes has no Manage side to open, so they land on
     Booked — which is the only segment they have. */
  const [seg, setSeg] = useState<"mine" | "selling">(canSell && !openOnBooked ? "selling" : "mine");
  /* a studio's desk has one side, so the switch is not drawn and cannot be reached */
  const side = business ? "selling" : seg;
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  /* A PASS TAKEN BUT NOT PAID FOR — the checkout picks up where it left off, on
     the event page's own pattern: open Cashfree's window, then ask OUR server
     what happened on OUR order. The browser's word is never the answer. */
  const payFor = (p: MyPass) =>
    start(async () => {
      const res = await startMembershipCheckoutAction({ passId: p.passId, businessName: p.businessName, description: p.name });
      if (res.error || !res.checkout) return fire(res.error ?? "Could not start the payment");
      try {
        const result = await openCashfreeCheckout(res.checkout.paymentSessionId, res.checkout.mode);
        if (result.redirect) return; // leaving for /pay/return, which confirms it
        /* a closed window is still ASKED about below — a UPI payment finished in
           another app can land after the window gave up (2 Oct 2026) */
      } catch (openError: unknown) {
        return fire(openError instanceof Error ? openError.message : "Could not open the payment window");
      }
      const out = await confirmCheckoutAction({ orderId: res.checkout.orderId });
      if (out.error) return fire(out.error);
      fire("🎟 Membership is yours");
      router.refresh();
    });

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "8px 16px 40px", boxSizing: "border-box" }}>
      {/* ⚠ THE TOP SECTION (3 Oct 2026, C116): the hero, whose desk it is, the two
          sides and the add button; the passes or the memberships on sale are the
          lower section. `DeskAddButton` carries its own 12px foot, so the top's
          own bottom padding steps back when it is the last thing in it. */}
      <DeskTop style={side === "selling" ? { paddingBottom: 2 } : undefined}>
      <DeskHero tool="memberships" as="h1" margin="0" />

      {/* a studio's desk says whose it is: an organization runs several, and the
          tool hero names the TOOL and nothing that names the studio */}
      {business ? <div style={{ fontSize: 11.5, color: SUB, fontWeight: 800, margin: "4px 0 0" }}>What {business.name} sells</div> : null}

      {canSell && !business ? (
        <div role="group" aria-label="Show" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginTop: 12 }}>
          {/* BOOKED · MANAGE (19 Sep 2026, the user: "membership columns should be
              Booked and Manage") — the same two sides, in the words the Classes
              desk already uses: what you hold, and what you sell */}
          {/* ⚠ MANAGE FIRST IN THE ORDER TOO (20 Sep 2026) — the segment you land
              on and the segment you read first are the same one, or the order is
              telling you something the page then contradicts. */}
          {([["selling", `Manage · ${selling.length}`], ["mine", `Booked · ${passes.length}`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setSeg(k)} aria-pressed={seg === k} style={{ flex: 1, padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, border: "none", cursor: "pointer", fontFamily: "inherit", background: seg === k ? "var(--solid)" : "transparent", color: seg === k ? INK : SUB }}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {side === "selling" ? (
        <div style={{ marginTop: 12 }}>
          {/* ⚠ THE FORM IS A PAGE NOW (21 Sep 2026, the user: "same should be for
              new routine and new membership"). It expanded inside this desk,
              which is why it looked nothing like Add class. `/memberships/new`
              wears the shared `FormPage` anatomy and resolves WHOSE membership
              it is on the server, the same way this desk does.
              ⚠ AND IT OPENS OVER THIS DESK (22 Sep 2026) — `?new=1` on the page
              you are already on, so the phone's back gesture closes it; the
              studio's own desk takes the id from the route, not the link. */}
          <DeskAddButton label="New membership" href="?new=1" />
        </div>
      ) : null}
      </DeskTop>

      <DeskBody>
      {side === "mine" ? (
        <>
          {passes.map((p) => {
            /* the seller's public face — a studio's page, or the artist the page
               belongs to (`/artist/{id}` lands on their profile, R24) */
            const sellerHref = p.businessType === "studio" ? `/studio/${p.businessId}` : `/artist/${p.businessId}`;
            const unpaid = p.status === "pending_payment";
            const word = unpaid ? "UNPAID" : p.status === "used_up" ? "USED UP" : p.status === "cancelled" ? "CANCELLED" : "ACTIVE";
            /* ⚠⚠ A PASS CARD (3 Oct 2026, the user: *"better and bigger cards …
               each has a profile linked to it … visible with profile pic and name
               and big"*). A pass is a relationship with whoever SOLD it, so the
               studio or the artist leads at a profile's size and is a door to
               their page (28 Sep made the face the row's lead; this makes it the
               card's). Then the membership itself, its figures, the bar that is
               the whole point of one, where it went — and the buttons apart. */
            return (
              <ToolCard key={p.passId} testId="my-pass">
                <ToolHead
                  tint={TINT}
                  name={p.businessName}
                  photoPath={sellerPhotos[p.businessId] ?? null}
                  href={sellerHref}
                  hrefLabel={`${p.businessName} — open the page`}
                  eyebrow={`Sold by ${p.businessType === "studio" ? "a studio" : "an artist"}`}
                  sub="Your membership"
                  right={<ToolChip word={word} fg={p.status === "active" ? "#22C55E" : unpaid ? "#F59E0B" : SUB} bg={p.status === "active" ? "#22C55E1c" : unpaid ? "#F59E0B1c" : "var(--el)"} />}
                />
                <ToolBody>
                  <ToolTitle kicker="Membership">{p.name}</ToolTitle>
                  <ToolFacts
                    tint={TINT}
                    style={{ marginTop: 10 }}
                    items={[
                      { label: "Size", value: unitWord(p.unit, p.unitsTotal) },
                      { label: "Used", value: p.unitsUsed },
                      { label: "Left", value: Math.max(0, p.unitsTotal - p.unitsUsed), tint: p.status === "active" ? "#22C55E" : undefined },
                    ]}
                  />
                  {unpaid ? null : (
                    <>
                      <ProgressBar used={p.unitsUsed} total={p.unitsTotal} tint={TINT} testId="pass-progress" />
                      <SpentOn uses={usesByPass[p.passId] ?? []} unit={p.unit} />
                    </>
                  )}
                </ToolBody>
                <ToolActions>
                  {unpaid ? (
                    <button type="button" disabled={pending} onClick={() => payFor(p)} style={toolBtn("primary", TINT)}>
                      Pay {rupees(p.priceInr)}
                    </button>
                  ) : null}
                  <Link href={sellerHref} style={toolBtn(unpaid ? "secondary" : "tinted", TINT)}>
                    {p.businessType === "studio" ? "Studio page" : "Artist page"}
                  </Link>
                </ToolActions>
              </ToolCard>
            );
          })}
          {passes.length === 0 ? (
            <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
              No memberships yet. A studio or an artist sells them on their profile page —{" "}
              <Link href="/discover" style={{ color: "#5AC8FA", fontWeight: 800 }}>
                find one
              </Link>
              .
            </div>
          ) : null}
        </>
      ) : (
        <>
          {selling.map((m) => (
            /* ⚠⚠ A MEMBERSHIP ON SALE (3 Oct 2026): the SELLER leads — the studio
               or the artist whose membership it is, at a profile's size — then the
               membership's own name, the four facts a seller reads it by, the bar
               of what was sold that has been danced, and the door to its usage on a
               bar of its own. The whole card still opens the usage page under the
               name it has always had. */
            <ToolCard key={m.id} testId="selling-membership" href={`/memberships/${m.id}`} hrefLabel={`Open ${m.name}`}>
              <ToolHead
                tint={TINT}
                name={seller?.name ?? business?.name ?? "You"}
                photoPath={seller?.photoPath ?? null}
                eyebrow={`On sale · ${seller?.kind === "artist" ? "your artist page" : "your studio"}`}
                sub={`${rupees(m.revenueInr)} taken`}
                right={m.status === "draft" ? <ToolChip word="DRAFT" fg={SUB} bg="var(--el)" /> : <ToolChip word="ON SALE" fg="#22C55E" bg="#22C55E1c" />}
              />
              <ToolBody>
                <ToolTitle kicker="Membership">{m.name}</ToolTitle>
                <ToolFacts
                  tint={TINT}
                  style={{ marginTop: 10 }}
                  items={[
                    { label: "Price", value: m.priceInr === 0 ? "Free" : rupees(m.priceInr) },
                    { label: "Size", value: unitWord(m.unit, m.units) },
                    { label: "Sold", value: <>{m.sold}<span style={{ fontSize: 10, color: SUB, fontWeight: 700 }}>/{m.totalCount}</span></>, testId: "membership-sold" },
                    { label: "Active", value: m.active },
                  ]}
                />
                {/* how much of what was SOLD has actually been danced — the seller's own bar */}
                {m.unitsSold > 0 ? <ProgressBar used={m.unitsUsed} total={m.unitsSold} tint="#8B5CF6" testId="selling-progress" /> : null}
              </ToolBody>
              <ToolActions>
                <Link href={`/memberships/${m.id}`} style={toolBtn("tinted", TINT)}>
                  Usage &amp; holders ›
                </Link>
              </ToolActions>
            </ToolCard>
          ))}
          {/* ⚠⚠ `&& !open` USED TO BE HERE, AND IT WAS TWO BUGS (found 21 Sep 2026
              by a PAGEERROR on the studio's brand-new desk, which is empty by
              definition). `open` is not a variable in this file — it resolved to
              `window.open`, a function and therefore truthy, so `!open` was
              ALWAYS false and this empty state could never be drawn: a seller
              with nothing on sale got cards, no words, nothing. And on the
              SERVER there is no `window`, so the identifier was undefined and
              the server render of this component threw — React #419, "the server
              could not finish this Suspense boundary", recovered by re-rendering
              on the client, which is why it looked fine and only a page-error
              listener ever saw it. It is a leftover from when the form expanded
              inside this desk behind an `open` flag (21 Sep, the form left for
              `/memberships/new` and took the state with it). */}
          {selling.length === 0 ? (
            <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
              Nothing on sale yet. A membership is four things — a name, how many classes or hours, a price, and how many you will sell.
            </div>
          ) : null}
        </>
      )}
      </DeskBody>

      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 40 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
