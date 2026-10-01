/** A DANCER, DRAWN (2 Oct 2026, the user: "instead of photos can you use icons
 *  with dance styles in their particular costume with the pose for that dance
 *  style and props for it as well. and fit that on both photos and discover
 *  cards and fit them properly").
 *
 *  One parametric figure — a hip, a torso, two arms and two legs given as
 *  ANGLES — dressed from a per-style spec (`specs.ts`): the costume pieces, the
 *  headgear, the props in the hands. So all 49 styles are one family of
 *  drawings, and a style that had no honest free photo (Afrobeats, Locking,
 *  Waacking, Jazz Funk) gets a picture like every other.
 *
 *  ⚠ FITTING IS MEASURED, NOT GUESSED: every point that is drawn is also
 *  recorded, and the figure is scaled and placed from that outline — feet on
 *  the floor of the box, centred across it. A Breaking freeze, a Ballet
 *  arabesque and a Ghoomar skirt are three very different shapes, and each
 *  fills its frame without a hand number per style.
 *
 *  ⚠ PURE: no React and no DOM, so the same function feeds the server component
 *  and the contact-sheet script (`scripts/style-art-sheet.mjs`).
 *
 *  Angles: 0 = straight down, 90 = to the right, 180 = up, -90 = to the left.
 *  "a" is the screen-left arm/leg, "b" the screen-right. */

type P = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const go = (p: P, len: number, deg: number): P => [p[0] + Math.sin(rad(deg)) * len, p[1] + Math.cos(rad(deg)) * len];
const n1 = (v: number) => Math.round(v * 10) / 10;
const xy = (p: P) => `${n1(p[0])},${n1(p[1])}`;
const mid = (a: P, b: P, t = 0.5): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const add = (p: P, dx: number, dy: number): P => [p[0] + dx, p[1] + dy];

export type Pair = [number, number];
export interface Skirt {
  len: number;
  hem: number;
  c: string;
  /** a line along the hem */
  t?: string;
  /** scallops along the hem — a ruffle, a flare */
  wave?: number;
  /** a spinning skirt swings */
  tilt?: number;
  /** mirror work / polka dots */
  dots?: string;
  /** shorter layers drawn over it, longest first */
  tiers?: string[];
  pleats?: string;
  fringe?: string;
  /** how far the sides bow out (0 = straight A-line) */
  bow?: number;
}
export interface Bit {
  k: string;
  c?: string;
  c2?: string;
}
export interface Prop extends Bit {
  hand?: "a" | "b";
  /** absolute angle the prop points, default the forearm's */
  ang?: number;
}
export interface FigureSpec {
  skin: string;
  face?: 1 | -1;
  lean?: number;
  tilt?: number;
  rot?: number;
  a: Pair;
  b: Pair;
  la: Pair;
  lb: Pair;
  top: string;
  /** 1 = to the hip; less is a crop top over skin */
  topLen?: number;
  sleeve?: "none" | "short" | "long";
  sleeveC?: string;
  legs?: { c: string; w?: number; stripe?: string };
  shoe?: string;
  heel?: boolean;
  point?: boolean;
  bells?: string;
  skirt?: Skirt;
  tutu?: string;
  fan?: { c: string; t: string };
  potloi?: { c: string; t: string };
  hair?: { s: string; c: string };
  gear?: Bit[];
  wear?: Bit[];
  props?: Prop[];
  faceC?: string;
  fist?: boolean;
  /** a leg drawn OVER the skirt — a slit, a kick */
  frontLeg?: "a" | "b";
}

/** inner SVG markup for one figure, fitted into `box` (x, y, w, h in the
 *  caller's viewBox units) */
