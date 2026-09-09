import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SupportConversation } from "@/features/support/components/SupportConversation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findSupportThread, markSupportRead } from "@/repositories/support";

export const metadata: Metadata = { title: "Your conversation — DanceOS" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stampNowIso = (): string => new Date().toISOString();

/** /support/[threadId] — the account's side of one conversation. RLS decides
 *  what comes back, so somebody else's thread is simply not found: the same
 *  answer a bad id gets, which is the honest one. An admin following this link
 *  is sent to the admin view of the same thread, where the Close control is. */
export default async function SupportThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!UUID_RE.test(threadId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/support/${threadId}`)}`);
  }
  if (await amIPlatformAdmin(supabase)) {
    redirect(`/admin/support/${threadId}`);
  }
  const found = await findSupportThread(supabase, threadId);
  if (!found) {
    notFound();
  }
  await markSupportRead(supabase, threadId);
  return <SupportConversation thread={found.thread} messages={found.messages} isAdmin={false} nowIso={stampNowIso()} />;
}
