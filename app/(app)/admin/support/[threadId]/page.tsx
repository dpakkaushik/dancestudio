import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/features/admin/components/AdminShell";
import { requireAdmin } from "@/features/admin/server/adminGuard";
import { SupportConversation } from "@/features/support/components/SupportConversation";
import { findSupportThread, markSupportRead } from "@/repositories/support";

export const metadata: Metadata = { title: "Conversation — DanceOS admin" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /admin/support/[threadId] — the admin's side of one conversation. Opening it
 *  IS reading it, so the admin's read stamp moves here rather than needing a
 *  button; the account's unread count is untouched by that. */
export default async function AdminThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!UUID_RE.test(threadId)) {
    notFound();
  }
  const { supabase, badges, nowIso } = await requireAdmin();
  const found = await findSupportThread(supabase, threadId);
  if (!found) {
    notFound();
  }
  await markSupportRead(supabase, threadId);
  return (
    <AdminShell badges={badges}>
      <SupportConversation thread={found.thread} messages={found.messages} isAdmin nowIso={nowIso} />
    </AdminShell>
  );
}
