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
import type { MembershipWithUsage, MyPass, PassUse } from "@/repositories/memberships";
import { ProgressBar, SpentOn, expiryWords, unitWord, validityWords } from "./usage-kit";

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

/* ⚠ `ProgressBar`, `SpentOn` and `unitWord` MOVED to `usage-kit.tsx` (3 Oct
   2026) — a plain module, so the server-rendered usage page and the student page
   draw the same bar as this client desk without importing a client module. */

/** the one line under a membership's name that says what it is and what it
 *  costs — said ONCE, so no tile below repeats it (3 Oct 2026) */
function MetaLine({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginTop: 4 }}>{children}</div>;
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
            /* ⚠ EXPIRED is read off the date (3 Oct 2026) — an expired pass is still
               `active` in the database, and spends nothing */
            const expired = p.status === "active" && p.expired;
            const word = unpaid ? "UNPAID" : expired ? "EXPIRED" : p.status === "used_up" ? "USED UP" : p.status === "cancelled" ? "CANCELLED" : "ACTIVE";
            const live = p.status === "active" && !expired;
            const until = expiryWords(p);
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
                  right={<ToolChip word={word} fg={live ? "#22C55E" : unpaid ? "#F59E0B" : expired ? "#F87171" : SUB} bg={live ? "#22C55E1c" : unpaid ? "#F59E0B1c" : expired ? "#F871711c" : "var(--el)"} />}
                />
                <ToolBody>
                  {/* ⚠ SAID ONCE (3 Oct 2026, the user: "price and classes should not
                      be repeated and fitted properly in card"): the size and the price
                      are one line under the name, and the bar carries used and left —
                      the Size / Used / Left tiles said the bar's numbers a second time
                      and cramped "10 classes" into a third of the card */}
                  <ToolTitle kicker="Membership">{p.name}</ToolTitle>
                  {/* an UNPAID pass carries its price on the Pay button below, so the
                      line names only what it is worth */}
                  <MetaLine>
                    {unitWord(p.unit, p.unitsTotal)}
                    {unpaid ? "" : ` · ${p.priceInr === 0 ? "Free" : `${rupees(p.priceInr)} paid`}`}
                  </MetaLine>
                  {/* how long it lasts — "valid till 2 Nov 2026", or in red once gone */}
                  {until ? (
                    <div data-testid="pass-validity" style={{ fontSize: 11, fontWeight: 800, color: expired ? "#F87171" : SUB, marginTop: 3 }}>
                      {until.charAt(0).toUpperCase() + until.slice(1)}
                    </div>
                  ) : null}
                  {unpaid ? null : (
                    <>
                      <ProgressBar used={p.unitsUsed} total={p.unitsTotal} tint={TINT} unit={p.unit} testId="pass-progress" />
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
                right={m.status === "draft" ? <ToolChip word="DRAFT" fg={SUB} bg="var(--el)" /> : <ToolChip word="ON SALE" fg="#22C55E" bg="#22C55E1c" />}
              />
              <ToolBody>
                {/* ⚠ SAID ONCE (3 Oct 2026): the price and the size are ONE line under
                    the name, where they were tiles — four tiles in a phone's width put
                    "10 classes" in a box too narrow for it — and what came in is a
                    tile of its own instead of the head's sub-line */}
                <ToolTitle kicker="Membership">{m.name}</ToolTitle>
                <MetaLine>
                  {m.priceInr === 0 ? "Free" : rupees(m.priceInr)} · {unitWord(m.unit, m.units)}
                  {validityWords(m.validityDays) ? ` · ${validityWords(m.validityDays)}` : ""}
                </MetaLine>
                <ToolFacts
                  tint={TINT}
                  style={{ marginTop: 10 }}
                  items={[
                    { label: "Sold", value: <>{m.sold}<span style={{ fontSize: 10, color: SUB, fontWeight: 700 }}>/{m.totalCount}</span></>, testId: "membership-sold" },
                    { label: "Active", value: m.active },
                    { label: "Taken", value: rupees(m.revenueInr) },
                  ]}
                />
                {/* how much of what was SOLD has actually been danced — the seller's own bar */}
                {m.unitsSold > 0 ? <ProgressBar used={m.unitsUsed} total={m.unitsSold} tint="#8B5CF6" unit={m.unit} leftWord="still owed" usedWord="danced" testId="selling-progress" /> : null}
              </ToolBody>
              <ToolActions>
                {/* ⚠ "MEMBERSHIP DETAILS" (3 Oct 2026, the user: "Usage & Holders to
                    be called Membership Details") */}
                <Link href={`/memberships/${m.id}`} style={toolBtn("tinted", TINT)}>
                  Membership details ›
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
              Nothing on sale yet. A membership is four things — a name, how many hours, a price, and how many you will sell.
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
