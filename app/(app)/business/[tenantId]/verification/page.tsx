import { redirect } from "next/navigation";
import { BizPage } from "@/features/settings/components/settings-kit";
import { StudioVerificationStrip } from "@/features/tenants/components/StudioVerificationStrip";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findStudioVerificationStates, type StudioVerificationState } from "@/repositories/studioVerification";
import { findMyMemberships } from "@/repositories/tenants";

/** GETTING THIS STUDIO VERIFIED — a page of its own (21 Sep 2026, the user:
 *  "Studio-Invoices subscription and refunds to be managed from settings", and
 *  their answer that all four move there).
 *
 *  ⚠ WHY THIS ROUTE EXISTS AT ALL. The form has moved three times and never had
 *  an address: it was a strip under each studio on the hub (11 Sep), then one
 *  card per studio (15 Sep), then a block on the studio's own home (21 Sep,
 *  this morning). Settings is a sheet of TILES, and a tile opens something — so
 *  the one thing on that list which is a FORM rather than a ledger needed a page
 *  to be opened. Now it has one, and the form itself is unchanged: the same
 *  `StudioVerificationStrip` that carried the links, the photos and the one
 *  Submit, which is what the admin's queue reads.
 *
 *  ⚠ OWNER-ONLY, and checked here rather than trusted from the sheet: a trainer
 *  cannot file a verification (`request_studio_verification` is the owner's),
 *  so a trainer who types this address is sent back to the studio rather than
 *  shown a form that would be refused. */
export default async function StudioVerificationPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* membership is the spine — `findMyMemberships` says user_id = auth.uid() out loud */
  const membership = (await findMyMemberships(supabase)).find((m) => m.tenant.id === tenantId);
  if (!membership || membership.tenant.type !== "studio") {
    redirect("/business");
  }
  if (membership.memberRole !== "owner") {
    redirect(`/business/${tenantId}`);
  }
  const { tenant } = membership;

  const states = await findStudioVerificationStates(supabase, [{ id: tenantId, verifiedAt: tenant.verifiedAt ?? null }]).catch(
    () => ({}) as Record<string, StudioVerificationState>
  );
  const state = states[tenantId] ?? null;

  /* ⚠ `BizPage`, not `DeskHero` — this is a SETTINGS screen now, and it wears
     what Subscription, Invoices, Payments and Refunds wear. `DeskHero` titles
     itself from `DOS_TOOLS[tool].name`, so using it would have meant inventing a
     fourteenth tool colour for something that is on nobody's grid (R20 spent a
     whole pass making those thirteen distinguishable). */
  return (
    <BizPage title="Verification" sub={tenant.name} grad="linear-gradient(135deg,#0EA5E9,#2563EB)">
      {state ? (
        <StudioVerificationStrip tenant={tenant} orgId={user.id} state={state} />
      ) : (
        /* the read failed rather than answered — say so instead of drawing an
           empty form that would file nothing */
        <div style={{ fontSize: 12, color: "var(--sub)", fontWeight: 700 }}>
          Where this studio stands could not be read just now. Try again in a moment.
        </div>
      )}
    </BizPage>
  );
}
