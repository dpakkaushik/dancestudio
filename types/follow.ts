import type { TenantType } from "@/types/tenant";

/** Step 15 — follows. A person follows a business; the count is public, the
 *  list is the business's own (prototype: DOS_FOLLOWERS pill on Discover 4277,
 *  the Followers figure and sheet on the profile 10708, 11336). */

/** One business the signed-in person follows — the Following sheet's row. */
export interface FollowedTenant {
  followId: string;
  tenantId: string;
  tenantType: TenantType;
  tenantName: string;
  tenantArea: string | null;
  tenantCity: string | null;
  followedAt: string;
}

/** One person following a business — the Followers sheet's row, readable by
 *  the business's members only. */
export interface TenantFollower {
  followId: string;
  userId: string;
  name: string;
  role: "dancer" | "trainer" | "studio";
  city: string | null;
  /** the face the sheet draws — the same one a person's Followers sheet draws (B6) */
  avatarPath: string | null;
  followedAt: string;
}

/** What set_follow hands back: the state after the call and the live count. */
export interface FollowState {
  following: boolean;
  followers: number;
}
