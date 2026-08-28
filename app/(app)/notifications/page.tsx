import { redirect } from "next/navigation";
import { NotificationsScreen } from "@/features/notifications/components/NotificationsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyNotificationPrefs, findMyNotifications } from "@/repositories/notifications";

const stampNowIso = (): string => new Date().toISOString();

/** The notifications screen — prototype S_notif (13702), reached from the bell
 *  in the top bar. Notifications are raised by triggers where the facts happen,
 *  so this page only reads. */
export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const [notifications, prefs] = await Promise.all([findMyNotifications(supabase), findMyNotificationPrefs(supabase)]);
  return <NotificationsScreen notifications={notifications} prefs={prefs} nowIso={stampNowIso()} />;
}
