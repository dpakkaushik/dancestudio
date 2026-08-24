import type { ReactNode } from "react";
import { AppChrome } from "@/features/shell/components/AppChrome";

/** Every signed-in surface lives in this group and wears the app chrome (top bar +
 *  tab bar). Auth screens (/login, /onboarding, /auth) stay outside it. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
