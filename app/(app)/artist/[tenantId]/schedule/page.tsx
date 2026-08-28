import { PublicSchedulePage } from "@/features/profiles/components/PublicSchedulePage";

export default async function Page({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return <PublicSchedulePage tenantId={tenantId} expect="trainer_business" />;
}
