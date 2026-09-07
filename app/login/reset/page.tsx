import { SetNewPassword } from "@/features/auth/components/SetNewPassword";

/** Where a recovery link lands once /auth/confirm has redeemed the token.
 *
 *  `error` carries the message from a recovery link that could not be redeemed,
 *  so the reason lands on the screen the person has to act on rather than being
 *  swallowed by the redirect. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <SetNewPassword initialError={error ?? null} />;
}
