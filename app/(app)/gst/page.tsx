import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GstCard } from "@/features/orgs/components/GstCard";
import { BizPage } from "@/features/settings/components/settings-kit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyGst } from "@/repositories/gst";
import { findProfileById } from "@/repositories/profiles";

export const metadata: Metadata = { title: "GST number — DanceOS" };

/** /gst — THE ORGANIZATION'S GST NUMBER, ON ITS OWN SCREEN (11 Sep 2026).
 *
 *  The user: *"GST verification step is showing here at the org main screen and
 *  that['s] stupid — better make it one of the options in Settings where the org
 *  user can click and enter the GST, a one-time option… when a user goes [to
 *  events] without verification of GST it should redirect the user to this
 *  settings tab where he can do GST verification."*
 *
 *  So it is a screen, not a card on Home: reached from Settings' own row, and
 *  the place the events desk sends anybody who has not done it yet. A screen can
 *  be linked to and redirected to; a card inside a modal cannot, which is the
 *  practical reason this is a route and not another sheet.
 *
 *  `?from=events` is what the events desk adds, and all it changes is one line
 *  of copy — the screen says why the person is standing here rather than making
 *  them work it out. */
export default async function GstPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    redirect("/onboarding");
  }
  /* a GST number belongs to a business; a person has no use for this screen */
  if (profile.role !== "org") {
    redirect("/");
  }
  const { from } = await searchParams;
  const gst = await findMyGst(supabase, user.id);

  return (
    <BizPage title="GST number" sub="one number, entered once · it opens events" grad="linear-gradient(135deg,#64748B,#0EA5E9)">
      <GstCard gstin={gst.gstin} verifiedAt={gst.verifiedAt} cameForEvents={from === "events"} />
    </BizPage>
  );
}
