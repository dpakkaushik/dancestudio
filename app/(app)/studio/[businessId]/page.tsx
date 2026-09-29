import { PublicBusinessPage } from "@/features/profiles/components/PublicBusinessPage";

export default async function Page({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <PublicBusinessPage businessId={businessId} expect="studio" />;
}
