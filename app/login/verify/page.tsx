import { redirect } from "next/navigation";
import { OtpVerify } from "@/features/auth/components/OtpVerify";
import { isOtpChannel } from "@/lib/auth/otpChannel";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; via?: string }>;
}) {
  const { phone, via } = await searchParams;
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    redirect("/login/phone");
  }
  return <OtpVerify phone={phone} via={isOtpChannel(via) ? via : "sms"} />;
}
