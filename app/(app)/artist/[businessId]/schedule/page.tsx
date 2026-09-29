import { PublicSchedulePage } from "@/features/profiles/components/PublicSchedulePage";

export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <PublicSchedulePage businessId={businessId} expect="artist_page" />;
}
