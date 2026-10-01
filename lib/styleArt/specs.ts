import type { FigureSpec } from "./figure";

/** EACH STYLE'S DANCER — its costume, its signature pose, its props (2 Oct 2026).
 *  Read with `figure.ts`: angles are 0 = down, 90 = right, 180 = up, -90 = left;
 *  "a" is the screen-left arm/leg. Every entry is checked by eye on the contact
 *  sheet (`node scripts/style-art-sheet.mjs`) — a pose that reads as the wrong
 *  dance is the same mistake as a wrong photograph. */

const SKIN = { fair: "#F3C9A0", light: "#E3AE7C", mid: "#C68642", tan: "#A86B3C", deep: "#7A4A26", dark: "#53321B" };
const GOLD = "#F2C14E";
const BLACK = "#1B1B22";
const HAIR = "#1E1410";

export const STYLE_SPECS: Record<string, FigureSpec> = {
  /* ── Indian classical ── */
  Bharatanatyam: {
    skin: SKIN.mid, a: [-98, -84], b: [98, 84], la: [-64, 6], lb: [64, -6],
    top: "#167A4A", sleeve: "short", legs: { c: "#167A4A", w: 7 }, fan: { c: "#167A4A", t: GOLD },
    bells: GOLD, hair: { s: "braid", c: HAIR }, gear: [{ k: "bindi", c: "#C1121F" }, { k: "flower", c: "#fff" }],
    wear: [{ k: "necklace" }, { k: "belt" }],
  },
  Kathak: {
    skin: SKIN.light, a: [-172, 178], b: [96, 104], la: [-3, 0], lb: [5, 0], tilt: -8,
    top: "#8E1530", sleeve: "long", skirt: { len: 30, hem: 52, c: "#8E1530", t: GOLD, wave: 1.2, tilt: -9, tiers: ["#A61E3C"] },
    bells: GOLD, hair: { s: "bun", c: HAIR }, gear: [{ k: "bindi", c: GOLD }], wear: [{ k: "necklace" }, { k: "flowscarf", c: GOLD }],
  },
  Kathakali: {
    skin: SKIN.tan, faceC: "#2E9447", a: [-112, -172], b: [112, 172], la: [-58, 0], lb: [58, 0],
    top: "#C1121F", sleeve: "long", skirt: { len: 26, hem: 54, c: "#F7F2E4", t: "#C1121F", wave: 0.8, tiers: ["#F2C14E", "#F7F2E4"], bow: 0.42 },
    hair: { s: "loose", c: HAIR }, gear: [{ k: "kireedam", c: GOLD, c2: "#C1121F" }, { k: "chutti", c: "#fff" }], wear: [{ k: "necklace", c: "#fff" }],
  },
  Kuchipudi: {
    skin: SKIN.mid, a: [-58, 42], b: [58, -42], la: [-26, 8], lb: [26, -8],
    top: "#E85D04", sleeve: "short", legs: { c: "#E85D04", w: 7 }, fan: { c: "#E85D04", t: "#1B7F3B" },
    bells: GOLD, hair: { s: "braid", c: HAIR }, gear: [{ k: "pot", c: "#D4A017" }, { k: "bindi", c: "#C1121F" }],
    wear: [{ k: "necklace" }, { k: "belt" }], props: [{ k: "plate", hand: "b", c: "#C9A227", c2: "#FFE08A" }, { k: "plate", hand: "a", c: "#C9A227", c2: "#FFE08A" }],
  },
  Manipuri: {
    skin: SKIN.light, a: [-52, 40], b: [128, 98], la: [-2, 0], lb: [3, 0], tilt: 10, lean: -4,
    top: "#5B1A63", sleeve: "long", potloi: { c: "#1F7A3E", t: GOLD },
    hair: { s: "bun", c: HAIR }, gear: [{ k: "kokyet", c: GOLD }], wear: [{ k: "necklace" }],
  },
  Mohiniyattam: {
    skin: SKIN.tan, a: [-128, -160], b: [42, 84], la: [-14, 4], lb: [14, -4], lean: 6, tilt: -12,
    top: "#F7EFD8", sleeve: "short", sleeveC: GOLD, skirt: { len: 34, hem: 24, c: "#F7EFD8", t: GOLD, pleats: "#E3C77A" },
    hair: { s: "sidebun", c: HAIR }, gear: [{ k: "bindi", c: "#C1121F" }], wear: [{ k: "necklace" }, { k: "belt" }],
  },
  Odissi: {
    skin: SKIN.mid, lean: -12, tilt: 16, a: [-146, 116], b: [96, 28], la: [-56, 4], lb: [56, -4],
    top: "#D35400", sleeve: "short", legs: { c: "#D35400", w: 7 }, fan: { c: "#D35400", t: "#E8E8F0" },
    bells: "#E8E8F0", hair: { s: "bun", c: HAIR }, gear: [{ k: "tahia", c: "#E8E8F0" }, { k: "bindi", c: "#C1121F" }],
    wear: [{ k: "necklace", c: "#E8E8F0" }, { k: "belt", c: "#E8E8F0" }],
  },
  Sattriya: {
    skin: SKIN.light, a: [-104, -164], b: [100, 34], la: [-40, 4], lb: [40, -4],
    top: "#F7F1E3", sleeve: "long", legs: { c: "#F7F1E3", w: 7 }, fan: { c: "#F7F1E3", t: "#B22222" },
    hair: { s: "bun", c: HAIR }, gear: [{ k: "flower", c: "#B22222" }], wear: [{ k: "belt", c: "#B22222" }, { k: "necklace" }],
  },
  "Semi-classical": {
    skin: SKIN.light, a: [-158, -172], b: [74, 112], la: [-4, 0], lb: [10, 8], tilt: -6,
    top: "#0F7C7A", sleeve: "long", skirt: { len: 34, hem: 40, c: "#0F7C7A", t: GOLD, wave: 0.9, tilt: -5 },
    hair: { s: "long", c: HAIR }, gear: [{ k: "bindi", c: "#C1121F" }], wear: [{ k: "necklace" }, { k: "flowscarf", c: GOLD }],
  },

  /* ── Indian folk ── */
  Bhangra: {
    skin: SKIN.light, a: [-162, -176], b: [162, 176], la: [-4, 0], lb: [74, 6], lean: -3,
    top: "#2844C2", sleeve: "long", skirt: { len: 30, hem: 26, c: "#F4C430", t: "#2844C2", bow: 0.05 },
    shoe: GOLD, frontLeg: "b", gear: [{ k: "turban", c: "#E23A8A", c2: "#FFD23F" }], wear: [{ k: "vest", c: BLACK }],
    props: [{ k: "rumal", hand: "b", c: "#FFD23F", ang: 160 }],
  },
  Garba: {
    skin: SKIN.mid, a: [-160, 124], b: [160, -124], la: [-6, 4], lb: [22, -18], lean: 4,
    top: "#F2C14E", sleeve: "short", skirt: { len: 30, hem: 50, c: "#E5156E", t: "#2E9E4F", wave: 1.1, tilt: -8, dots: "#fff", tiers: ["#2E9E4F"] },
    hair: { s: "braid", c: HAIR }, gear: [{ k: "bindi", c: "#C1121F" }], wear: [{ k: "mirrors", c: "#fff" }, { k: "sash", c: "#E5156E", c2: GOLD }],
  },
  "Dandiya Raas": {
    skin: SKIN.light, a: [-118, -160], b: [70, 128], la: [-8, 4], lb: [30, -14], lean: 4,
    top: "#F2C14E", sleeve: "short", skirt: { len: 30, hem: 46, c: "#19A7A0", t: "#D7263D", wave: 1, tilt: -6, dots: "#fff" },
    hair: { s: "braid", c: HAIR }, wear: [{ k: "mirrors", c: "#fff" }],
    props: [{ k: "stick", hand: "a", ang: 150, c: "#D7263D", c2: GOLD }, { k: "stick", hand: "b", ang: 200, c: "#D7263D", c2: GOLD }],
  },
  Ghoomar: {
    skin: SKIN.light, a: [-152, 118], b: [104, 82], la: [-3, 0], lb: [4, 0], tilt: -4,
    top: "#C1121F", sleeve: "long", skirt: { len: 33, hem: 58, c: "#F2A900", t: "#C1121F", wave: 1.3, tilt: -10, tiers: ["#C1121F"], dots: "#fff" },
    gear: [{ k: "odhni", c: "#C1121F", c2: GOLD }], wear: [{ k: "necklace" }],
  },
  Kalbelia: {
    skin: SKIN.mid, a: [-134, -172], b: [132, 64], la: [-3, 0], lb: [4, 0], tilt: 6,
    top: BLACK, sleeve: "long", skirt: { len: 31, hem: 56, c: BLACK, t: "#D7263D", wave: 1.4, tilt: 9, dots: "#E9E9F2" },
    hair: { s: "long", c: HAIR }, gear: [{ k: "bindi", c: "#D7263D" }], wear: [{ k: "mirrors", c: "#E9E9F2" }, { k: "necklace", c: "#E9E9F2" }],
  },
  Lavani: {
    skin: SKIN.mid, a: [-156, -112], b: [48, -40], la: [-12, 2], lb: [20, 6], lean: 6,
    top: "#E5156E", sleeve: "short", legs: { c: "#1E8C4E", w: 8.4, stripe: "#E5156E" },
    hair: { s: "bun", c: HAIR }, gear: [{ k: "nath", c: GOLD }, { k: "bindi", c: "#C1121F" }, { k: "flower", c: "#fff" }],
    wear: [{ k: "necklace" }, { k: "sash", c: "#1E8C4E", c2: GOLD }],
  },
  Bihu: {
    skin: SKIN.light, a: [-124, -168], b: [124, 168], la: [-10, 4], lb: [12, -6], lean: 5,
    top: "#F3E6C4", sleeve: "short", sleeveC: "#B5161C", skirt: { len: 34, hem: 20, c: "#F3E6C4", t: "#B5161C", dots: "#B5161C" },
    hair: { s: "bun", c: HAIR }, gear: [{ k: "flower", c: "#E63946" }], wear: [{ k: "sash", c: "#B5161C", c2: "#F3E6C4" }],
  },
  Giddha: {
    skin: SKIN.light, a: [-150, 120], b: [150, -128], la: [-12, 6], lb: [14, -6],
    top: "#7B2D8E", sleeve: "long", legs: { c: "#F4D35E", w: 9 }, skirt: { len: 13, hem: 20, c: "#7B2D8E", t: GOLD },
    hair: { s: "braid", c: HAIR }, wear: [{ k: "flowscarf", c: "#F77F00", c2: "#FFD23F" }],
  },
  "Sufi Whirling": {
    skin: SKIN.light, a: [-100, -122], b: [162, 152], la: [-2, 0], lb: [3, 0], tilt: 20,
    top: "#FAFAF7", sleeve: "long", skirt: { len: 33, hem: 60, c: "#FAFAF7", t: "#D9D4C7", wave: 0.7, tilt: 7, bow: 0.18 },
    gear: [{ k: "sikke", c: "#7A5230" }], wear: [{ k: "belt", c: BLACK }],
  },

  /* ── Bollywood ── */
  Bollywood: {
    skin: SKIN.light, a: [-150, -176], b: [86, 60], la: [-6, 2], lb: [24, -10], lean: 5,
    top: GOLD, sleeve: "none", topLen: 0.6, skirt: { len: 32, hem: 44, c: "#E8247A", t: GOLD, wave: 1, tilt: -5, dots: GOLD },
    hair: { s: "loose", c: HAIR }, gear: [{ k: "bindi", c: "#C1121F" }], wear: [{ k: "necklace" }, { k: "flowscarf", c: "#E8247A", c2: GOLD }],
    props: [{ k: "sparkle", hand: "a", c: "#FFF3B0" }],
  },

  /* ── Street ── */
  "Hip-Hop": {
    skin: SKIN.deep, a: [-34, 82], b: [62, 48], la: [-16, -6], lb: [18, 10], lean: -4,
    top: "#FFC93C", sleeve: "long", legs: { c: "#2B2B33", w: 9 }, shoe: "#FFFFFF",
    gear: [{ k: "capBack", c: "#D7263D" }], wear: [{ k: "chain" }],
  },
  Breaking: {
    skin: SKIN.deep, rot: 165, a: [-176, 180], b: [128, 70], la: [-70, -120], lb: [36, 10],
    top: "#1E88E5", sleeve: "long", legs: { c: "#1B1B22", w: 8, stripe: "#fff" }, shoe: "#F2F2F2",
    gear: [{ k: "beanie", c: "#E53935", c2: "#FFC107" }],
  },
  Popping: {
    skin: SKIN.mid, a: [-90, 0], b: [90, 180], la: [-10, 0], lb: [26, -14], fist: true,
    top: "#F4F4F4", sleeve: "long", legs: { c: "#3D4250", w: 8 }, shoe: BLACK,
    gear: [{ k: "fedora", c: BLACK, c2: "#E53935" }, { k: "shades", c: BLACK }], wear: [{ k: "vest", c: BLACK }],
  },
  Locking: {
    skin: SKIN.dark, a: [-50, 30], b: [126, 116], la: [-34, 18], lb: [36, -6], lean: 4,
    top: "#FF7A1A", sleeve: "long", legs: { c: "#1F2A5A", w: 9 }, shoe: BLACK,
    gear: [{ k: "apple", c: "#FFD23F", c2: "#1F2A5A" }], wear: [{ k: "suspenders", c: "#FFD23F" }],
  },
  House: {
    skin: SKIN.tan, a: [-62, -24], b: [52, 86], la: [-24, 22], lb: [30, -22], lean: 6,
    top: "#6B3FA0", sleeve: "short", legs: { c: "#7FA2D6", w: 8.4 }, shoe: "#FAFAFA",
    gear: [{ k: "bucket", c: "#F4F1E8" }],
  },
  Waacking: {
    skin: SKIN.mid, a: [-176, 152], b: [156, 102], la: [-6, 2], lb: [12, 4], lean: -5,
    top: BLACK, sleeve: "long", sleeveC: BLACK, legs: { c: "#F4F1F8", w: 11 }, shoe: BLACK,
    hair: { s: "pony", c: HAIR }, wear: [{ k: "belt", c: GOLD }, { k: "necklace", c: "#E9E9F2" }],
  },
  Krump: {
    skin: SKIN.dark, a: [-64, -152], b: [70, 154], la: [-30, 2], lb: [30, -2], lean: -6, fist: true,
    top: "#B71C1C", sleeve: "short", legs: { c: "#1B1B22", w: 9.4 }, shoe: "#F5F5F5",
    gear: [{ k: "capFwd", c: BLACK }], wear: [{ k: "chain", c: "#C0C0C8" }],
  },

  /* ── Global street ── */
  Dancehall: {
    skin: SKIN.dark, a: [-24, -2], b: [26, 4], la: [-38, 14], lb: [40, -12], lean: 10,
    top: "#FFD100", sleeve: "none", topLen: 0.7, legs: { c: BLACK, w: 7.6, stripe: "#009B3A" }, shoe: "#009B3A",
    hair: { s: "pony", c: HAIR }, gear: [{ k: "bandana", c: "#009B3A", c2: "#FFD100" }], wear: [{ k: "chain" }],
  },
  Afrobeats: {
    skin: SKIN.dark, a: [-128, -166], b: [118, 160], la: [-8, 4], lb: [62, -6], lean: -4,
    top: "#F47C20", sleeve: "short", skirt: { len: 22, hem: 22, c: "#0E8C83", t: "#F47C20", dots: "#FFD23F" },
    shoe: "#F47C20", gear: [{ k: "gele", c: "#F47C20", c2: "#0E8C83" }], wear: [{ k: "pattern", c: "#0E8C83", c2: "#FFD23F" }],
  },
  Reggaeton: {
    skin: SKIN.tan, a: [-44, 54], b: [168, 176], la: [-16, 0], lb: [20, 10], lean: -6,
    top: "#F5F5F5", sleeve: "short", sleeveC: "#E53935", legs: { c: "#1B1B22", w: 9 }, shoe: "#E53935",
    gear: [{ k: "capFwd", c: "#E53935" }, { k: "shades", c: BLACK }], wear: [{ k: "chain" }, { k: "number", c: "#E53935" }],
  },
  "K-pop": {
    skin: SKIN.fair, a: [-160, 124], b: [160, -124], la: [-6, 2], lb: [8, -2],
    top: "#F7F7FA", sleeve: "long", skirt: { len: 13, hem: 22, c: "#1B1B22", pleats: "#3A3A48" }, shoe: BLACK,
    hair: { s: "long", c: "#E07AB5" }, gear: [{ k: "headset", c: "#333" }], wear: [{ k: "buttons", c: GOLD }, { k: "collar", c: GOLD }],
  },

  /* ── Latin ── */
  Salsa: {
    skin: SKIN.tan, a: [-172, 176], b: [112, 132], la: [-4, 2], lb: [22, -6], tilt: -6,
    top: "#F4B400", sleeve: "none", skirt: { len: 20, hem: 38, c: "#F4B400", t: "#E85D04", wave: 1.2, tilt: -12, tiers: ["#FF8C1A"] },
    heel: true, shoe: "#C1121F", hair: { s: "bun", c: HAIR }, gear: [{ k: "flower", c: "#C1121F" }],
  },
  Bachata: {
    skin: SKIN.mid, a: [-136, -64], b: [44, -24], la: [-4, 0], lb: [16, -8], lean: 9,
    top: "#13B5B1", sleeve: "none", skirt: { len: 26, hem: 18, c: "#13B5B1", t: "#0B7F7C", bow: 0.06 }, frontLeg: "b",
    heel: true, shoe: "#E8C547", hair: { s: "loose", c: "#3A2418" }, wear: [{ k: "necklace" }],
  },
  Samba: {
    skin: SKIN.tan, a: [-132, -146], b: [132, 146], la: [-8, 4], lb: [26, -8], lean: 4,
    top: "#FFC300", topLen: 0.42, sleeve: "none", skirt: { len: 10, hem: 22, c: "#009739", fringe: "#FFC300" },
    heel: true, shoe: GOLD, gear: [{ k: "feathers", c: "#FFC300", c2: "#009739" }], wear: [{ k: "belt" }],
  },

  /* ── Ballroom ── */
  Ballroom: {
    skin: SKIN.fair, a: [-112, -150], b: [70, 158], la: [-3, 0], lb: [4, 0], lean: -4, tilt: -10,
    top: "#6EC6F0", sleeve: "long", sleeveC: "#FFFFFF", skirt: { len: 41, hem: 54, c: "#6EC6F0", t: "#FFFFFF", wave: 0.6, tiers: ["#9ED8F5"], bow: 0.16 },
    hair: { s: "bun", c: "#7A4A1C" }, gear: [{ k: "tiara", c: GOLD }], wear: [{ k: "necklace", c: "#fff" }],
  },
  Tango: {
    skin: SKIN.light, a: [-110, -124], b: [48, -12], la: [-4, 0], lb: [44, -136], lean: -8, face: -1,
    top: "#121212", sleeve: "none", skirt: { len: 26, hem: 18, c: "#121212", t: "#C1121F", bow: 0.06 }, frontLeg: "b",
    heel: true, shoe: "#C1121F", hair: { s: "bun", c: HAIR }, gear: [{ k: "rose", c: "#D90429" }],
  },

  /* ── Studio ── */
  Contemporary: {
    skin: SKIN.light, a: [-138, -150], b: [132, 118], la: [-46, 6], lb: [64, 70], lean: -18, tilt: -10,
    top: "#F2EBDD", sleeve: "short", legs: { c: "#E7DCC8", w: 8 },
    hair: { s: "topbun", c: "#5A3825" },
  },
  Modern: {
    skin: SKIN.mid, a: [-60, -152], b: [104, 12], la: [-6, 0], lb: [84, -6], lean: -16,
    top: "#F28C28", sleeve: "long", legs: { c: "#F28C28", w: 6.4 }, hair: { s: "topbun", c: HAIR },
  },
  Jazz: {
    skin: SKIN.deep, a: [-124, -148], b: [124, 148], la: [-4, 0], lb: [102, 100], lean: -6,
    top: BLACK, sleeve: "long", legs: { c: BLACK, w: 7 }, shoe: "#C49A6C", wear: [{ k: "vest", c: "#C1121F" }],
    gear: [{ k: "bowler", c: BLACK }], props: [{ k: "sparkle", hand: "a", c: "#FFF3B0" }, { k: "sparkle", hand: "b", c: "#FFF3B0" }],
  },
  "Jazz Funk": {
    skin: SKIN.tan, a: [-36, -156], b: [136, 152], la: [-14, 2], lb: [22, 6], lean: -8, fist: true,
    top: "#FF2E88", topLen: 0.55, sleeve: "none", legs: { c: "#2C3324", w: 10 }, shoe: "#F5F5F5",
    hair: { s: "pony", c: HAIR }, wear: [{ k: "chain", c: "#E9E9F2" }],
  },
  Ballet: {
    skin: SKIN.fair, face: -1, a: [-124, -120], b: [100, 104], la: [-1, 0], lb: [100, 96], lean: -12, point: true,
    top: "#F4C2D7", sleeve: "none", legs: { c: "#F7D9E3", w: 5.6 }, shoe: "#F4A9C4", tutu: "#FFFFFF",
    hair: { s: "bun", c: "#6B4423" }, gear: [{ k: "tiara", c: "#E9E9F2" }],
  },
  Tap: {
    skin: SKIN.dark, a: [-36, -8], b: [134, 158], la: [-6, 0], lb: [40, -32], lean: 3,
    top: "#FFFFFF", sleeve: "long", legs: { c: BLACK, w: 7 }, shoe: BLACK, wear: [{ k: "vest", c: "#E2B33C" }, { k: "collar", c: "#C1121F" }],
    gear: [{ k: "tophat", c: BLACK, c2: "#C1121F" }], props: [{ k: "cane", hand: "a", ang: 6, c: BLACK, c2: "#E9E9F2" }],
  },
  Lyrical: {
    skin: SKIN.light, a: [-142, -154], b: [118, 136], la: [-84, -70], lb: [92, 98], tilt: -10,
    top: "#BFE3FF", sleeve: "none", skirt: { len: 22, hem: 30, c: "#BFE3FF", wave: 1, tilt: 8, t: "#8CC8F5" }, point: true,
    hair: { s: "loose", c: "#6B4423" }, props: [{ k: "ribbon", hand: "b", ang: 120, c: "#FF6FA8" }],
  },
  Commercial: {
    skin: SKIN.mid, a: [-118, 162], b: [46, -28], la: [-6, 2], lb: [22, -4], lean: 7,
    top: "#D9D9E3", topLen: 0.55, sleeve: "none", legs: { c: BLACK, w: 10 }, shoe: "#F5F5F5",
    hair: { s: "long", c: HAIR }, gear: [{ k: "headset", c: "#444" }], wear: [{ k: "chain", c: "#E9E9F2" }],
  },
  Heels: {
    skin: SKIN.light, a: [-162, 118], b: [44, -34], la: [-4, 0], lb: [26, -14], lean: -8, heel: true,
    top: BLACK, sleeve: "none", shoe: "#C1121F",
    hair: { s: "loose", c: "#3A2418" }, wear: [{ k: "belt", c: "#C1121F" }],
  },

  /* ── World ── */
  Flamenco: {
    skin: SKIN.light, a: [-152, 158], b: [58, 26], la: [-4, 0], lb: [10, 6], lean: -6, tilt: -8,
    top: "#D90429", sleeve: "short", skirt: { len: 38, hem: 44, c: "#D90429", t: BLACK, wave: 1.2, tilt: -6, dots: "#fff", tiers: ["#D90429", "#D90429"] },
    heel: true, shoe: BLACK, hair: { s: "bun", c: HAIR }, gear: [{ k: "flower", c: "#FF4D6D" }],
    props: [{ k: "fan", hand: "a", ang: 168, c: BLACK, c2: "#D90429" }],
  },
  "Belly Dance": {
    skin: SKIN.tan, a: [-142, -150], b: [142, 150], la: [-6, 2], lb: [18, -8], lean: 6,
    top: GOLD, topLen: 0.42, sleeve: "none", skirt: { len: 36, hem: 28, c: "#1FA5A0", t: GOLD, bow: 0.14 },
    hair: { s: "loose", c: HAIR }, wear: [{ k: "hipscarf", c: "#7B2D8E", c2: GOLD }, { k: "necklace" }],
    props: [{ k: "veil", c: "#FF7AB6", c2: GOLD }],
  },

  /* ── Fitness & open ── */
  Zumba: {
    skin: SKIN.mid, a: [-156, -164], b: [156, 164], la: [-8, 2], lb: [72, -4], lean: -3,
    top: "#FF3D7F", topLen: 0.62, sleeve: "none", legs: { c: "#2B1B4A", w: 6.8, stripe: "#FF3D7F" }, shoe: "#FFFFFF",
    hair: { s: "pony", c: HAIR }, gear: [{ k: "sweatband", c: "#FFD23F" }],
  },
  Freestyle: {
    skin: SKIN.mid, a: [-96, -58], b: [60, 144], la: [-18, 8], lb: [22, -12], lean: 6,
    top: "#FF7A00", sleeve: "long", legs: { c: "#8A8F99", w: 8.6 }, shoe: "#FFFFFF",
    gear: [{ k: "headphones", c: "#1B1B22", c2: "#1B1B22" }],
  },
  "Open format": {
    skin: SKIN.tan, a: [-126, -126], b: [126, 126], la: [-20, -18], lb: [20, 18],
    top: "#FFFFFF", sleeve: "short", legs: { c: "#3E66B0", w: 7.6 }, shoe: "#E53935",
    hair: { s: "short", c: HAIR },
  },
};
