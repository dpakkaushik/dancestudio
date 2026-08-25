import { redirect } from "next/navigation";
import { JoinInvite } from "@/features/staff/components/JoinInvite";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { previewInvite } from "@/repositories/invites";

/** /join/{code} — the shareable half of an invite, and the prototype's QR arm
 *  (18435). Signing in is required to see anything: the preview is a definer
 *  function granted to authenticated only, so an anonymous link-holder learns
 *  nothing at all. Once they are in, my_pending_invites also surfaces the same
 *  invite on Home, so a lost link is never a dead end. */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const preview = await previewInvite(supabase, code);
  return <JoinInvite code={code} preview={preview} />;
}
