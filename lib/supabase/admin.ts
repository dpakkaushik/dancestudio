import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Service-role client — bypasses RLS. Server-only: used by the Cashfree webhook
 *  route and the server-verified checkout handshake to run the apply_* RPCs
 *  (granted to service_role alone). Never import from client components. */
export function createSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("admin client must never reach the browser");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
