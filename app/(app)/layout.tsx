import type { ReactNode } from "react";
import { AppChrome } from "@/features/shell/components/AppChrome";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amIPlatformAdmin } from "@/repositories/admin";
import { findMyUnreadCount } from "@/repositories/notifications";
import { findProfileById } from "@/repositories/profiles";

/** Every signed-in surface lives in this group and wears the app chrome (top bar +
 *  tab bar). Auth screens (/login, /onboarding, /auth) stay outside it.
 *
 *  The bell's badge is counted here, once per render of the group, so every route
 *  under it carries the same number without asking for it (Step 24). A failed
 *  count is zero, never an error page — the bell is decoration on somebody's
 *  actual work. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  /* a platform admin with no profile is ADMIN ONLY (9 Sep 2026): the chrome draws
     no tab bar and no bell for it — every tab needs a profile, and the queue is
     its whole app. One profile read per render; the admin check only when the
     row is missing. */
  const profile = user ? await findProfileById(supabase, user.id) : null;
  const adminOnly = Boolean(user) && !profile && (await amIPlatformAdmin(supabase));
  const unread = adminOnly ? 0 : await findMyUnreadCount(supabase);
  return (
    <AppChrome unread={unread} adminOnly={adminOnly}>
      {children}
    </AppChrome>
  );
}
