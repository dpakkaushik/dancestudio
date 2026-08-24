import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassById } from "@/repositories/classes";
import { findMyTenants } from "@/repositories/tenants";

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ tenantId: string; classId: string }>;
}) {
  const { tenantId, classId } = await params;
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

  const danceClass = await findClassById(supabase, classId);
  if (!danceClass || danceClass.tenantId !== tenantId) {
    redirect(`/business/${tenantId}/classes`);
  }

  return <ClassForm tenantId={tenantId} existing={danceClass} />;
}
