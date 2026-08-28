import { PublicTenantPage } from "@/features/profiles/components/PublicTenantPage";

export default async function Page({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return <PublicTenantPage tenantId={tenantId} expect="trainer_business" />;
}