export function figureSvg(sp: FigureSpec, id: string, box: [number, number, number, number]): string {
  const pts: P[] = [];
  const mark = (...ps: P[]) => {
    for (const p of ps) pts.push(p);
  };
  const back: string[] = [];
  const out: string[] = [];
  const face = sp.face ?? 1;
  const lean = sp.lean ?? 0;
  const tilt = sp.tilt ?? 0;
  const H0: P = [0, 0];
  const upDir = 180 - lean;
  const downDir = -lean;
  const perp: P = [Math.cos(rad(lean)), Math.sin(rad(lean))];
  const off = (p: P, k: number): P => [p[0] + perp[0] * k, p[1] + perp[1] * k];

  const Sc = go(H0, 24, upDir);
  const Sa = off(Sc, -6);
  const Sb = off(Sc, 6);
  const Ha = off(H0, -4.2);
  const Hb = off(H0, 4.2);
  const Ea = go(Sa, 14, sp.a[0]);
  const Pa = go(Ea, 13, sp.a[1]);
  const Eb = go(Sb, 14, sp.b[0]);
  const Pb = go(Eb, 13, sp.b[1]);
  const Ka = go(Ha, 19, sp.la[0]);
  const Aa = go(Ka, 18, sp.la[1]);
  const Kb = go(Hb, 19, sp.lb[0]);
  const Ab = go(Kb, 18, sp.lb[1]);
  const R = 6.2;
  const hc = go(Sc, 3 + R, 180 - lean - tilt);
  const W = go(H0, 2, upDir);
  mark(Sa, Sb, Ea, Pa, Eb, Pb, Ka, Aa, Kb, Ab, [hc[0] - R, hc[1] - R], [hc[0] + R, hc[1] + R]);

  const line = (ps: P[], c: string, sw: number, extra = "") =>
    `<path d="M${ps.map(xy).join("L")}" fill="none" stroke="${c}" stroke-width="${sw}"${extra}/>`;

  /* ── legs ── */
  const foot = (K: P, A: P, shin: number): string => {
    const shoe = sp.shoe ?? sp.skin;
    if (sp.point) {
      const e = go(A, 4.6, shin);
      mark(e);
      return line([A, e], shoe, sp.shoe ? 4.2 : 3.6);
    }
    if (sp.heel) {
      const toe = add(A, face * 4.6, 3.2);
      const hs = add(A, -face * 0.6, 1.4);
      const he = add(A, -face * 0.9, 4.4);
      mark(toe, he);
      return line([A, toe], shoe, 3.4) + line([hs, he], shoe, 1.3);
    }
    const toe = add(A, face * 5.2, 1.6);
    mark(toe);
    return line([add(A, -face * 0.8, 0.6), toe], shoe, sp.shoe ? 4.4 : 3.4);
  };
  const leg = (H: P, K: P, A: P, shin: number): string => {
    const lc = sp.legs?.c ?? sp.skin;
    const lw = sp.legs ? sp.legs.w ?? 7 : 5.6;
    let s = line([H, K, A], lc, lw);
    if (sp.legs?.stripe) s += line([H, K, A], sp.legs.stripe, 1.1);
    s += foot(K, A, shin);
    if (sp.bells) {
      for (let i = -2; i <= 2; i++) s += `<circle cx="${n1(A[0] + i * 1.3)}" cy="${n1(A[1] - 1.6)}" r=".9" fill="${sp.bells}"/>`;
    }
    return s;
  };
  const legA = leg(Ha, Ka, Aa, sp.la[1]);
  const legB = leg(Hb, Kb, Ab, sp.lb[1]);

  /* ── skirt-like things ── */
  const skirt = (s: Skirt): string => {
    let res = "";
    const layers: Array<{ len: number; hem: number; c: string }> = [{ len: s.len, hem: s.hem, c: s.c }];
    (s.tiers ?? []).forEach((c, i) => {
      const k = 1 - (i + 1) * (0.62 / ((s.tiers?.length ?? 1) + 0.4));
      layers.push({ len: s.len * k, hem: 11.2 + (s.hem - 11.2) * k, c });
    });
    const ang = s.tilt ?? 0;
    const Rt = (x: number, y: number): P => {
      const c = Math.cos(rad(ang));
      const si = Math.sin(rad(ang));
      const lx = x * Math.cos(rad(lean)) - y * Math.sin(rad(lean));
      const ly = x * Math.sin(rad(lean)) + y * Math.cos(rad(lean));
      return [W[0] + lx * c - ly * si, W[1] + lx * si + ly * c];
    };
    const wh = 5.6;
    for (const L of layers) {
      const hh = L.hem / 2;
      const bow = (s.bow ?? 0.12) * L.hem;
      const n = s.wave ? Math.max(4, Math.round(L.hem / 6)) : 1;
      let d = `M${xy(Rt(-wh, 0))}Q${xy(Rt(-(wh + hh) / 2 - bow, L.len * 0.55))} ${xy(Rt(-hh, L.len))}`;
      let hemD = `M${xy(Rt(-hh, L.len))}`;
      for (let i = 0; i < n; i++) {
        const x0 = -hh + (L.hem * i) / n;
        const x1 = -hh + (L.hem * (i + 1)) / n;
        const seg = `Q${xy(Rt((x0 + x1) / 2, L.len + (s.wave ?? 0) * 1.4))} ${xy(Rt(x1, L.len))}`;
        d += seg;
        hemD += seg;
      }
      d += `Q${xy(Rt((wh + hh) / 2 + bow, L.len * 0.55))} ${xy(Rt(wh, 0))}Q${xy(Rt(0, -1.2))} ${xy(Rt(-wh, 0))}Z`;
      mark(Rt(-hh, L.len), Rt(hh, L.len), Rt(0, L.len + (s.wave ?? 0) * 1.4));
      res += `<path d="${d}" fill="${L.c}"/>`;
      if (s.pleats && L === layers[0]) {
        for (const t of [-0.66, -0.33, 0, 0.33, 0.66]) res += line([Rt(t * wh, 1.5), Rt(t * hh, L.len - 0.6)], s.pleats, 0.7);
      }
      if (s.dots) {
        for (let r = 1; r <= 3; r++) {
          const y = (L.len * r) / 3.6;
          const span = wh + (hh - wh) * (y / L.len);
          const cnt = Math.max(2, Math.round(span / 2.8));
          for (let i = 0; i < cnt; i++) {
            const x = -span + 1.2 + ((2 * span - 2.4) * (i + (r % 2) * 0.5)) / cnt;
            if (Math.abs(x) < span - 0.8) res += `<circle cx="${n1(Rt(x, y)[0])}" cy="${n1(Rt(x, y)[1])}" r=".75" fill="${s.dots}"/>`;
          }
        }
      }
      if (s.t) res += `<path d="${hemD}" fill="none" stroke="${s.t}" stroke-width="1.5"/>`;
      if (s.fringe) {
        for (let i = 0; i <= 10; i++) {
          const x = -hh + (L.hem * i) / 10;
          res += line([Rt(x, L.len - 0.4), Rt(x * 1.04, L.len + 4.5)], s.fringe, 0.8);
        }
        mark(Rt(0, L.len + 4.5));
      }
    }
    return res;
  };

  const fanPleat = (c: string, t: string): string => {
    const ka = mid(Ka, Kb, 0.12);
    const kb = mid(Ka, Kb, 0.88);
    const low = Math.max(ka[1], kb[1]) + 6;
    const ctrl: P = [(ka[0] + kb[0]) / 2, low];
    let s = `<path d="M${xy(W)}L${xy(ka)}Q${xy(ctrl)} ${xy(kb)}Z" fill="${c}"/>`;
    for (let i = 1; i < 6; i++) {
      const tt = i / 6;
      const q: P = [(1 - tt) * (1 - tt) * ka[0] + 2 * (1 - tt) * tt * ctrl[0] + tt * tt * kb[0], (1 - tt) * (1 - tt) * ka[1] + 2 * (1 - tt) * tt * ctrl[1] + tt * tt * kb[1]];
      s += line([W, q], t, 0.6);
    }
    s += `<path d="M${xy(ka)}Q${xy(ctrl)} ${xy(kb)}" fill="none" stroke="${t}" stroke-width="1.6"/>`;
    mark([ctrl[0], low - 2]);
    return s;
  };

  const potloi = (c: string, t: string): string => {
    const top = W[1] - 1;
    const bot = Math.min(Aa[1], Ab[1]) - 3.5;
    const cx = W[0];
    let s = `<path d="M${n1(cx - 11)},${n1(top)}L${n1(cx - 13)},${n1(bot)}A13 3 0 0 0 ${n1(cx + 13)},${n1(bot)}L${n1(cx + 11)},${n1(top)}Z" fill="${c}"/>`;
    for (const k of [0.35, 0.62, 0.9]) {
      const y = top + (bot - top) * k;
      const hw = 11 + 2 * k;
      s += `<path d="M${n1(cx - hw)},${n1(y)}A${n1(hw)} 2.6 0 0 0 ${n1(cx + hw)},${n1(y)}" fill="none" stroke="${t}" stroke-width="1.4"/>`;
      for (let i = -3; i <= 3; i++) s += `<circle cx="${n1(cx + i * hw * 0.27)}" cy="${n1(y + 1.6 - Math.abs(i) * 0.25)}" r=".7" fill="#fff"/>`;
    }
    s += `<path d="M${n1(cx - 11)},${n1(top)}Q${n1(cx - 16)},${n1(top + 7)} ${n1(cx - 15)},${n1(top + 9)}Q${n1(cx)},${n1(top + 11)} ${n1(cx + 15)},${n1(top + 9)}Q${n1(cx + 16)},${n1(top + 7)} ${n1(cx + 11)},${n1(top)}Z" fill="#fff" fill-opacity=".72"/>`;
    mark([cx - 15, top], [cx + 15, bot + 3]);
    return s;
  };

  const tutu = (c: string): string => {
    const y = W[1] + 1;
    let s = `<ellipse cx="${n1(W[0])}" cy="${n1(y)}" rx="17" ry="4.4" fill="${c}"/>`;
    s += `<ellipse cx="${n1(W[0])}" cy="${n1(y - 0.8)}" rx="13" ry="2.6" fill="#fff" fill-opacity=".45"/>`;
    for (let i = -4; i <= 4; i++) s += line([[W[0] + i * 3.4, y + 1.2], [W[0] + i * 3.9, y + 3.6]], "rgba(0,0,0,.12)", 0.5);
    mark([W[0] - 17, y], [W[0] + 17, y]);
    return s;
  };

  /* ── head ── */
  const hx = hc[0];
  const hy = hc[1];
  const headBack: string[] = [];
  const headFront: string[] = [];
  const ext = (dx: number, dy: number) => mark([hx + dx, hy + dy]);
  if (sp.hair) {
    const c = sp.hair.c;
    const s = sp.hair.s;
    if (s === "long" || s === "loose") {
      const lenH = s === "loose" ? 18 : 14;
      headBack.push(`<path d="M${n1(hx - R - 0.4)},${n1(hy)}Q${n1(hx - R - 2.6)},${n1(hy + lenH * 0.7)} ${n1(hx - R + 0.6 - face * 1.5)},${n1(hy + lenH)}L${n1(hx + R - 0.6 - face * 1.5)},${n1(hy + lenH)}Q${n1(hx + R + 2.6)},${n1(hy + lenH * 0.7)} ${n1(hx + R + 0.4)},${n1(hy)}Z" fill="${c}"/>`);
      ext(-R - 2.6, lenH);
    }
    if (s === "bun") {
      headBack.push(`<circle cx="${n1(hx - face * R * 0.85)}" cy="${n1(hy - R * 0.35)}" r="3.4" fill="${c}"/>`);
      ext(-face * (R + 3), 0);
    }
    if (s === "topbun") {
      headBack.push(`<circle cx="${n1(hx - face * 1)}" cy="${n1(hy - R - 1.8)}" r="3.1" fill="${c}"/>`);
      ext(0, -R - 5);
    }
    if (s === "sidebun") {
      headBack.push(`<circle cx="${n1(hx - face * R * 0.7)}" cy="${n1(hy - R * 0.75)}" r="3.9" fill="${c}"/>`);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 360;
        headBack.push(`<circle cx="${n1(hx - face * R * 0.7 + Math.sin(rad(a)) * 4)}" cy="${n1(hy - R * 0.75 + Math.cos(rad(a)) * 4)}" r=".95" fill="#fff"/>`);
      }
      ext(-face * (R + 4), -R - 4);
    }
    if (s === "pony") {
      headBack.push(`<path d="M${n1(hx - face * R * 0.8)},${n1(hy - R * 0.6)}Q${n1(hx - face * (R + 7))},${n1(hy - 2)} ${n1(hx - face * (R + 4))},${n1(hy + 9)}Q${n1(hx - face * (R + 3))},${n1(hy + 2)} ${n1(hx - face * R * 0.5)},${n1(hy - R * 0.2)}Z" fill="${c}"/>`);
      ext(-face * (R + 7), 9);
    }
    if (s === "braid") {
      for (let i = 0; i < 6; i++) headBack.push(`<ellipse cx="${n1(hx - face * (R * 0.55) )}" cy="${n1(hy + 3 + i * 3.2)}" rx="1.9" ry="2" fill="${c}"/>`);
      headBack.push(`<circle cx="${n1(hx - face * R * 0.75)}" cy="${n1(hy - R * 0.2)}" r="3" fill="${c}"/>`);
      for (let i = 0; i < 4; i++) headBack.push(`<circle cx="${n1(hx - face * (R * 0.55) + 1.6)}" cy="${n1(hy + 4 + i * 3.4)}" r=".8" fill="#fff"/>`);
      ext(0, 22);
    }
    if (s !== "none") {
      headFront.push(`<path d="M${n1(hx - R - 0.4)},${n1(hy + 0.6)}A${R + 0.4} ${R + 0.4} 0 0 1 ${n1(hx + R + 0.4)},${n1(hy + 0.6)}Q${n1(hx + face * R * 0.35)},${n1(hy - R * 0.5)} ${n1(hx - R - 0.4)},${n1(hy + 0.6)}Z" fill="${c}"/>`);
    }
  }
  for (const g of sp.gear ?? []) {
    const c = g.c ?? "#222";
    const c2 = g.c2 ?? "#fff";
    switch (g.k) {
      case "capFwd":
      case "capBack": {
        const dir = g.k === "capFwd" ? face : -face;
        headFront.push(`<path d="M${n1(hx - R - 0.5)},${n1(hy - 0.8)}A${R + 0.5} ${R + 0.9} 0 0 1 ${n1(hx + R + 0.5)},${n1(hy - 0.8)}Z" fill="${c}"/>`);
        headFront.push(line([[hx + dir * (R - 1), hy - 0.9], [hx + dir * (R + 5.5), hy - 0.4]], c2 === "#fff" ? c : c2, 2));
        ext(dir * (R + 6), -R - 1);
        break;
      }
      case "beanie":
        headFront.push(`<path d="M${n1(hx - R - 0.6)},${n1(hy - 0.4)}Q${n1(hx - R)},${n1(hy - R - 4)} ${n1(hx)},${n1(hy - R - 3.4)}Q${n1(hx + R)},${n1(hy - R - 4)} ${n1(hx + R + 0.6)},${n1(hy - 0.4)}Z" fill="${c}"/>`);
        headFront.push(line([[hx - R - 0.4, hy - 0.8], [hx + R + 0.4, hy - 0.8]], c2, 2.2));
        ext(0, -R - 4);
        break;
      case "turban":
        headFront.push(`<path d="M${n1(hx - R - 1.2)},${n1(hy)}Q${n1(hx - R - 2)},${n1(hy - R - 4)} ${n1(hx)},${n1(hy - R - 4.6)}Q${n1(hx + R + 2)},${n1(hy - R - 4)} ${n1(hx + R + 1.2)},${n1(hy)}Q${n1(hx)},${n1(hy - 2.6)} ${n1(hx - R - 1.2)},${n1(hy)}Z" fill="${c}"/>`);
        headFront.push(`<path d="M${n1(hx - R)},${n1(hy - 2)}Q${n1(hx)},${n1(hy - R - 2)} ${n1(hx + R)},${n1(hy - 4)}" fill="none" stroke="${c2}" stroke-width="1"/>`);
        headBack.push(`<path d="M${n1(hx + face * 2)},${n1(hy - R - 3.6)}Q${n1(hx + face * 6)},${n1(hy - R - 12)} ${n1(hx + face * 9)},${n1(hy - R - 9)}Q${n1(hx + face * 6)},${n1(hy - R - 4)} ${n1(hx + face * 4)},${n1(hy - R - 1)}Z" fill="${c2}"/>`);
        ext(face * 9.5, -R - 12);
        ext(-R - 2, -R - 4);
        break;
      case "tophat":
        headFront.push(`<rect x="${n1(hx - 4.4)}" y="${n1(hy - R - 10)}" width="8.8" height="10.4" rx="1" fill="${c}"/>`);
        headFront.push(line([[hx - 4.4, hy - R - 1.6], [hx + 4.4, hy - R - 1.6]], c2, 1.5));
        headFront.push(line([[hx - 8.4, hy - R + 0.6], [hx + 8.4, hy - R + 0.6]], c, 2));
        ext(-9, -R - 10);
        ext(9, -R);
        break;
      case "bowler":
        headFront.push(`<path d="M${n1(hx - 5.2)},${n1(hy - R + 1.6)}Q${n1(hx - 5.4)},${n1(hy - R - 6)} ${n1(hx)},${n1(hy - R - 5.6)}Q${n1(hx + 5.4)},${n1(hy - R - 6)} ${n1(hx + 5.2)},${n1(hy - R + 1.6)}Z" fill="${c}"/>`);
        headFront.push(`<path d="M${n1(hx - 8.4)},${n1(hy - R + 2.2)}Q${n1(hx)},${n1(hy - R - 0.4)} ${n1(hx + 8.4)},${n1(hy - R + 2.2)}" fill="none" stroke="${c}" stroke-width="2"/>`);
        ext(-9, -R - 6);
        ext(9, 0);
        break;
      case "fedora":
        headFront.push(`<path d="M${n1(hx - 5)},${n1(hy - R + 1.6)}L${n1(hx - 4.4)},${n1(hy - R - 5)}Q${n1(hx)},${n1(hy - R - 3.4)} ${n1(hx + 4.4)},${n1(hy - R - 5)}L${n1(hx + 5)},${n1(hy - R + 1.6)}Z" fill="${c}"/>`);
        headFront.push(line([[hx - 5, hy - R], [hx + 5, hy - R]], c2, 1.3));
        headFront.push(`<path d="M${n1(hx - 9.4)},${n1(hy - R + 3)}Q${n1(hx)},${n1(hy - R + 0.6)} ${n1(hx + 9.4)},${n1(hy - R + 1.4)}" fill="none" stroke="${c}" stroke-width="2"/>`);
        ext(-10, -R - 5);
        ext(10, 0);
        break;
      case "apple":
        headFront.push(`<ellipse cx="${n1(hx - face * 0.6)}" cy="${n1(hy - R + 0.4)}" rx="${R + 3.8}" ry="5.2" fill="${c}"/>`);
        headFront.push(`<circle cx="${n1(hx - face * 0.6)}" cy="${n1(hy - R - 4.2)}" r="1.1" fill="${c2}"/>`);
        headFront.push(line([[hx + face * (R - 1), hy - 0.4], [hx + face * (R + 4.5), hy + 0.4]], c, 2));
        for (const k of [-0.5, 0, 0.5]) headFront.push(line([[hx - face * 0.6 + k * 9, hy - R + 4.2], [hx - face * 0.6 + k * 4, hy - R - 4.4]], c2, 0.5));
        ext(-R - 5, -R - 6);
        ext(R + 5, 0);
        break;
      case "bucket":
        headFront.push(`<path d="M${n1(hx - 5.2)},${n1(hy - 1.6)}Q${n1(hx - 5.6)},${n1(hy - R - 4)} ${n1(hx)},${n1(hy - R - 3.6)}Q${n1(hx + 5.6)},${n1(hy - R - 4)} ${n1(hx + 5.2)},${n1(hy - 1.6)}Z" fill="${c}"/>`);
        headFront.push(`<path d="M${n1(hx - 9)},${n1(hy + 0.6)}L${n1(hx - 5.4)},${n1(hy - 2.2)}L${n1(hx + 5.4)},${n1(hy - 2.2)}L${n1(hx + 9)},${n1(hy + 0.6)}Z" fill="${c}"/>`);
        ext(-9.5, -R - 4);
        ext(9.5, 1);
        break;
      case "kireedam": {
        headBack.push(`<circle cx="${n1(hx)}" cy="${n1(hy - 5)}" r="13.5" fill="${c}"/>`);
        headBack.push(`<circle cx="${n1(hx)}" cy="${n1(hy - 5)}" r="10.6" fill="${c2}"/>`);
        headBack.push(`<circle cx="${n1(hx)}" cy="${n1(hy - 5)}" r="8" fill="${c}"/>`);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * 360;
          headBack.push(`<circle cx="${n1(hx + Math.sin(rad(a)) * 12)}" cy="${n1(hy - 5 + Math.cos(rad(a)) * 12)}" r=".8" fill="#fff"/>`);
        }
        headFront.push(`<path d="M${n1(hx - R + 0.4)},${n1(hy - 1)}L${n1(hx - 4)},${n1(hy - R - 6)}L${n1(hx + 4)},${n1(hy - R - 6)}L${n1(hx + R - 0.4)},${n1(hy - 1)}Z" fill="${c}"/>`);
        headFront.push(line([[hx - R + 0.6, hy - 1.4], [hx + R - 0.6, hy - 1.4]], c2, 1.6));
        ext(-14, -19);
        ext(14, 8);
        break;
      }
      case "sikke":
        headFront.push(`<path d="M${n1(hx - 4.4)},${n1(hy - R + 2.6)}L${n1(hx - 3.6)},${n1(hy - R - 13)}Q${n1(hx)},${n1(hy - R - 14.4)} ${n1(hx + 3.6)},${n1(hy - R - 13)}L${n1(hx + 4.4)},${n1(hy - R + 2.6)}Z" fill="${c}"/>`);
        ext(0, -R - 14.5);
        break;
      case "feathers":
        for (let i = -4; i <= 4; i++) {
          const a = 180 + i * 18;
          const tip = go([hx, hy - 2], 17, a);
          headBack.push(`<path d="M${n1(hx)},${n1(hy - 2)}Q${xy(go([hx, hy - 2], 10, a - 9))} ${xy(tip)}Q${xy(go([hx, hy - 2], 10, a + 9))} ${n1(hx)},${n1(hy - 2)}Z" fill="${i % 2 ? c : c2}"/>`);
          mark(tip);
        }
        headFront.push(line([[hx - R, hy - 2.6], [hx + R, hy - 2.6]], g.c2 ?? "#fff", 1.8));
        break;
      case "odhni":
        headBack.push(`<path d="M${n1(hx - R - 1.2)},${n1(hy - 2)}Q${n1(hx - face * (R + 8))},${n1(hy + 14)} ${n1(hx - face * (R + 6))},${n1(hy + 28)}L${n1(hx - face * 2)},${n1(hy + 26)}Q${n1(hx + face * 3)},${n1(hy + 12)} ${n1(hx + R + 1.2)},${n1(hy - 2)}Z" fill="${c}"/>`);
        headFront.push(`<path d="M${n1(hx - R - 1.4)},${n1(hy + 1.4)}A${R + 1.4} ${R + 1.6} 0 0 1 ${n1(hx + R + 1.4)},${n1(hy + 1.4)}Q${n1(hx)},${n1(hy - 1)} ${n1(hx - R - 1.4)},${n1(hy + 1.4)}Z" fill="${c}"/>`);
        headFront.push(`<path d="M${n1(hx - R - 1.2)},${n1(hy + 1.2)}Q${n1(hx)},${n1(hy - 1)} ${n1(hx + R + 1.2)},${n1(hy + 1.2)}" fill="none" stroke="${c2}" stroke-width="1.1"/>`);
        ext(-face * (R + 8), 28);
        break;
      case "kokyet":
        headBack.push(`<path d="M${n1(hx - R - 1.5)},${n1(hy - 1)}Q${n1(hx - R - 6)},${n1(hy + 16)} ${n1(hx - R - 3)},${n1(hy + 24)}L${n1(hx + R + 3)},${n1(hy + 24)}Q${n1(hx + R + 6)},${n1(hy + 16)} ${n1(hx + R + 1.5)},${n1(hy - 1)}Z" fill="#fff" fill-opacity=".6"/>`);
        headFront.push(`<path d="M${n1(hx - 4)},${n1(hy - R + 0.6)}Q${n1(hx)},${n1(hy - R - 5)} ${n1(hx + 4)},${n1(hy - R + 0.6)}Z" fill="${c}"/>`);
        headFront.push(`<path d="M${n1(hx - R - 1.4)},${n1(hy - 1)}A${R + 1.4} ${R + 1.6} 0 0 1 ${n1(hx + R + 1.4)},${n1(hy - 1)}Q${n1(hx)},${n1(hy - 3.6)} ${n1(hx - R - 1.4)},${n1(hy - 1)}Z" fill="#fff" fill-opacity=".5"/>`);
        ext(-R - 6, 24);
        ext(0, -R - 5);
        break;
      case "gele":
        headFront.push(`<path d="M${n1(hx - R - 1.5)},${n1(hy - 0.4)}Q${n1(hx - R - 5)},${n1(hy - R - 6)} ${n1(hx - 2)},${n1(hy - R - 7)}Q${n1(hx + 2)},${n1(hy - R - 11)} ${n1(hx + R + 4)},${n1(hy - R - 5)}Q${n1(hx + R + 3)},${n1(hy - 3)} ${n1(hx + R + 1.5)},${n1(hy - 0.4)}Z" fill="${c}"/>`);
        headFront.push(`<path d="M${n1(hx - R)},${n1(hy - 3)}Q${n1(hx)},${n1(hy - R - 4)} ${n1(hx + R + 2)},${n1(hy - R - 2)}" fill="none" stroke="${c2}" stroke-width="1.2"/>`);
        ext(-R - 5, -R - 11);
        ext(R + 4.5, -R - 6);
        break;
      case "bandana":
        headFront.push(`<path d="M${n1(hx - R - 0.5)},${n1(hy - 0.5)}A${R + 0.5} ${R + 0.6} 0 0 1 ${n1(hx + R + 0.5)},${n1(hy - 0.5)}Q${n1(hx)},${n1(hy - 2)} ${n1(hx - R - 0.5)},${n1(hy - 0.5)}Z" fill="${c}"/>`);
        headFront.push(`<path d="M${n1(hx - face * R)},${n1(hy - 0.5)}L${n1(hx - face * (R + 4.5))},${n1(hy + 1.8)}L${n1(hx - face * (R + 3.4))},${n1(hy - 1.4)}Z" fill="${c}"/>`);
        for (const [dx, dy] of [[-2.4, -3.4], [1.2, -4.6], [3.6, -2.4]]) headFront.push(`<circle cx="${n1(hx + dx)}" cy="${n1(hy + dy)}" r=".6" fill="${c2}"/>`);
        ext(-face * (R + 5), 2);
        break;
      case "headset":
        headFront.push(`<path d="M${n1(hx - R - 0.4)},${n1(hy)}A${R + 0.4} ${R + 0.4} 0 0 1 ${n1(hx + R + 0.4)},${n1(hy)}" fill="none" stroke="${c}" stroke-width=".9"/>`);
        headFront.push(line([[hx - face * (R + 0.2), hy + 0.6], [hx + face * 3.4, hy + 4.2]], c, 0.9));
        headFront.push(`<circle cx="${n1(hx + face * 3.6)}" cy="${n1(hy + 4.3)}" r=".95" fill="${c}"/>`);
        break;
      case "headphones":
        headFront.push(`<path d="M${n1(hx - R - 0.6)},${n1(hy + 1)}A${R + 0.6} ${R + 1} 0 0 1 ${n1(hx + R + 0.6)},${n1(hy + 1)}" fill="none" stroke="${c}" stroke-width="1.6"/>`);
        for (const sx of [-1, 1]) headFront.push(`<rect x="${n1(hx + sx * (R + 0.2) - 2)}" y="${n1(hy - 1.4)}" width="4" height="5.4" rx="1.8" fill="${c2}"/>`);
        ext(-R - 2.2, 0);
        ext(R + 2.2, 0);
        ext(0, -R - 2);
        break;
      case "sweatband":
        headFront.push(line([[hx - R, hy - 2.4], [hx + R, hy - 2.4]], c, 2.2));
        break;
      case "flower": {
        const fx = hx - face * (R * 0.65);
        const fy = hy - R * 0.55;
        for (let i = 0; i < 5; i++) {
          const a = i * 72;
          headFront.push(`<circle cx="${n1(fx + Math.sin(rad(a)) * 1.9)}" cy="${n1(fy + Math.cos(rad(a)) * 1.9)}" r="1.5" fill="${c}"/>`);
        }
        headFront.push(`<circle cx="${n1(fx)}" cy="${n1(fy)}" r="1" fill="${c2 === "#fff" ? "#FFD23F" : c2}"/>`);
        break;
      }
      case "tahia":
        for (let i = -4; i <= 4; i++) {
          const a = 180 + i * 20 - face * 30;
          headBack.push(line([go([hx - face * 2.5, hy - 2.5], 6, a), go([hx - face * 2.5, hy - 2.5], 12, a)], c, 1.3));
          mark(go([hx - face * 2.5, hy - 2.5], 12.4, a));
        }
        break;
      case "tiara":
        headFront.push(`<path d="M${n1(hx - 4)},${n1(hy - R + 1.6)}L${n1(hx - 3)},${n1(hy - R - 1.6)}L${n1(hx - 1.4)},${n1(hy - R + 0.6)}L${n1(hx)},${n1(hy - R - 2.6)}L${n1(hx + 1.4)},${n1(hy - R + 0.6)}L${n1(hx + 3)},${n1(hy - R - 1.6)}L${n1(hx + 4)},${n1(hy - R + 1.6)}Z" fill="${c}"/>`);
        break;
      case "pot":
        headFront.push(`<path d="M${n1(hx - 2.4)},${n1(hy - R - 0.2)}Q${n1(hx - 7.4)},${n1(hy - R - 4)} ${n1(hx - 2.8)},${n1(hy - R - 8.2)}L${n1(hx + 2.8)},${n1(hy - R - 8.2)}Q${n1(hx + 7.4)},${n1(hy - R - 4)} ${n1(hx + 2.4)},${n1(hy - R - 0.2)}Z" fill="${c}"/>`);
        headFront.push(line([[hx - 3.6, hy - R - 8.2], [hx + 3.6, hy - R - 8.2]], c, 1.6));
        headFront.push(`<path d="M${n1(hx)},${n1(hy - R - 9)}Q${n1(hx - 1.4)},${n1(hy - R - 11.4)} ${n1(hx)},${n1(hy - R - 13.2)}Q${n1(hx + 1.4)},${n1(hy - R - 11.4)} ${n1(hx)},${n1(hy - R - 9)}Z" fill="#FFB000"/>`);
        ext(-7.5, -R - 13.5);
        ext(7.5, -R);
        break;
      case "shades":
        headFront.push(line([[hx - face * 1 - 1, hy - 0.8], [hx + face * (R - 0.2), hy - 0.6]], c, 2.2));
        break;
      case "nath":
        headFront.push(`<circle cx="${n1(hx + face * 3.6)}" cy="${n1(hy + 1.6)}" r="1.5" fill="none" stroke="${c}" stroke-width=".6"/>`);
        break;
      case "bindi":
        headFront.push(`<circle cx="${n1(hx + face * 2.2)}" cy="${n1(hy - 2)}" r=".7" fill="${c}"/>`);
        break;
      case "chutti":
        headFront.push(`<path d="M${n1(hx - R + 0.6)},${n1(hy + 0.4)}Q${n1(hx)},${n1(hy + R + 4)} ${n1(hx + R - 0.6)},${n1(hy + 0.4)}Q${n1(hx)},${n1(hy + R + 1.4)} ${n1(hx - R + 0.6)},${n1(hy + 0.4)}Z" fill="${c}"/>`);
        headFront.push(`<circle cx="${n1(hx + face * 2.4)}" cy="${n1(hy - 1.2)}" r=".8" fill="#111"/>`);
        ext(0, R + 4);
        break;
      case "rose":
        headFront.push(`<circle cx="${n1(hx + face * 5.2)}" cy="${n1(hy + 2.2)}" r="1.9" fill="${c}"/>`);
        headFront.push(line([[hx + face * 3.8, hy + 2.6], [hx + face * 8.4, hy + 3.6]], "#2E7D32", 0.8));
        ext(face * 8.6, 3);
        break;
    }
  }

  /* ── torso, worn things ── */
  const Wa = off(go(H0, 1, upDir), -4.6);
  const Wb = off(go(H0, 1, upDir), 4.6);
  const torsoD = `M${xy(Sa)}L${xy(Sb)}L${xy(Wb)}L${xy(Wa)}Z`;
  let torso = "";
  const tl = sp.topLen ?? 1;
  if (tl < 1) {
    torso += `<path d="${torsoD}" fill="${sp.skin}" stroke="${sp.skin}" stroke-width="3.4"/>`;
    const ca = mid(Sa, Wa, tl);
    const cb = mid(Sb, Wb, tl);
    torso += `<path d="M${xy(Sa)}L${xy(Sb)}L${xy(cb)}L${xy(ca)}Z" fill="${sp.top}" stroke="${sp.top}" stroke-width="3.4"/>`;
  } else {
    torso += `<path d="${torsoD}" fill="${sp.top}" stroke="${sp.top}" stroke-width="3.4"/>`;
  }
  const neckTop = go(Sc, 3.4, 180 - lean - tilt * 0.4);
  let wear = "";
  for (const g of sp.wear ?? []) {
    const c = g.c ?? "#F2C14E";
    const c2 = g.c2 ?? "#fff";
    switch (g.k) {
      case "necklace":
        wear += `<path d="M${xy(off(Sc, -3))}Q${xy(go(Sc, 5.4, downDir))} ${xy(off(Sc, 3))}" fill="none" stroke="${c}" stroke-width="1.1"/>`;
        wear += `<path d="M${xy(off(Sc, -3.6))}Q${xy(go(Sc, 8.6, downDir))} ${xy(off(Sc, 3.6))}" fill="none" stroke="${c}" stroke-width="1"/>`;
        break;
      case "chain":
        wear += `<path d="M${xy(off(Sc, -3))}Q${xy(go(Sc, 10, downDir))} ${xy(off(Sc, 3))}" fill="none" stroke="${c}" stroke-width="1.2"/>`;
        wear += `<circle cx="${n1(go(Sc, 6.4, downDir)[0])}" cy="${n1(go(Sc, 6.4, downDir)[1])}" r="1.4" fill="${c}"/>`;
        break;
      case "belt":
        wear += line([off(go(H0, 1.6, upDir), -5.4), off(go(H0, 1.6, upDir), 5.4)], c, 2.2);
        break;
      case "suspenders":
        wear += line([off(Sc, -3.4), off(H0, -2.6)], c, 1.4) + line([off(Sc, 3.4), off(H0, 2.6)], c, 1.4);
        break;
      case "vest":
        wear += `<path d="M${xy(Sa)}L${xy(off(Sc, -1.4))}L${xy(off(go(H0, 1, upDir), -1.2))}L${xy(Wa)}Z" fill="${c}" stroke="${c}" stroke-width="2.4"/>`;
        wear += `<path d="M${xy(Sb)}L${xy(off(Sc, 1.4))}L${xy(off(go(H0, 1, upDir), 1.2))}L${xy(Wb)}Z" fill="${c}" stroke="${c}" stroke-width="2.4"/>`;
        break;
      case "sash":
        wear += line([Sa, mid(Wa, Wb, 0.9)], c, 3.2);
        if (g.c2) wear += line([Sa, mid(Wa, Wb, 0.9)], g.c2, 0.8, ` stroke-dasharray="1 1.6"`);
        break;
      case "flowscarf": {
        const s0 = Sb;
        const e1 = add(s0, 11, 2);
        const e2 = add(s0, 5, 14);
        const e3 = add(s0, 17, 20);
        back.push(`<path d="M${xy(s0)}C${xy(e1)} ${xy(e2)} ${xy(e3)}" fill="none" stroke="${c}" stroke-width="3.6"/>`);
        if (g.c2) back.push(`<path d="M${xy(s0)}C${xy(e1)} ${xy(e2)} ${xy(e3)}" fill="none" stroke="${g.c2}" stroke-width=".9" stroke-dasharray="1 1.8"/>`);
        mark(e3, e1);
        break;
      }
      case "hipscarf": {
        const ya = off(go(H0, 2.6, upDir), -6.4);
        const yb = off(go(H0, 2.6, upDir), 6.4);
        const tip = go(H0, 7, downDir);
        wear += `<path d="M${xy(ya)}L${xy(yb)}L${xy(tip)}Z" fill="${c}"/>`;
        for (let i = 0; i <= 6; i++) {
          const p = i <= 3 ? mid(ya, tip, i / 3) : mid(tip, yb, (i - 3) / 3);
          wear += `<circle cx="${n1(p[0])}" cy="${n1(p[1] + 0.8)}" r=".85" fill="${c2}"/>`;
        }
        break;
      }
      case "mirrors":
        for (const [k, t] of [[-2.4, 0.3], [2.4, 0.3], [0, 0.55], [-2.8, 0.75], [2.8, 0.75]] as const) {
          const p = off(mid(Sc, go(H0, 1, upDir), t), k);
          wear += `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r=".75" fill="${c}"/>`;
        }
        break;
      case "buttons":
        for (const t of [0.3, 0.55, 0.8]) {
          const p = mid(Sc, H0, t);
          wear += `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r=".7" fill="${c}"/>`;
        }
        break;
      case "gamosa":
        wear += `<path d="M${xy(off(Sc, -3.4))}Q${xy(go(Sc, 3, downDir))} ${xy(off(Sc, 3.4))}" fill="none" stroke="#fff" stroke-width="2"/>`;
        wear += line([off(Sc, -3), off(go(Sc, 11, downDir), -3.4)], "#fff", 2.2) + line([off(Sc, 3), off(go(Sc, 11, downDir), 3.4)], "#fff", 2.2);
        wear += line([off(go(Sc, 9.4, downDir), -3.4), off(go(Sc, 11.6, downDir), -3.4)], c, 2.4);
        wear += line([off(go(Sc, 9.4, downDir), 3.4), off(go(Sc, 11.6, downDir), 3.4)], c, 2.4);
        break;
      case "pattern":
        for (const [k, t] of [[-2.6, 0.25], [1.6, 0.35], [-1, 0.6], [2.8, 0.7], [-3, 0.85]] as const) {
          const p = off(mid(Sc, H0, t), k);
          wear += `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="1.2" fill="${c}"/>`;
          wear += `<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r=".5" fill="${c2}"/>`;
        }
        break;
      case "collar":
        wear += `<path d="M${xy(off(Sc, -3.6))}L${xy(go(Sc, 3.6, downDir))}L${xy(off(Sc, 3.6))}" fill="none" stroke="${c}" stroke-width="1.6"/>`;
        break;
      case "number":
        wear += `<rect x="${n1(mid(Sc, H0, 0.5)[0] - 2.6)}" y="${n1(mid(Sc, H0, 0.5)[1] - 2.4)}" width="5.2" height="4.4" rx=".6" fill="${c}"/>`;
        break;
    }
  }

  /* ── arms ── */
  const arm = (S: P, E: P, Pn: P): string => {
    if (sp.sleeve === "long") return line([S, E, Pn], sp.sleeveC ?? sp.top, 5.2);
    let s = line([S, E, Pn], sp.skin, 4.4);
    if (sp.sleeve === "short") s += line([S, mid(S, E, 0.62)], sp.sleeveC ?? sp.top, 5.6);
    return s;
  };
  const handR = sp.fist ? 2.9 : 2.3;

  /* ── props ── */
  const props: string[] = [];
  const at = (hand: P, ang: number, lx: number, ly: number): P => {
    const al: P = [Math.sin(rad(ang)), Math.cos(rad(ang))];
    const ac: P = [Math.cos(rad(ang)), -Math.sin(rad(ang))];
    return [hand[0] + al[0] * ly + ac[0] * lx, hand[1] + al[1] * ly + ac[1] * lx];
  };
  for (const pr of sp.props ?? []) {
    const hand = pr.hand === "a" ? Pa : Pb;
    const fore = pr.hand === "a" ? sp.a[1] : sp.b[1];
    const ang = pr.ang ?? fore;
    const c = pr.c ?? "#7A4A1C";
    const c2 = pr.c2 ?? "#F2C14E";
    switch (pr.k) {
      case "stick": {
        const e0 = at(hand, ang, 0, -5);
        const e1 = at(hand, ang, 0, 13);
        props.push(line([e0, e1], c, 1.9) + line([at(hand, ang, 0, 7), at(hand, ang, 0, 9)], c2, 2.1) + line([at(hand, ang, 0, -3.5), at(hand, ang, 0, -2)], c2, 2.1));
        mark(e0, e1);
        break;
      }
      case "fan": {
        const ps: P[] = [];
        for (let i = 0; i <= 8; i++) ps.push(go(hand, 12, ang - 65 + (130 * i) / 8));
        props.push(`<path d="M${xy(hand)}L${ps.map(xy).join("L")}Z" fill="${c}"/>`);
        for (const p of ps) props.push(line([hand, p], c2, 0.5));
        props.push(`<path d="M${ps.map(xy).join("L")}" fill="none" stroke="${c2}" stroke-width="1.1"/>`);
        mark(...ps);
        break;
      }
      case "cane": {
        const e0 = at(hand, ang, 0, -2);
        const e1 = at(hand, ang, 0, 24);
        props.push(line([e0, e1], c, 1.6));
        props.push(`<path d="M${xy(e0)}Q${xy(at(hand, ang, 2.2, -5.2))} ${xy(at(hand, ang, 4, -2))}" fill="none" stroke="${c}" stroke-width="1.6"/>`);
        props.push(line([at(hand, ang, 0, 22.4), e1], c2, 1.8));
        mark(e0, e1, at(hand, ang, 4, -5));
        break;
      }
      case "rose": {
        const tip = at(hand, ang, 0, 7);
        props.push(line([hand, tip], "#2E7D32", 0.9) + `<circle cx="${n1(tip[0])}" cy="${n1(tip[1])}" r="2.2" fill="${c}"/>`);
        mark(tip);
        break;
      }
      case "rumal": {
        const p1 = at(hand, ang, 4.5, 4);
        const p2 = at(hand, ang, 8, 9);
        const p3 = at(hand, ang, -2.6, 10.4);
        props.push(`<path d="M${xy(hand)}Q${xy(p1)} ${xy(p2)}L${xy(p3)}Z" fill="${c}"/>`);
        mark(p2, p3);
        break;
      }
      case "ribbon": {
        const ps = [at(hand, ang, 8, 10), at(hand, ang, -10, 18), at(hand, ang, 4, 27), at(hand, ang, 15, 33), at(hand, ang, -3, 41), at(hand, ang, 9, 46)];
        props.push(`<path d="M${xy(hand)}C${xy(ps[0])} ${xy(ps[1])} ${xy(ps[2])}C${xy(ps[3])} ${xy(ps[4])} ${xy(ps[5])}" fill="none" stroke="${c}" stroke-width="1.7"/>`);
        props.push(line([at(hand, ang, 0, -1), at(hand, ang, 0, -6)], "#8A6A3A", 1.1));
        mark(...ps);
        break;
      }
      case "mic": {
        const tip = at(hand, ang, 0, -5);
        props.push(line([hand, tip], "#333", 1.3) + `<circle cx="${n1(tip[0])}" cy="${n1(tip[1])}" r="1.6" fill="#555"/>`);
        mark(tip);
        break;
      }
      case "castanet": {
        const p = at(hand, ang, 0, 1.6);
        props.push(`<ellipse cx="${n1(p[0])}" cy="${n1(p[1])}" rx="1.8" ry="1.3" fill="${c}"/>`);
        break;
      }
      case "sparkle": {
        for (let i = 0; i < 6; i++) {
          const a = i * 60 + 15;
          props.push(line([go(hand, 3.6, a), go(hand, 6.4, a)], c, 0.9));
          mark(go(hand, 6.6, a));
        }
        break;
      }
      case "veil": {
        const top = Math.min(Pa[1], Pb[1]) - 15;
        const c1: P = [(Pa[0] + Pb[0]) / 2, top];
        const c2p: P = [(Pa[0] + Pb[0]) / 2, top + 10];
        props.push(`<path d="M${xy(Pa)}Q${xy(c1)} ${xy(Pb)}Q${xy(c2p)} ${xy(Pa)}Z" fill="${c}" fill-opacity=".8"/>`);
        props.push(`<path d="M${xy(Pa)}Q${xy(c1)} ${xy(Pb)}" fill="none" stroke="${c2}" stroke-width=".9"/>`);
        mark([c1[0], top + 6]);
        break;
      }
      case "plate": {
        const foot = pr.hand === "a" ? Aa : Ab;
        props.push(`<ellipse cx="${n1(foot[0] + face * 2)}" cy="${n1(foot[1] + 2.6)}" rx="7" ry="1.9" fill="${c}"/>`);
        props.push(`<ellipse cx="${n1(foot[0] + face * 2)}" cy="${n1(foot[1] + 2.1)}" rx="5.4" ry="1.1" fill="${c2}" fill-opacity=".7"/>`);
        mark([foot[0] + face * 2 - 7, foot[1] + 4.5], [foot[0] + face * 2 + 7, foot[1] + 4.5]);
        break;
      }
      case "diya": {
        const p = at(hand, 180, 0, 1.4);
        props.push(`<path d="M${n1(p[0] - 3)},${n1(p[1])}Q${n1(p[0])},${n1(p[1] + 3.4)} ${n1(p[0] + 3)},${n1(p[1])}Z" fill="${c}"/>`);
        props.push(`<path d="M${n1(p[0])},${n1(p[1] - 0.4)}Q${n1(p[0] - 1.3)},${n1(p[1] - 2.6)} ${n1(p[0])},${n1(p[1] - 4.6)}Q${n1(p[0] + 1.3)},${n1(p[1] - 2.6)} ${n1(p[0])},${n1(p[1] - 0.4)}Z" fill="#FFB000"/>`);
        mark([p[0], p[1] - 5]);
        break;
      }
      case "dhol": {
        const p = at(hand, ang, 0, 0);
        props.push(`<rect x="${n1(p[0] - 5)}" y="${n1(p[1] - 4)}" width="10" height="8" rx="3" fill="${c}"/>`);
        props.push(line([[p[0] - 5, p[1] - 4], [p[0] - 5, p[1] + 4]], c2, 1.6) + line([[p[0] + 5, p[1] - 4], [p[0] + 5, p[1] + 4]], c2, 1.6));
        mark([p[0] - 5, p[1] - 4], [p[0] + 5, p[1] + 4]);
        break;
      }
    }
  }

  /* ── assemble, back to front ── */
  out.push(...back, ...headBack);
  const legsFirst = sp.frontLeg === "a" ? legB : sp.frontLeg === "b" ? legA : legA + legB;
  out.push(legsFirst);
  if (sp.skirt) out.push(skirt(sp.skirt));
  if (sp.fan) out.push(fanPleat(sp.fan.c, sp.fan.t));
  if (sp.potloi) out.push(potloi(sp.potloi.c, sp.potloi.t));
  if (sp.frontLeg === "a") out.push(legA);
  if (sp.frontLeg === "b") out.push(legB);
  out.push(torso, wear);
  if (sp.tutu) out.push(tutu(sp.tutu));
  out.push(line([Sc, neckTop], sp.skin, 3.6));
  out.push(arm(Sa, Ea, Pa), arm(Sb, Eb, Pb));
  out.push(...props);
  out.push(`<circle cx="${n1(Pa[0])}" cy="${n1(Pa[1])}" r="${handR}" fill="${sp.skin}"/>`, `<circle cx="${n1(Pb[0])}" cy="${n1(Pb[1])}" r="${handR}" fill="${sp.skin}"/>`);
  out.push(`<circle cx="${n1(hx)}" cy="${n1(hy)}" r="${R}" fill="${sp.faceC ?? sp.skin}"/>`);
  out.push(...headFront);

  /* ── fit ── */
  const rot = sp.rot ?? 0;
  const rp = pts.map(([x, y]): P => [x * Math.cos(rad(rot)) - y * Math.sin(rad(rot)), x * Math.sin(rad(rot)) + y * Math.cos(rad(rot))]);
  const minX = Math.min(...rp.map((p) => p[0])) - 2.5;
  const maxX = Math.max(...rp.map((p) => p[0])) + 2.5;
  const minY = Math.min(...rp.map((p) => p[1])) - 2.5;
  const maxY = Math.max(...rp.map((p) => p[1])) + 2;
  const [bx, by, bw, bh] = box;
  const s = Math.min(bw / (maxX - minX), bh / (maxY - minY));
  const tx = bx + bw / 2 - (s * (minX + maxX)) / 2;
  const ty = by + bh - s * maxY;
  const floorY = by + bh;
  const figW = s * (maxX - minX);

  const fid = `dsf-${id}`;
  const gid = `dsg-${id}`;
  return (
    `<defs>` +
    `<radialGradient id="${gid}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".6" stop-color="#fff" stop-opacity=".14"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<filter id="${fid}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">` +
    `<feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="d"/>` +
    `<feFlood flood-color="#fff"/><feComposite in2="d" operator="in" result="o"/>` +
    `<feGaussianBlur in="d" stdDeviation="2" result="b"/><feOffset in="b" dy="1.8" result="bo"/>` +
    `<feFlood flood-color="#000" flood-opacity=".3"/><feComposite in2="bo" operator="in" result="sh"/>` +
    `<feMerge><feMergeNode in="sh"/><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>` +
    `</filter></defs>` +
    `<ellipse cx="${n1(bx + bw / 2)}" cy="${n1(by + bh * 0.48)}" rx="${n1(bw * 0.56)}" ry="${n1(bh * 0.56)}" fill="url(#${gid})"/>` +
    `<ellipse cx="${n1(bx + bw / 2)}" cy="${n1(floorY + 0.6)}" rx="${n1(Math.max(14, figW * 0.42))}" ry="3" fill="#000" fill-opacity=".2"/>` +
    `<g filter="url(#${fid})"><g transform="translate(${n1(tx)} ${n1(ty)}) scale(${Math.round(s * 1000) / 1000}) rotate(${rot})" stroke-linecap="round" stroke-linejoin="round">` +
    out.join("") +
    `</g></g>`
  );
}
