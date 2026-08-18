/** Mirrors the prototype's __DOSROLE: dancer | trainer | studio. */
export type ProfileRole = "dancer" | "trainer" | "studio";

export interface Profile {
  id: string;
  fullName: string;
  role: ProfileRole;
  city: string | null;
}
