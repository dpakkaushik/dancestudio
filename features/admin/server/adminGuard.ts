import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin, findVerificationQueue } from "@/repositories/admin";
import { findAdminReports } from "@/repositories/adminPanel";
import { findAdminSubscriptions } from "@/repositories/subscriptions";
import { findSupportThreads } from "@/repositories/support";
import type { AdminBadges } from "@/features/admin/components/AdminShell";

/** The one rule every admin screen states once (10 Sep 2026): signed in, and a
 *  platform admin, or the route does not exist. A stranger gets a 404 rather
 *  than a 403 — that the panel is there is not theirs to learn. The RLS behind
 *  every read would give them nothing anyway; this is the app's own decision on
 *  top of that ceiling.
 *
 *  It also counts what is waiting, because the nav wears those numbers on every
 *  screen and there is no point asking twice. */
export async function requireAdmin(): Promise<{ supabase: SupabaseClient; badges: AdminBadges; nowIso: string }> {
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
  const [queue, threads, reports, pastDue] = await Promise.all([
    findVerificationQueue(supabase).catch(() => []),
    findSupportThreads(supabase).catch(() => []),
    findAdminReports(supabase, { status: "open", limit: 300 }).catch(() => []),
    /* a renewal that is failing is work waiting — the owner has three days */
    findAdminSubscriptions(supabase, { status: "past_due", limit: 300 }).catch(() => []),
  ]);
  return {
    supabase,
    badges: {
      verifications: queue.length,
      support: threads.reduce((n, t) => n + t.unread, 0),
      reports: reports.length,
      money: pastDue.length,
    },
    nowIso: new Date().toISOString(),
  };
}
