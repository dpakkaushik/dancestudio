/** Mirrors the prototype's __DOSROLE: dancer | trainer | studio. */
export type ProfileRole = "dancer" | "trainer" | "studio";

export interface Profile {
  /** a path in the public media bucket, or null for initials on the role's metal */
  avatarPath?: string | null;
  id: string;
  fullName: string;
  role: ProfileRole;
  city: string | null;
}
