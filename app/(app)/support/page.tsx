import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SupportThreads } from "@/features/support/components/SupportThreads";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findProfileById } from "@/repositories/profiles";
import { findSupportThreads } from "@/repositories/support";

export const metadata: Metadata = { title: "DanceOS support" };

const stampNowIso = (): string => new Date().toISOString();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /support — an account's own conversations with DanceOS. Anybody signed in
 *  with a profile may write: an organization waiting on verification, a user
 *  whose booking went wrong, a suspended account asking why. A platform admin
 *  has no side to write from and is sent to their own queue instead. */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const { request } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fsupport");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    redirect((await amIPlatformAdmin(supabase)) ? "/admin/support" : "/onboarding");
  }
  const threads = await findSupportThreads(supabase);
  /* arriving from the verification card: the new conversation is ABOUT that
     request, so the admin's decision is posted into it (10 Sep 2026) */
  const requestId = request && UUID_RE.test(request) ? request : null;
  return <SupportThreads threads={threads} isAdmin={false} nowIso={stampNowIso()} requestId={requestId} />;
}
