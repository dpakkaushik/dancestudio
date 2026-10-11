/**
 * The dance style registry — lifted from prototype/DanceOSApp.jsx:1630-1669
 * (DOS_STYLE_REG). A style's colour lives HERE and nowhere else, so every card,
 * chip and band that names a style draws it the same way.
 *
 * ⚠ 49 STYLES, NOT 66 (2 Oct 2026, the user: "remove some unpopular dance
 * styles", and their pick of the list). Gone: Litefeet, Tutting, Animation,
 * Voguing, Merengue, Cha-Cha, Rumba, Kizomba, Jive, Swing, Lindy Hop, Waltz,
 * Acro, Musical Theatre, Capoeira, Chhau, Yakshagana. ⚠ Not one of them was
 * used by any class, profile, studio, crew or routine on production when they
 * went (counted first), so nothing a person has saved names a style that is no
 * longer here. The database holds styles as free text, so nothing there moved.
 */
/* ⚠ A RICH PALETTE, NOT THE PROTOTYPE'S NEON (12 Oct 2026, the user: "can we use
   more subtle colors for the dance styles instead of the neon ones to give it a
   rich and premium look in different colors for every style though. make it
   look rich and luxurious"). Every style keeps a colour of its own, but they
   are jewel and earth tones now — garnet, amethyst, jade, lapis, saffron rust,
   oxblood, antique gold — deep enough that white reads on every one of them, and
   still apart from each other within a family. Each family keeps a register:
   the classical forms are jewels, the folk forms are spice and earth, street is
   slate and moss, the studio styles are ink and dusk. */
export const DOS_STYLE_REG: ReadonlyArray<readonly [string, string]> = [
  /* Indian classical — jewels */
  ["Bharatanatyam", "#9E3B45"], ["Kathak", "#6B4E8A"], ["Kathakali", "#3E6B4E"],
  ["Kuchipudi", "#8A4F7D"], ["Manipuri", "#7A2638"], ["Mohiniyattam", "#2E6E62"],
  ["Odissi", "#A8577A"], ["Sattriya", "#8C6A3E"], ["Semi-classical", "#9C5A6E"],
  /* Indian folk — spice and earth */
  ["Bhangra", "#B5652E"], ["Garba", "#A2452C"], ["Dandiya Raas", "#8E3A2F"],
  ["Ghoomar", "#7A4A2A"], ["Kalbelia", "#9A5F45"], ["Lavani", "#8E3F5F"],
  ["Bihu", "#5A6B34"], ["Giddha", "#B0697A"], ["Sufi Whirling", "#3F5A8C"],
  /* Bollywood */
  ["Bollywood", "#B0605A"], ["Bolly-Hop", "#8B3D6B"],
  /* Street — slate, moss, steel */
  ["Hip-Hop", "#2F4F6E"], ["Breaking", "#36593F"], ["Popping", "#3D6E8C"],
  ["Locking", "#8A7536"], ["House", "#2F7058"], ["Waacking", "#5E6398"],
  ["Krump", "#93364D"],
  /* Global street */
  ["Dancehall", "#5E6B2A"], ["Afrobeats", "#5B4C82"], ["Reggaeton", "#A63A4C"],
  ["K-pop", "#4A4E95"],
  /* Latin */
  ["Salsa", "#A85A60"], ["Bachata", "#A34F68"], ["Samba", "#A8762E"],
  /* Ballroom */
  ["Ballroom", "#6E5A9A"], ["Tango", "#8C2F4E"],
  /* Studio — ink and dusk */
  ["Contemporary", "#3A6A7A"], ["Modern", "#6A4A80"], ["Jazz", "#8A6A34"],
  ["Jazz Funk", "#6B6230"], ["Ballet", "#94657C"], ["Tap", "#7E2E35"],
  ["Lyrical", "#3E5E8E"], ["Commercial", "#75507E"], ["Heels", "#8E4252"],
  /* World */
  ["Flamenco", "#9A2F5A"], ["Belly Dance", "#946488"],
  /* Fitness & open */
  ["Zumba", "#6F7E2E"], ["Freestyle", "#4F6E9E"], ["Open format", "#7E4A7A"],
] as const;

export const DOS_STYLE_NAMES: readonly string[] = DOS_STYLE_REG.map(([name]) => name);

const STYLE_COLOR_BY_LABEL: Record<string, string> = Object.fromEntries(DOS_STYLE_REG);

/** A style's colour — ask the registry, never a copy on the record (prototype line 1684). */
export const dosStyleColor = (style: string): string =>
  STYLE_COLOR_BY_LABEL[style] ?? "#4F6E9E";

/** Class levels — prototype S_classform LEVELS (DanceOSApp.jsx:15125-15126). */
export const DOS_LEVELS = [
  ["all", "All levels", "✨"],
  ["beginner", "Beginner", "🌱"],
  ["intermediate", "Intermediate", "🌿"],
  ["professional", "Professional", "🏆"],
] as const;

export const DOS_LEVEL_LABEL: Record<string, string> = Object.fromEntries(
  DOS_LEVELS.map(([code, label]) => [code, label])
);

/** A class is named by what it IS — its style and its level — never typed.
 *  The prototype's `dosClassLabel` (DanceOSApp.jsx:176-183) builds every class
 *  record's `t` this way ("Hip-Hop · Beginner", "Jazz · All levels"), and its
 *  form has no name field (S_classform 15309-15531). Derived on every save, so
 *  a class whose style or level is changed is renamed with it. */
export const dosClassLabel = (style: string, level: string): string =>
  [style, DOS_LEVEL_LABEL[level] ?? level].filter(Boolean).join(" · ") || "Class";
