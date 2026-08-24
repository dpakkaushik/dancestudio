import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyTenants } from "@/repositories/tenants";

export default async function NewClassPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tenants = await findMyTenants(supabase);
  if (!tenants.some((t) => t.id === tenantId)) {
    redirect("/business");
  }

  return <ClassForm tenantId={tenantId} />;
}
