import { redirect } from "next/navigation";
import { BusinessHub } from "@/features/tenants/components/BusinessHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyTenants } from "@/repositories/tenants";

export default async function BusinessPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const tenants = await findMyTenants(supabase);
  return <BusinessHub tenants={tenants} />;
}
