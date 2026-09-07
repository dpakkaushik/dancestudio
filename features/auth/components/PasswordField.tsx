"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A password input with a reveal toggle, used by sign-up, sign-in and reset.
 *
 *  WHY A REVEAL TOGGLE. A masked field with an 8-character minimum on a phone
 *  keyboard is the single most common reason a password is mistyped twice and
 *  the person gives up. Showing it is the accessible answer, and it is under
 *  the person's control rather than on by default.
 *
 *  The button is `tabIndex={-1}` and aria-hidden's nothing: it is reachable by
 *  screen reader and by touch, but it is skipped in the tab order so that Tab
 *  from the field goes to the next field or the submit button, which is what
 *  somebody filling a form in expects. */
export function PasswordField({
  name,
  label,
  value,
  onChange,
  onBlur,
  problem,
  autoComplete,
  autoFocus = false,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  problem?: string | null;
  /** "new-password" when choosing one, "current-password" when proving one — the
   *  difference is what tells a password manager to offer to generate vs fill. */
  autoComplete: "new-password" | "current-password";
  autoFocus?: boolean;
  hint?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className="mb-3.5">
      <Label htmlFor={fieldId} className="mb-2 text-xs tracking-[0.5px]">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={fieldId}
          name={name}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          enterKeyHint="go"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={Boolean(problem)}
          aria-describedby={problem ? errorId : hint ? hintId : undefined}
          className="pr-11 tracking-[0.2px]"
          autoFocus={autoFocus}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setRevealed((shown) => !shown)}
          aria-label={revealed ? "Hide password" : "Show password"}
          data-slot="reveal"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[14px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[2.5px] focus-visible:ring-ring focus-visible:outline-none"
        >
          {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>

      {problem ? (
        <p id={errorId} role="alert" className="mt-2 text-[12px] font-bold text-destructive">
          {problem}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-2 text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
