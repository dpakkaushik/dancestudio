import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeFromUrl } from "@/components/ui/WelcomeBow";
import { PlanRights } from "@/features/settings/components/PlanRights";
import { BizPage } from "@/features/settings/components/settings-kit";
import { StudioSubscriptionStrip } from "@/features/businesses/components/StudioSubscriptionStrip";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findMyStudioSubscriptions, type StudioSubscriptionState } from "@/repositories/subscriptions";
import { findMyMemberships } from "@/repositories/businesses";

export const metadata: Metadata = { title: "Subscription — DanceOS" };

/** /business/{id}/subscription — ONE STUDIO'S OWN SUBSCRIPTION (26 Sep 2026).
 *  The door a studio's owner has to that studio's mandate now that the
 *  Subscription tile is off every Settings sheet (the user: "subscriptions also
 *  become an option on home tab for all profiles and is removed from settings
 *  for all").
 *
 *  One `StudioSubscriptionStrip` — the strip with the app's one Stop renewing —
 *  for THIS studio, at ₹1,200.
 *  ⚠ The organization arm (₹5,000, GST rather than a badge) went with
 *  organizations on 29 Sep 2026.
 *
 *  ⚠ OWNER-ONLY, checked here: a teammate neither pays nor cancels, and
 *  `subscribe` would refuse them — they are sent to the business's home. */
export default async function BusinessSubscriptionPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const membership = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!membership || membership.business.type !== "studio") {
    redirect("/business");
  }
  if (membership.memberRole !== "owner") {
    redirect(`/business/${businessId}`);
  }
  const { business } = membership;
  const [states, catalog] = await Promise.all([
    findMyStudioSubscriptions(supabase, [businessId]).catch((): Record<string, StudioSubscriptionState> => ({})),
    findPlanCatalog(supabase).catch(() => []),
  ]);
  const state = states[businessId] ?? null;
  const price = pickPlan(catalog, "studio");
  const verified = Boolean(business.verifiedAt);

  return (
    /* ⚠ THE CARD SAYS WHOSE (4 Oct 2026) — the sub-line under the heading went
       with the card's design; the studio's face and name lead the card */
    <BizPage title="Subscription" tool="subscription">
      {state ? (
        <StudioSubscriptionStrip businessId={businessId} businessName={business.name} photoPath={business.photoPath ?? null} state={state} studioPrice={price} />
      ) : (
        <div style={{ fontSize: 12, color: "var(--sub)", fontWeight: 700 }}>Where this subscription stands could not be read just now. Try again in a moment.</div>
      )}
      {/* ⚠ NOT A BLOCKER ANY MORE (27 Sep 2026 — the user chose "pay at creation,
          verify after", and `20260927100000` removed `subscribe`'s two refusals).
          It said "verify first, THEN the subscription can be started here", which
          is now the opposite of what the door does. What is still true, and is
          the whole of why verification matters, is that it decides whether this
          is ever PUBLIC — so that is what it says. */}
      {!verified ? (
        <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.55, padding: "2px 2px 10px" }}>
          You can subscribe now. It goes on Discover once DanceOS has verified it — Settings › Verification — and it is listed the moment that lands.
        </div>
      ) : null}
      {/* ⚠ WHAT THE MONEY BUYS, on the screen that asks for it (27 Sep 2026, the
          user: "correct descriptions and rights you get once you subscribe for
          any of the following — artist, studio, organization"). This page had a
          price and nothing beside it; the artist's had a list that promised a
          0.9% fee nobody charges and events an artist cannot host. */}
      <PlanRights kind="studio" />
      {/* THE BOW ON CREATION (2 Oct 2026, the user: "on creation similar welcome
          message for studio and crew profiles as we get on sign up for users").
          Opened by `?welcome=studio`, which the New-studio sheet adds and
          nothing else does; presentation only — this page has already decided
          its reader is the owner. */}
      <WelcomeFromUrl
        kind="studio"
        label={`Welcome, ${business.name}`}
        emoji="🏛️"
        title={`Welcome, ${business.name}!`}
        subtitle="Your studio is on DanceOS — the floor is yours."
        pills={(business.styles ?? []).slice(0, 5).map((label) => ({ label }))}
        pillsCaption={(business.styles ?? []).length > 0 ? "what it dances" : undefined}
        note={
          <>
            Two steps to <b style={{ color: "#F5F2FA" }}>Discover</b>: DanceOS verifies it (Settings › Verification), and its own subscription — right here — puts it live.
          </>
        }
      />
    </BizPage>
  );
}
