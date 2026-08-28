import { redirect } from "next/navigation";
import { CrewsHub } from "@/features/crews/components/CrewsHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyLedCrews, findMyMemberCrews } from "@/repositories/crews";

/** The Crews hub — the crews you lead, then the crews you are in (S_crews 2691). */
export default async function CrewsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const [led, member] = await Promise.all([findMyLedCrews(supabase), findMyMemberCrews(supabase)]);
  return <CrewsHub led={led} member={member} />;
}
