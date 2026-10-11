import Link from "next/link";
import { figureLabel, figureNum } from "./profile-band";

/** ⚠⚠ THE FOLLOWERS FIGURE IS A DOOR EVERYWHERE (27 Sep 2026), AND SINCE 12 Oct
 *  2026 IT OPENS A PAGE (the user: "follower following list whenever opened from
 *  anywhere should open a seprate page do it excatly how insta does it but give
 *  filters"). It was a sheet that read its rows on the press; it is a link to
 *  `/follows/{kind}/{id}`, which reads both lists in one pass and switches
 *  between them like Instagram's two tabs.
 *
 *  ⚠ NULL IS NOT ZERO (kept from `Figure`): zero is a measurement and is drawn;
 *  null means the count could not be read, and draws nothing. */
export function FollowerFigure({
  n,
  kind,
  id,
  name,
  testId,
}: {
  n: number | null;
  kind: "business" | "crew" | "person";
  id: string;
  /** whose followers — the link's title says so */
  name: string;
  testId?: string;
}) {
  if (n == null) return null;
  return (
    <Link
      href={`/follows/${kind}/${id}?tab=followers`}
      aria-label={`Followers — ${n}`}
      title={`Followers of ${name}`}
      data-testid={testId}
      /* bare, so it sits in `FIGURE_ROW` exactly where the plain `Figure` did */
      style={{ display: "block", color: "inherit", textDecoration: "none", textAlign: "left" }}
    >
      <span style={figureNum}>{n.toLocaleString("en-IN")}</span>
      <span style={figureLabel}>Followers</span>
    </Link>
  );
}
