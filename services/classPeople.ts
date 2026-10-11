import type { SupabaseClient } from "@supabase/supabase-js";
import { askClassPerson, findClassPeopleByClass, setClassPersonPay, withdrawClassAsk } from "@/repositories/classPeople";

/** What the class form says about WHO IS TAKING IT. Since 18 Sep 2026 that is
 *  the only person the form names: the teacher, anyone on DanceOS (the RPC
 *  refuses an organization account and re-checks the caller is the owner).
 *  Assistants are not the form's business any more — they are added from the
 *  class page, by the owner or the teacher.
 *
 *  `artistPayInr` is only ever sent by an OWNER — the RPCs refuse a rate from
 *  anybody else. ⚠ The class form sends none since 11 Oct 2026: pay is off the
 *  form, and `ask_class_person` gives an ask with no rate the SEAT's own
 *  (`business_members.pay_per_session_inr`). */
export interface ClassPeopleIntent {
  artistUserId: string | null;
  artistPayInr?: number;
}

/** Make the class's TEACHER match what the form asked for.
 *
 *  The form states an intent; the classPerson is the record. Reconciling rather than
 *  re-asking matters because a classPerson carries CONSENT: somebody who already said
 *  yes must not be asked again just because the owner re-saved the form. So:
 *    · the same person still named keeps their answer; only the rate may move
 *    · a different person named: the old ask is withdrawn, the new person ASKED
 *    · nobody named: the old ask is withdrawn (the class waits for a teacher)
 *
 *  ⚠⚠ UNLESS THE CLASS ITSELF CHANGED (11 Oct 2026, the user: "if anything has
 *  been edited should send a new request for confirmation"). A yes was a yes to
 *  a time and a place (since 11 Oct 2026 only those — the start, the end, the
 *  room, the studio, the map link; the action decides); when one moves, `reconfirm` is
 *  true and everybody on the class who is not the person saving it is ASKED
 *  AGAIN — the teacher with their rate and register job, every assistant with
 *  their powers. `ask_class_person` closes the old row and opens a fresh one, so
 *  consent is never inherited and each of them is notified. A draft cannot be
 *  published until they say yes again (`classes_publish_needs_a_yes`); a
 *  published class stays on sale for the people already booked. */
export async function reconcileClassPeople(
  supabase: SupabaseClient,
  classId: string,
  intent: ClassPeopleIntent | null,
  opts: { reconfirm?: boolean; meId?: string; keepRates?: boolean } = {}
): Promise<void> {
  const current = await findClassPeopleByClass(supabase, classId);
  const teacher = current.find((c) => c.kind === "artist") ?? null;
  const reask = (p: (typeof current)[number], pay?: number) =>
    askClassPerson(supabase, {
      classId,
      userId: p.userId,
      kind: p.kind,
      canAttendance: p.canAttendance,
      canRefunds: p.canRefunds,
      // 11 Oct 2026: the OWNER's re-ask keeps the rate this class already pays;
      // anybody else's sends none and the seat's own rate is used, because the
      // RPC refuses a rate from anybody but the owner.
      payPerSessionInr: pay ?? (opts.keepRates ? p.payPerSessionInr : 0),
    });

  if (opts.reconfirm) {
    for (const a of current.filter((c) => c.kind === "assistant" && c.userId !== opts.meId && c.status !== "rejected")) {
      await reask(a);
    }
  }

  if (!intent) {
    if (opts.reconfirm && teacher && teacher.userId !== opts.meId) await reask(teacher);
    return;
  }

  if (teacher && teacher.userId === intent.artistUserId) {
    if (opts.reconfirm && teacher.userId !== opts.meId) {
      await reask(teacher, intent.artistPayInr);
      return;
    }
    // a rate change alone is not a re-ask, and it only moves sessions that have
    // not been settled — paid ones are frozen by their payout line
    if (intent.artistPayInr !== undefined && intent.artistPayInr !== teacher.payPerSessionInr) {
      await setClassPersonPay(supabase, teacher.id, intent.artistPayInr);
    }
    return;
  }
  if (teacher) {
    await withdrawClassAsk(supabase, teacher.id);
  }
  if (intent.artistUserId) {
    await askClassPerson(supabase, {
      classId,
      userId: intent.artistUserId,
      kind: "artist",
      /* the teacher takes the register by default; the owner may take it back on the class page */
      canAttendance: true,
      canRefunds: false,
      payPerSessionInr: intent.artistPayInr,
    });
  }
}
