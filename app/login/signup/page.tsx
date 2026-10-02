import { SignUpForm } from "@/features/auth/components/SignUpForm";
import { leaveIfSignedIn } from "@/lib/auth/leaveIfSignedIn";

/** "Start Dancing" from the welcome screen — create an account (7 Sep 2026). */
export default async function SignUpPage() {
  await leaveIfSignedIn();
  return <SignUpForm />;
}
