import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManagedScreen } from "@/features/managed/components/ManagedScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEverythingIManage } from "@/repositories/managed";
import { parseManagedFilter } from "@/types/managed";

export const metadata: Metadata = { title: "Everything you manage — DanceOS" };

/** /managed — the prototype's S_managed behind the Home deck's "Manage" door.
 *  Signed-in only (dosGate); a person who runs nothing gets the empty room with
 *  the door to set a business up, not a redirect — the URL is honest either way. */
export default async function ManagedPage({ searchParams }: { searchParams: Promise<{ kind?: string | string[] }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const [{ kind }, { tenants, listings }] = await Promise.all([searchParams, findEverythingIManage(supabase)]);
  return <ManagedScreen tenants={tenants} listings={listings} filter={parseManagedFilter(kind)} />;
}
