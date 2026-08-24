import type { SupabaseClient } from "@supabase/supabase-js";
import { claimPerson, findClaimsByClass, setClaimPowers, withdrawClaim } from "@/repositories/claims";

/** What the class form says about who is on a class. Ids are the studio's own
 *  team members; the RPCs re-check that, so a forged id gets nowhere. */
export interface ClassPeopleIntent {
  artistUserId: string | null;
  assistants: Array<{ userId: string; canAttendance: boolean; canRefunds: boolean }>;
}

/** Make the class's people match what the form asked for.
 *
 *  The form states an intent; the claims are the record. Reconciling rather than
 *  re-asking matters because a claim carries CONSENT: somebody who already said
 *  yes must not be asked again just because the owner re-saved the form, and
 *  somebody whose job changed must not lose their answer. So:
 *    · a person newly named is ASKED
 *    · a person still named keeps their answer, and only their job is updated
 *    · a person no longer named has their claim withdrawn
 *  Changing WHAT somebody is (artist ⇄ assistant) is a different ask, so that
 *  re-asks by design. */
export async function reconcileClassPeople(
  supabase: SupabaseClient,
  classId: string,
  intent: ClassPeopleIntent
): Promise<void> {
  const current = await findClaimsByClass(supabase, classId);

  const wanted = new Map<string, { kind: "artist" | "assistant"; canAttendance: boolean; canRefunds: boolean }>();
  if (intent.artistUserId) {
    wanted.set(intent.artistUserId, { kind: "artist", canAttendance: true, canRefunds: false });
  }
  for (const a of intent.assistants) {
    if (a.userId === intent.artistUserId) continue; // the artist is not their own assistant
    wanted.set(a.userId, {
      kind: "assistant",
      canAttendance: a.canAttendance,
      canRefunds: a.canRefunds,
    });
  }

  for (const claim of current) {
    const want = wanted.get(claim.userId);
    if (!want) {
      await withdrawClaim(supabase, claim.id);
      continue;
    }
    if (want.kind !== claim.kind) {
      // a different job entirely — ask again as the new thing
      await claimPerson(supabase, {
        classId,
        userId: claim.userId,
        kind: want.kind,
        canAttendance: want.canAttendance,
        canRefunds: want.canRefunds,
      });
    } else if (want.canAttendance !== claim.canAttendance || want.canRefunds !== claim.canRefunds) {
      // same person, same role, new powers: their answer stands
      await setClaimPowers(supabase, claim.id, want.canAttendance, want.canRefunds);
    }
    wanted.delete(claim.userId);
  }

  for (const [userId, want] of wanted) {
    await claimPerson(supabase, {
      classId,
      userId,
      kind: want.kind,
      canAttendance: want.canAttendance,
      canRefunds: want.canRefunds,
    });
  }
}
