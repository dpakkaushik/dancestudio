import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { VerificationQueue } from "@/features/admin/components/VerificationQueue";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin, findOrganizations, findVerificationQueue } from "@/repositories/admin";

export const metadata: Metadata = { title: "Verification queue — DanceOS" };

const stampNowIso = (): string => new Date().toISOString();

/** /admin/verifications — the platform admin's queue (8 Sep 2026). A stranger
 *  gets a 404, not a 403: that the page exists is not theirs to learn. The RLS
 *  behind the reads would return them nothing anyway; the guard is the app's
 *  own decision on top of that ceiling. */
export default async function VerificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  if (!(await amIPlatformAdmin(supabase))) {
    notFound();
  }
  const [queue, orgs] = await Promise.all([findVerificationQueue(supabase), findOrganizations(supabase)]);
  return <VerificationQueue queue={queue} orgs={orgs} nowIso={stampNowIso()} />;
}
