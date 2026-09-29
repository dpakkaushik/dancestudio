import { PublicTenantPage } from "@/features/profiles/components/PublicTenantPage";

export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <PublicTenantPage businessId={businessId} expect="studio" />;
}
