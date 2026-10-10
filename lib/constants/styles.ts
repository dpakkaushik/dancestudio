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
export const DOS_STYLE_REG: ReadonlyArray<readonly [string, string]> = [
  /* Indian classical */
  ["Bharatanatyam", "#DA545B"], ["Kathak", "#A87DDA"], ["Kathakali", "#57A05F"],
  ["Kuchipudi", "#BF68D9"], ["Manipuri", "#BC0C3C"], ["Mohiniyattam", "#00946F"],
  ["Odissi", "#FF42BC"], ["Sattriya", "#BC864B"], ["Semi-classical", "#E5499D"],
  /* Indian folk */
  ["Bhangra", "#F06705"], ["Garba", "#CD3300"], ["Dandiya Raas", "#AF3020"],
  ["Ghoomar", "#974811"], ["Kalbelia", "#C76F43"], ["Lavani", "#AE4072"],
  ["Bihu", "#50722C"], ["Giddha", "#E46696"], ["Sufi Whirling", "#4563F4"],
  /* Bollywood */
  ["Bollywood", "#D4766B"], ["Bolly-Hop", "#B5367E"],
  /* Street */
  ["Hip-Hop", "#0065A2"], ["Breaking", "#1A6C3A"], ["Popping", "#009AF6"],
  ["Locking", "#A58918"], ["House", "#00A855"], ["Waacking", "#808CD6"],
  ["Krump", "#C53562"],
  /* Global street */
  ["Dancehall", "#5D7000"], ["Afrobeats", "#625499"], ["Reggaeton", "#F4104C"],
  ["K-pop", "#534FC0"],
  /* Latin */
  ["Salsa", "#CB687B"], ["Bachata", "#FE4F7A"], ["Samba", "#CB8000"],
  /* Ballroom */
  ["Ballroom", "#9570EA"], ["Tango", "#FF158A"],
  /* Studio */
  ["Contemporary", "#009ECE"], ["Modern", "#833EAC"], ["Jazz", "#966200"],
  ["Jazz Funk", "#6C5E12"], ["Ballet", "#8D447B"], ["Tap", "#CB0020"],
  ["Lyrical", "#005FC3"], ["Commercial", "#8A50A2"], ["Heels", "#9F3C51"],
  /* World */
  ["Flamenco", "#B40096"], ["Belly Dance", "#C079B4"],
  /* Fitness & open */
  ["Zumba", "#869A00"], ["Freestyle", "#6E88FF"], ["Open format", "#A03992"],
] as const;

export const DOS_STYLE_NAMES: readonly string[] = DOS_STYLE_REG.map(([name]) => name);

const STYLE_COLOR_BY_LABEL: Record<string, string> = Object.fromEntries(DOS_STYLE_REG);

/** A style's colour — ask the registry, never a copy on the record (prototype line 1684). */
export const dosStyleColor = (style: string): string =>
  STYLE_COLOR_BY_LABEL[style] ?? "#6E88FF";

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
