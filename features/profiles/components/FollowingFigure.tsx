import Link from "next/link";
import type { FollowListResult } from "@/features/profiles/server-actions/followLists";
import { figureLabel, figureNum } from "./profile-band";

/** ⚠⚠ THE FOLLOWING FIGURE — `FollowerFigure`'s twin (27 Sep 2026), and since
 *  12 Oct 2026 a link to the follow page on its Following tab (the user: "should
 *  open a seprate page do it excatly how insta does it").
 *
 *  ⚠ A CREW'S AND A STUDIO'S FOLLOWING IS ITS TEAM (2 Oct 2026): the page reads
 *  the team for a business and a crew; `rows` here only gives the count, so the
 *  figure and the page cannot disagree.
 *
 *  ⚠ NULL DRAWS NOTHING, NEVER A ZERO — unless `always`, which prints "—". */
export function FollowingFigure({
  n,
  testId,
  kind,
  id,
  always = false,
  rows = null,
}: {
  n: number | null;
  testId?: string;
  /** whose list — the page this opens */
  kind: "business" | "crew" | "person";
  id: string;
  always?: boolean;
  rows?: FollowListResult["rows"] | null;
}) {
  const count = rows ? rows.length : n;
  if (count == null && !always) return null;
  const shown = count == null ? "—" : count.toLocaleString("en-IN");
  return (
    <Link
      href={`/follows/${kind}/${id}?tab=following`}
      aria-label={`Following — ${count ?? "not available"}`}
      data-testid={testId}
      style={{ display: "block", color: "inherit", textDecoration: "none", textAlign: "left" }}
    >
      <span style={figureNum}>{shown}</span>
      <span style={figureLabel}>Following</span>
    </Link>
  );
}
