import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PREFS, groupMap, type AppNotification, type NotificationKind, type NotificationPrefs } from "@/types/notification";

/** Step 24's reads and writes, grouped by app area since 11 Oct 2026
 *  (`20261019090000`). Notifications are raised by triggers, so nothing here
 *  inserts one. Every query says `user_id = auth.uid()` out loud even though
 *  the policy says the same — RLS is a ceiling, not a scope. */

const MAX_LIST = 200;

interface Row {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

interface PrefsRow {
  kinds: Record<string, unknown> | null;
  /** ⚠ added by `20261019090000` — tolerated missing, so a read before the
   *  apply is every group on rather than an error */
  push_kinds?: Record<string, unknown> | null;
  push: boolean | null;
}

const toNotification = (r: Row): AppNotification => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  href: r.href,
  readAt: r.read_at,
  createdAt: r.created_at,
});

/** The signed-in person's live notifications, newest first — New and Earlier
 *  are the same list split on `read_at`. */
export async function findMyNotifications(supabase: SupabaseClient): Promise<AppNotification[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`notifications.findMine failed: ${error.message}`);
  }
  return ((data ?? []) as Row[]).map(toNotification);
}

/** The bell's badge — one number, through the aggregate function (which leaves
 *  out a group switched off "here"). */
export async function findMyUnreadCount(supabase: SupabaseClient): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return 0;
  }
  const { data, error } = await supabase.rpc("my_unread_notifications");
  if (error) {
    /* the bell is decoration on a broken read — never the reason a page 500s */
    return 0;
  }
  return Number(data ?? 0);
}

/** The prefs row, made on first read so a person always has one. */
export async function findMyNotificationPrefs(supabase: SupabaseClient): Promise<NotificationPrefs> {
  const { data, error } = await supabase.rpc("my_notification_prefs");
  if (error || !data) {
    return DEFAULT_PREFS;
  }
  const row = data as PrefsRow;
  return {
    kinds: groupMap(row.kinds),
    pushKinds: groupMap(row.push_kinds),
    push: row.push !== false,
  };
}

/** ⚠ WhatsApp and email are passed as null — "leave them as they are"; the app
 *  no longer shows either. */
export async function setNotificationPrefs(supabase: SupabaseClient, prefs: NotificationPrefs): Promise<void> {
  const { error } = await supabase.rpc("set_notification_prefs", {
    p_kinds: prefs.kinds,
    p_push: prefs.push,
    p_whatsapp: null,
    p_email: null,
    p_push_kinds: prefs.pushKinds,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function markNotificationsRead(supabase: SupabaseClient, input: { ids?: string[]; kind?: NotificationKind }): Promise<number> {
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: input.ids ?? null, p_kind: input.kind ?? null });
  if (error) {
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}

/** "Clear" HIDES: the RPC soft-deletes, so nothing is erased. */
export async function clearNotifications(supabase: SupabaseClient, input: { ids?: string[]; kind?: NotificationKind }): Promise<number> {
  const { data, error } = await supabase.rpc("clear_notifications", { p_ids: input.ids ?? null, p_kind: input.kind ?? null });
  if (error) {
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}
