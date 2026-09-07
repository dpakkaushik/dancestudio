import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DARK_THEME_VARS } from "@/lib/design/tokens";

/** Page wrapper for every auth screen (prototype `shell()`, DanceOSApp.jsx:3683-3698).
 *
 *  Auth always wears the in-app dark look (prototype line 48), so the dark
 *  palette is pinned on the root here whatever theme the rest of the app is in.
 *  Because the shadcn colour utilities in globals.css point AT these DanceOS
 *  variables, pinning them pins `bg-background`, `border-border` and the rest
 *  along with them — there is no second palette to keep in step.
 *
 *  Content flows from the top, as every prototype auth screen does, so the shell
 *  must not centre or space-between its children. A screen that wants to push
 *  something to the bottom adds its own `flex-1` spacer (see the welcome screen)
 *  rather than having the shell distribute space for every screen. */
export function AuthShell({
  children,
  toast,
  progress,
  footer,
}: {
  children: ReactNode;
  toast?: string | null;
  /** the stepped forms' bar (3692-3694): [step, of] — filled to the step you are on */
  progress?: [number, number];
  /** Anchored to the bottom edge, with the slack pushed between it and the form.
   *
   *  WHY THIS EXISTS. An auth form is short and a phone is tall, so a two-field
   *  screen ends half way down and leaves a void beneath it — which reads as a
   *  screen that failed to load rather than one that is finished. Putting the
   *  secondary action (the "no account yet?" link, the legal line) against the
   *  bottom edge gives the empty space two edges to be between, and empty space
   *  between two things is composition rather than a hole. Screens with a
   *  genuinely full form can leave this out. */
  footer?: ReactNode;
}) {
  return (
    <div
      style={DARK_THEME_VARS as React.CSSProperties}
      className={cn(
        "relative mx-auto box-border flex min-h-svh w-full max-w-[430px] flex-col",
        "bg-background font-sans text-foreground",
        "px-[22px] pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]"
      )}
    >
      {progress ? (
        <div className="mb-[22px] flex gap-1.5" aria-hidden>
          {Array.from({ length: progress[1] }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-[5px] flex-1 rounded-[3px]",
                i < progress[0] ? "bg-primary" : "bg-secondary"
              )}
            />
          ))}
        </div>
      ) : null}

      {children}

      {footer ? (
        <>
          <div className="min-h-6 flex-1" />
          <div>{footer}</div>
        </>
      ) : null}

      {toast && (
        /* role=alert so the message is announced, not just drawn — the old toast
           was a plain div, so a screen-reader user got no error at all */
        <div
          role="alert"
          aria-live="assertive"
          className={cn(
            "fixed bottom-7 left-1/2 z-40 max-w-[380px] -translate-x-1/2",
            "rounded-full border-[1.5px] border-destructive bg-[var(--el)]",
            "px-[18px] py-[11px] text-center text-[13px] font-bold text-[#FAFAFA]",
            "shadow-[0_10px_30px_-8px_rgba(0,0,0,.7)] backdrop-blur-[10px]"
          )}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
