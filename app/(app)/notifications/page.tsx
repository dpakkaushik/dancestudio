import { redirect } from "next/navigation";
import { NotificationsScreen } from "@/features/notifications/components/NotificationsScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyNotificationPrefs, findMyNotifications } from "@/repositories/notifications";

const stampNowIso = (): string => new Date().toISOString();

/** The notifications screen, reached from the bell in the top bar — New ·
 *  Earlier by app area since 11 Oct 2026. Notifications are raised by triggers
 *  where the facts happen, so this page only reads. `?show=new|earlier` and
 *  `?group=` are the address of what is shown. */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string; group?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const sp = await searchParams;
  const show = sp.show === "new" || sp.show === "earlier" ? sp.show : null;
  const [notifications, prefs] = await Promise.all([findMyNotifications(supabase), findMyNotificationPrefs(supabase)]);
  return <NotificationsScreen notifications={notifications} prefs={prefs} nowIso={stampNowIso()} initialColumn={show} initialGroup={sp.group ?? null} />;
}
