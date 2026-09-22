/* THE ARRANGEMENT RULE, PROVEN AGAINST THE REAL MODULE (22 Sep 2026).
 *
 * `rls-proof-layout.ps1` runs this as its first group, so the pure half and the
 * database half are one proof in the runner's set. It imports
 * `features/home/toolOrder.ts` DIRECTLY - Node 24 strips the types (the 28 Aug
 * lesson: a proof that runs a copy of the rules proves nothing about the rules).
 *
 * The claim under test is the one the backlog row said nothing enforced:
 *   "a stored key naming a tile that no longer exists must not break the grid,
 *    and a tile the stored order does not name must NOT be dropped"
 * which is the half that could silently cost somebody a door months later -
 * arrange your grid today, and a tile added next month is not in your order.
 */
import { arrangeTiles, isArranged, moveTile, orderOf, toolsLayoutKey } from "../features/home/toolOrder.ts";

let ok = 0;
let bad = 0;
const check = (cond, label) => {
  console.log((cond ? "  OK   " : "  !!!  ") + label);
  cond ? ok++ : bad++;
};

/* a grid shaped like a real one - an artist's is the biggest in the app */
const T = (k) => ({ k, name: k, href: "/" + k, c: "#000" });
const grid = ["classesmod", "events", "calendar", "crews", "studios", "routines", "team", "students", "earn", "memberships", "assets"].map(T);
const keys = (tiles) => tiles.map((t) => t.k);

check(keys(arrangeTiles(grid, null)).join() === keys(grid).join(), "A1 no stored order draws the code's own order");
check(keys(arrangeTiles(grid, [])).join() === keys(grid).join(), "A2 an EMPTY stored order is 'never arranged', not 'an empty grid'");

const reversed = keys(grid).slice().reverse();
check(keys(arrangeTiles(grid, reversed)).join() === reversed.join(), "A3 a full stored order is obeyed exactly");

/* the two halves of the fallback rule */
const withGhost = ["media", "stats", ...keys(grid)];
check(keys(arrangeTiles(grid, withGhost)).join() === keys(grid).join(), "A4 a stored key for a tile that no longer exists is IGNORED (media, stats)");

const partial = ["assets", "earn"];
const afterPartial = keys(arrangeTiles(grid, partial));
check(afterPartial.length === grid.length, `A5 a PARTIAL order keeps every tile (${afterPartial.length} of ${grid.length})`);
check(afterPartial[0] === "assets" && afterPartial[1] === "earn", "A6 ... with the named ones first, in the order stored");
check(
  afterPartial.slice(2).join() === keys(grid).filter((k) => !partial.includes(k)).join(),
  "A7 ... and the unnamed ones after, in the CODE's order - a tile added later is findable at the end, never dropped"
);

check(keys(arrangeTiles(grid, ["earn", "earn", "earn"]))[0] === "earn", "A8 a repeat in a stored order is taken once");
check(arrangeTiles(grid, ["earn", "earn", "earn"]).length === grid.length, "A9 ... and does not shorten the grid");
check(keys(arrangeTiles(grid, ["nope", "nothing"])).join() === keys(grid).join(), "A10 an order that names NOTHING real falls all the way back");

/* THE INVARIANT, over every order a stored value could plausibly hold: the
   answer is always a permutation of the tiles it was given. This is the check
   that would catch a future edit of the rule rather than a known case of it. */
let permOk = true;
const pool = [...keys(grid), "media", "stats", "ghost"];
for (let n = 0; n < 500; n++) {
  const order = [];
  for (let i = 0; i < 1 + Math.floor(Math.random() * 14); i++) order.push(pool[Math.floor(Math.random() * pool.length)]);
  const out = arrangeTiles(grid, order);
  if (out.length !== grid.length) { permOk = false; break; }
  if (new Set(keys(out)).size !== grid.length) { permOk = false; break; }
  if (keys(out).slice().sort().join() !== keys(grid).slice().sort().join()) { permOk = false; break; }
}
check(permOk, "A11 over 500 random stored orders the answer is always a PERMUTATION - same tiles, once each");

check(orderOf(grid).join() === keys(grid).join(), "A12 orderOf stores the keys and nothing else");
check(isArranged(null) === false && isArranged([]) === false && isArranged(["a"]) === true, "A13 isArranged is honest about 'nothing to reset'");

/* the key must match the CHECK the database carries, or the door refuses it */
const KEY = /^[a-z][a-z0-9_:-]{0,79}$/;
const uuid = "3f1b9c8e-2a44-4d7e-9b10-0c5e6f7a8b90";
check(toolsLayoutKey("user") === "tools:user" && toolsLayoutKey("artist") === "tools:artist" && toolsLayoutKey("org") === "tools:org", "A14 the three person grids are keyed as the migration says");
check(toolsLayoutKey("studio", uuid) === `tools:studio:${uuid}`, "A15 a studio's grid is keyed BY THE STUDIO");
check(toolsLayoutKey("crew", uuid) === `tools:crew:${uuid}`, "A16 a crew's grid is keyed BY THE CREW");
check(
  ["user", "artist", "org"].every((k) => KEY.test(toolsLayoutKey(k))) && KEY.test(toolsLayoutKey("studio", uuid)) && KEY.test(toolsLayoutKey("crew", uuid)),
  "A17 every key this app can build satisfies the DATABASE's own CHECK pattern"
);
check(toolsLayoutKey("studio", null) === null && toolsLayoutKey("crew", "") === null, "A18 no id, no key - the grid draws and simply offers no arranging");
check(toolsLayoutKey("studio", "Not A Uuid!") === null, "A19 an id the CHECK would refuse answers null rather than being sent");
check(toolsLayoutKey("studio", uuid.toUpperCase()) === `tools:studio:${uuid}`, "A20 an upper-case id is folded - the CHECK's pattern is lower-case only");

/* one move */
const moved = moveTile(grid, 0, 2);
check(keys(moved)[2] === "classesmod" && moved.length === grid.length, "A21 moveTile moves one tile and keeps the rest");
check(keys(grid)[0] === "classesmod", "A22 ... without mutating what it was given (this repo's lint forbids it)");
check(keys(moveTile(grid, 0, -1)).join() === keys(grid).join(), "A23 moving off the top is a no-op, NEVER a wrap to the bottom");
check(keys(moveTile(grid, grid.length - 1, grid.length)).join() === keys(grid).join(), "A24 moving off the bottom is a no-op too");

console.log(`\n  ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
