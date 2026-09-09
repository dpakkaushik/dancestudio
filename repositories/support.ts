import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRole } from "@/types/profile";

/** Support threads — one conversation between an account and DanceOS
 *  (10 Sep 2026). Both sides read through the same two functions: an admin
 *  sees every thread, an account only its own, and the database decides which
 *  by RLS rather than by anything said here. `unread` always counts the OTHER
 *  side's messages since the caller last read, so the same row tells an
 *  organization and an admin different, correct numbers. */

export type ThreadStatus = "open" | "closed";
export type ThreadKind = "general" | "verification";

export interface SupportThread {
  id: string;
  accountId: string;
  accountName: string;
  accountRole: ProfileRole;
  accountAvatarPath: string | null;
  subject: string;
  kind: ThreadKind;
  status: ThreadStatus;
  /** the verification request this conversation is about, when it is one */
  requestId: string | null;
  lastMessageAt: string;
  lastBody: string | null;
  lastFromAdmin: boolean | null;
  /** the caller's own unread count — the other side's messages since they read */
  unread: number;
  messages: number;
  createdAt: string;
}

export interface SupportMessage {
  id: string;
  authorId: string;
  /** stamped at write time, so the transcript reads right even if an admin leaves */
  fromAdmin: boolean;
  body: string;
  createdAt: string;
}

interface ThreadRow {
  id: string;
  account_id: string;
  account_name: string;
  account_role: ProfileRole;
  account_avatar_path: string | null;
  subject: string;
  kind: ThreadKind;
  status: ThreadStatus;
  request_id: string | null;
  last_message_at: string;
  last_body: string | null;
  last_from_admin: boolean | null;
  unread: number;
  messages: number;
  created_at: string;
}

const toThread = (r: ThreadRow): SupportThread => ({
  id: r.id,
  accountId: r.account_id,
  accountName: r.account_name,
  accountRole: r.account_role,
  accountAvatarPath: r.account_avatar_path,
  subject: r.subject,
  kind: r.kind,
  status: r.status,
  requestId: r.request_id,
  lastMessageAt: r.last_message_at,
  lastBody: r.last_body,
  lastFromAdmin: r.last_from_admin,
  unread: Number(r.unread ?? 0),
  messages: Number(r.messages ?? 0),
  createdAt: r.created_at,
});

/** Every thread the caller may see, open ones first, newest reply first. */
export async function findSupportThreads(supabase: SupabaseClient): Promise<SupportThread[]> {
  const { data, error } = await supabase.rpc("support_thread_list");
  if (error) {
    throw new Error(`support.threads failed: ${error.message}`);
  }
  return ((data ?? []) as ThreadRow[]).map(toThread);
}

/** One thread with its transcript, or null when it is not the caller's to read
 *  (RLS answers nothing rather than refusing — the honest answer for both a bad
 *  id and somebody else's conversation). */
export async function findSupportThread(
  supabase: SupabaseClient,
  threadId: string
): Promise<{ thread: SupportThread; messages: SupportMessage[] } | null> {
  const threads = await findSupportThreads(supabase);
  const thread = threads.find((t) => t.id === threadId);
  if (!thread) {
    return null;
  }
  const { data, error } = await supabase
    .from("support_messages")
    .select("id, author_id, from_admin, body, created_at")
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    throw new Error(`support.messages failed: ${error.message}`);
  }
  const messages = ((data ?? []) as Array<{ id: string; author_id: string; from_admin: boolean; body: string; created_at: string }>).map((m) => ({
    id: m.id,
    authorId: m.author_id,
    fromAdmin: m.from_admin,
    body: m.body,
    createdAt: m.created_at,
  }));
  return { thread, messages };
}

/** How many messages are waiting on the caller, across every thread — the
 *  number the hub's door and the admin nav wear. */
export async function countSupportUnread(supabase: SupabaseClient): Promise<number> {
  try {
    const threads = await findSupportThreads(supabase);
    return threads.reduce((n, t) => n + t.unread, 0);
  } catch {
    /* a badge is decoration on somebody's actual work — never an error page */
    return 0;
  }
}

export async function openSupportThread(
  supabase: SupabaseClient,
  input: { subject: string; body: string; requestId?: string | null }
): Promise<string> {
  const { data, error } = await supabase.rpc("open_support_thread", {
    p_subject: input.subject,
    p_body: input.body,
    p_request_id: input.requestId ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}

export async function adminOpenSupportThread(
  supabase: SupabaseClient,
  input: { accountId: string; subject: string; body: string }
): Promise<string> {
  const { data, error } = await supabase.rpc("admin_open_support_thread", {
    p_account_id: input.accountId,
    p_subject: input.subject,
    p_body: input.body,
  });
  if (error) {
    throw new Error(error.message);
  }
  return data as string;
}

export async function postSupportMessage(supabase: SupabaseClient, threadId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("post_support_message", { p_thread_id: threadId, p_body: body });
  if (error) {
    throw new Error(error.message);
  }
}

export async function markSupportRead(supabase: SupabaseClient, threadId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_support_read", { p_thread_id: threadId });
  if (error) {
    /* reading is not the errand: a failed stamp must not blank the transcript */
    return;
  }
}

export async function setSupportThreadStatus(
  supabase: SupabaseClient,
  threadId: string,
  status: ThreadStatus
): Promise<void> {
  const { error } = await supabase.rpc("set_support_thread_status", { p_thread_id: threadId, p_status: status });
  if (error) {
    throw new Error(error.message);
  }
}
