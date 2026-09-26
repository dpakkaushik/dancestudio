/** THE ARRANGEMENT, AS PURE ARITHMETIC (22 Sep 2026).
 *
 *  The user: *"all columns on such pages should be swapable so we can place them
 *  in order of our choice"*, narrowed by their own answer to *"the reorder is
 *  required for columns inside tools on home tab for all profiles"* — the TILES
 *  in the Tools panel, on whichever profile you are in. `20260922090000` stored
 *  it; this is the half that reads it.
 *
 *  It lives on its own, with no React and no Supabase in it, for two reasons:
 *  the RULE below is the part that can be wrong in a way nothing on screen would
 *  show, and a pure module is the only kind a proof can call directly. */

/* the five grids, matching the migration's own comment exactly. Kept as a local
   union rather than imported from `home-kit` so the dependency runs one way:
   the kit reads this file, this file reads nothing. */
export type GridKind = "user" | "artist" | "org" | "studio" | "crew";

/** ⚠ THE SAME SHAPE THE DATABASE'S CHECK ENFORCES (`^[a-z][a-z0-9_:-]{0,79}$`).
 *  It is repeated here on purpose rather than trusted: the RPC would refuse a bad
 *  key with `that is not a grid`, and a refusal arriving as a red toast after a
 *  drag is a worse way to learn than never sending it. */
const KEY = /^[a-z][a-z0-9_:-]{0,79}$/;

/** WHICH GRID THIS IS — `tools:user`, `tools:artist`, `tools:org`,
 *  `tools:studio:{business id}`, `tools:crew:{crew id}`.
 *
 *  ⚠ A studio's and a crew's grid are keyed BY THAT ENTITY, so two people on one
 *  studio's team each arrange its tools for themselves — which is right, because
 *  neither is looking at the other's screen, and it is why this is a preference
 *  on the viewer's own row rather than a fact about the studio.
 *
 *  Returns null rather than a broken key when an id is missing or malformed, so
 *  the caller simply draws the code's order instead of sending something the
 *  database would refuse. */
export function toolsLayoutKey(kind: GridKind, id?: string | null): string | null {
  /* ⚠ AN ORGANIZATION'S GRID IS KEYED BY THE ORGANIZATION SINCE 26 Sep 2026
     (`tools:org:{business id}`), because an organization is a business a person
     opens now — one account can own several, each arranged on its own — where
     `tools:org` was the retired organization LOGIN's one grid. No id, no key. */
  if (kind === "studio" || kind === "crew" || kind === "org") {
    const at = (id ?? "").trim().toLowerCase();
    if (!at) return null;
    const key = `tools:${kind}:${at}`;
    return KEY.test(key) ? key : null;
  }
  return `tools:${kind}`;
}

/** THE ONE RULE, AND THE REASON IT IS WRITTEN DOWN RATHER THAN INLINED.
 *
 *  A stored order is a snapshot of the tiles that existed the day somebody
 *  arranged them, and this app adds tiles (Assets arrived on an organization's
 *  grid on 21 Sep; Memberships and Earnings on a plain user's the same day) and
 *  takes them away (Media went off every grid, Stats became a chip). So the two
 *  halves that matter are:
 *
 *  · **A NAME NOBODY DRAWS IS IGNORED.** A key left over from a tile that has
 *    since gone simply does not match anything, and is dropped.
 *  · ⚠⚠ **A TILE THE ORDER DOES NOT NAME IS KEPT, NEVER DROPPED.** This is the
 *    half that could silently cost somebody a door: arrange your grid today, and
 *    a tile added next month is not in your stored order — if the stored order
 *    were the whole answer, that tile would simply never be drawn for you again,
 *    with nothing on screen to say why. It is appended in the code's own order
 *    instead, so a new tool shows up at the end where it is findable.
 *
 *  ⚠ **THE INVARIANT IS THE COUNT**: the answer always holds exactly the tiles it
 *  was given, once each, whatever is stored. `rls-proof-layout.ps1` asserts it,
 *  because it is the kind of rule that only breaks for somebody who arranged
 *  their grid months ago — nobody testing today would meet it. */
export function arrangeTiles<T extends { k: string }>(tiles: T[], order?: readonly string[] | null): T[] {
  if (!order || order.length === 0) return tiles;
  const byKey = new Map(tiles.map((t) => [t.k, t]));
  const out: T[] = [];
  const taken = new Set<string>();
  for (const k of order) {
    const tile = byKey.get(k);
    /* a repeat in the stored order is taken once — the door is atomic and the
       CHECK caps the length, but a hand-written PATCH could still send one */
    if (tile && !taken.has(k)) {
      out.push(tile);
      taken.add(k);
    }
  }
  for (const tile of tiles) if (!taken.has(tile.k)) out.push(tile);
  return out;
}

/** What the arranged grid stores: the keys, in the order shown. Nothing else —
 *  a name or an href would be a copy of the code's own vocabulary, and a stale
 *  copy is how a stored order comes to disagree with the grid it describes. */
export const orderOf = (tiles: readonly { k: string }[]): string[] => tiles.map((t) => t.k);

/** Has this person actually arranged this grid, or are they on the default? The
 *  control offers "Reset" only when there is something to reset — a button that
 *  can only be a no-op is the kind this file has deleted three times. */
export const isArranged = (order?: readonly string[] | null): boolean => Boolean(order && order.length > 0);

/** ONE MOVE. Returns a NEW array (never mutates — this repo's lint forbids
 *  mutating during render), and refuses to walk off either end rather than
 *  wrapping: an arrow that silently sends the first tile to the last place is
 *  not what anybody pressing it meant. */
export function moveTile<T>(tiles: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= tiles.length || to < 0 || to >= tiles.length || from === to) return [...tiles];
  const next = [...tiles];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
