import { redirect } from "next/navigation";
import { OtpVerify } from "@/features/auth/components/OtpVerify";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone } = await searchParams;
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    redirect("/login/phone");
  }
  return <OtpVerify phone={phone} />;
}
