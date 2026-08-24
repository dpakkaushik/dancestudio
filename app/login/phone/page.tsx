import { PhoneSignIn } from "@/features/auth/components/PhoneSignIn";

export default async function PhoneLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <PhoneSignIn initialError={error ?? null} />;
}
