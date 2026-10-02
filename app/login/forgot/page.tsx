import { ForgotPassword } from "@/features/auth/components/ForgotPassword";
import { leaveIfSignedIn } from "@/lib/auth/leaveIfSignedIn";

/** "Forgot password?" from the sign-in screen — sends a recovery link. */
export default async function ForgotPasswordPage() {
  await leaveIfSignedIn();
  return <ForgotPassword />;
}
