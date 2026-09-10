import type { Metadata } from "next";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { CommunicationDesk } from "@/features/admin/components/CommunicationDesk";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { findAdminCommunication, findAdminRecentNotifications } from "@/repositories/adminPanel";

export const metadata: Metadata = { title: "Communication — DanceOS admin" };

const KINDS = ["enquiry", "booking", "money", "people", "event", "class"];

/** /admin/communication — what the platform has been saying, and hearing back
 *  (11 Sep 2026). Answering a conversation stays on Support; this is the view
 *  of the whole channel, which nothing had before. */
export default async function AdminCommunicationPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { supabase, badges, nowIso } = await requireAdmin();
  const params = await searchParams;
  const kind = params.kind && KINDS.includes(params.kind) ? params.kind : null;

  const [pulse, recent] = await Promise.all([
    findAdminCommunication(supabase),
    findAdminRecentNotifications(supabase, { kind, limit: 40 }),
  ]);

  return (
    <AdminShell badges={badges}>
      <CommunicationDesk
        pulse={pulse.rows}
        recent={recent.rows}
        kind={kind ?? "all"}
        needsMigration={pulse.needsMigration}
        nowIso={nowIso}
      />
    </AdminShell>
  );
}
