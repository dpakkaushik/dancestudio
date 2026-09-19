import { INK, SUB } from "@/lib/design/tokens";

/** FOLLOWERS · FOLLOWING, ON EVERY PUBLIC PAGE (19 Sep 2026, the user: "follow
 *  following counts visible on every profile and bio also should be visible
 *  below that for all kinds of users"). The prototype's figures line (10683),
 *  set like figures: the number in ink, the word in the sub colour. A crew, a
 *  studio and an organization follow nobody, so they print followers alone;
 *  a null figure (a read that did not answer) prints nothing for that side,
 *  never a zero that lies. */
export function FollowFigures({ followers, following = null }: { followers: number | null; following?: number | null }) {
  const parts: Array<[number, string]> = [];
  if (followers != null) parts.push([followers, followers === 1 ? "follower" : "followers"]);
  if (following != null) parts.push([following, "following"]);
  if (parts.length === 0) return null;
  return (
    <div data-testid="follow-figures" style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 12, fontSize: 12.5, color: SUB }}>
      {parts.map(([n, word]) => (
        <span key={word}>
          <b style={{ color: INK, fontSize: 14, fontWeight: 900 }}>{n.toLocaleString("en-IN")}</b> {word}
        </span>
      ))}
    </div>
  );
}
