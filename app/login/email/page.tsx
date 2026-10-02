import { PasswordSignIn } from "@/features/auth/components/PasswordSignIn";
import { leaveIfSignedIn } from "@/lib/auth/leaveIfSignedIn";

/** Sign in — email + password (7 Sep 2026).
 *
 *  The route keeps its name from when this was the magic-link screen: it is
 *  named for the CHANNEL, email rather than the phone channel that was deleted,
 *  and mobile auth is a later phase. `error` carries the message from a bounced
 *  link so it lands where the person can act on it. */
export default async function EmailLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await leaveIfSignedIn();
  const { error } = await searchParams;
  return <PasswordSignIn initialError={error ?? null} />;
}
