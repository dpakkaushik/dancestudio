/** The "still in the door" cookie (parity audit U2). A profile ROW says there is
 *  a person; this says they have not yet pressed "Open DanceOS →". It exists
 *  because every server action that revalidates a path makes the client refetch
 *  the current route, and /onboarding used to redirect the moment a row existed
 *  — so landing the profile photo (which revalidates /profile) threw the person
 *  onto Home half-way through their own onboarding. Set by
 *  `saveProfileBasicsAction`, read by the onboarding page, cleared by
 *  `finishOnboardingAction`. Lives here rather than in the "use server" module,
 *  which may only export async functions. */
export const ONBOARDING_COOKIE = "dos_onboarding";
