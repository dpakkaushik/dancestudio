import { PhoneSignIn } from "@/features/auth/components/PhoneSignIn";
import { preferredOtpChannel } from "@/lib/auth/otpChannel";

export default async function PhoneLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  /* Step 26: the switches live in the environment, so the screen can say what
     will actually happen. A real number can only receive a code once the project
     has Twilio credentials — until then AUTH_OTP_LIVE_NUMBERS stays unset and the
     screen says so instead of promising a message nobody will get. */
  return (
    <PhoneSignIn
      initialError={error ?? null}
      otpChannel={preferredOtpChannel()}
      liveNumbers={(process.env.AUTH_OTP_LIVE_NUMBERS ?? "").trim().toLowerCase() === "true"}
    />
  );
}
