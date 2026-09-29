import type { ProfileRole } from "@/types/profile";
import type { BusinessType } from "@/types/tenant";

/** Step 15 — follows. A person follows a business; the count is public, the
 *  list is the business's own (prototype: DOS_FOLLOWERS pill on Discover 4277,
 *  the Followers figure and sheet on the profile 10708, 11336). */

/** One business the signed-in person follows — the Following sheet's row.
 *  ⚠ `tenantPhotoPath` arrived 29 Sep 2026: the sheet drew a business as
 *  initials for ever while the people and crews beside it wore their faces,
 *  because the read never selected the column and the action hard-coded null. */
export interface FollowedTenant {
  followId: string;
  businessId: string;
  businessType: BusinessType;
  businessName: string;
  tenantArea: string | null;
  tenantCity: string | null;
  tenantPhotoPath: string | null;
  followedAt: string;
}

/** One person following a business — the Followers sheet's row, readable by
 *  the business's members only. `isArtist` is the plan's word, read once per
 *  list through `artist_ids`, so the badge on a follower's face is the same
 *  badge their own page wears. */
export interface TenantFollower {
  followId: string;
  userId: string;
  name: string;
  role: ProfileRole;
  isArtist: boolean;
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
