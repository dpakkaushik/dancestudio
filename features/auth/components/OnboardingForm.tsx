"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { DosStyleCoin } from "@/components/ui/DosStyleKit";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { finishOnboardingAction, saveProfileBasicsAction } from "@/features/auth/server-actions/auth";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import { DOS_STYLE_REG, dosStyleColor } from "@/lib/constants/styles";
import { BTN_STYLE, DOS_DISPLAY, DOS_TINT, DOS_UI, INK, LINE, PINK, SUB } from "@/lib/design/tokens";
import { dosToolPaint } from "@/lib/format/styleInk";
import { photoUrl } from "@/lib/media/photo";
import type { Profile, ProfileRole, SocialLink } from "@/types/profile";

const ROLES: Array<{ key: ProfileRole; label: string; caption: string }> = [
  { key: "dancer", label: "Dancer", caption: "Learn, book classes, join crews" },
  { key: "trainer", label: "Artist / Trainer", caption: "Teach, run workshops, get booked" },
  { key: "studio", label: "Studio", caption: "Run your studio — batches, fees, rooms" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--card)",
  color: INK,
  border: `1.5px solid ${LINE}`,
  borderRadius: 14,
  padding: "13px 16px",
  fontSize: 15,
  outline: "none",
  fontFamily: "inherit",
};

const pressKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/** the ▲▼ pair every ordered list in the prototype's onboarding wears (3871-3875) */
function Arrows({ i, n, onMove }: { i: number; n: number; onMove: (dir: -1 | 1) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)} style={{ fontSize: 10, cursor: i === 0 ? "default" : "pointer", color: i === 0 ? LINE : SUB, lineHeight: 1, background: "none", border: "none", padding: 0, fontFamily: "inherit" }}>
        ▲
      </button>
      <button type="button" aria-label="Move down" disabled={i === n - 1} onClick={() => onMove(1)} style={{ fontSize: 10, cursor: i === n - 1 ? "default" : "pointer", color: i === n - 1 ? LINE : SUB, lineHeight: 1, background: "none", border: "none", padding: 0, fontFamily: "inherit" }}>
        ▼
      </button>
    </div>
  );
}

const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/** one platform's row on the socials step (Soc, 3660-3664) */
function Soc({ ic, ph, val, set, color, label }: { ic: React.ReactNode; ph: string; val: string; set: (v: string) => void; color: string; label: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--card)", color: INK, border: `1.5px solid ${LINE}`, borderRadius: 14, padding: "5px 6px 5px 12px", marginBottom: 10 }}>
      <span style={{ width: 26, textAlign: "center" }}>{ic}</span>
      <input value={val} onChange={(e) => set(e.target.value)} placeholder={ph} aria-label={label} style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 13.5, padding: "9px 0", background: "transparent", color: INK, fontFamily: "inherit" }} />
      {val ? <span style={{ color, fontWeight: 900, marginRight: 8 }}>✓</span> : null}
    </div>
  );
}

const asUrl = (v: string): string => {
  const t = v.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

type Step = "profile" | "styles" | "socials" | "done";

/** ONBOARDING — the prototype's four screens (3781-3943), lifted whole and wired
 *  to the fields the Profile slice gave a person: PROFILE (the photo, required;
 *  the name; the role and city, which are this app's additions — U3), STYLES
 *  (the registry as a grid, an order you arrange), SOCIALS (three platforms and
 *  anything else, optional), and TAKE A BOW.
 *
 *  Why the row is created at the end of the FIRST screen rather than the last:
 *  the photo, the styles and the links are written onto the profile ROW, and
 *  `set_my_avatar` / `update_my_profile` both refuse a person with no row
 *  ("finish onboarding first"). So Continue on the first screen creates the row
 *  and stays; every later screen writes onto it; "Open DanceOS →" leaves. A
 *  reload mid-way lands on Home with the basics saved and the rest one tap away
 *  on the Profile tab — nothing is lost, only the ceremony.
 *
 *  Not lifted, and a backlog row each (U2 needs field (b)): the date of birth
 *  and the 18+ gate (no column holds a birth date), and "Missing a style?
 *  Suggest it" (a demo toast in the prototype). The photo is the app's own
 *  PhotoPicker — the crop step belongs to the posters slice. */
export function OnboardingForm({ userId, existing = null }: { userId: string; existing?: Profile | null }) {
  /* RESUMING: a row already exists when the page re-renders mid-flow (every server
     action refetches the route) or when somebody comes back the next morning —
     the form picks up from what the row holds rather than asking it all again */
  const [first, ...rest] = (existing?.fullName ?? "").split(" ");
  const [step, setStep] = useState<Step>(existing ? (existing.avatarPath ? "styles" : "profile") : "profile");
  const [fn, setFn] = useState(existing ? first : "");
  const [ln, setLn] = useState(existing ? rest.join(" ") : "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [role, setRole] = useState<ProfileRole>(existing?.role ?? "dancer");
  const [avatarPath, setAvatarPath] = useState<string | null>(existing?.avatarPath ?? null);
  const [saved, setSaved] = useState(Boolean(existing));
  const [mine, setMine] = useState<string[]>(existing?.styles ?? []);
  const [yt, setYt] = useState("");
  const [ig, setIg] = useState("");
  const [fb, setFb] = useState("");
  const [extras, setExtras] = useState<Array<{ label: string; url: string }>>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  const fullName = `${fn.trim()} ${ln.trim()}`.trim();
  const handle = (fn + ln).toLowerCase().replace(/[^a-z]/g, "") || "you";
  const face = photoUrl(avatarPath);

  /* the button says what is missing (3820-3821): the reason, not a grey nothing */
  const missing = !fn.trim() ? "Enter your first name" : !avatarPath ? "Add your profile photo" : "";
  const ready = !missing;

  /* every later screen lands on the ONE record, through the Profile tab's own door */
  const socials = (): SocialLink[] => {
    const out: SocialLink[] = [];
    if (yt.trim()) out.push({ platform: "YouTube", url: asUrl(yt) });
    if (ig.trim()) out.push({ platform: "Instagram", url: asUrl(ig) });
    if (fb.trim()) out.push({ platform: "Facebook", url: asUrl(fb) });
    extras.forEach((x) => {
      if (x.label.trim() && x.url.trim()) out.push({ platform: x.label.trim().slice(0, 40), url: asUrl(x.url) });
    });
    return out;
  };
  const writeProfile = (next: { styles: string[]; socials: SocialLink[] }, then: () => void) => {
    start(async () => {
      const out = await updateMyProfileAction({ fullName, city: city.trim() || null, age: null, about: null, phone: null, styles: next.styles, socials: next.socials });
      if (out.error) return fire(out.error);
      then();
    });
  };

  /* ─── PROFILE ─── */
  if (step === "profile") {
    return (
      <AuthShell toast={toast} progress={[1, 3]}>
        <div style={{ fontSize: 24, fontWeight: 800, margin: "14px 0 4px", fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>Set up your profile</div>
        <div style={{ fontSize: 13, color: SUB, marginBottom: 18 }}>A photo and your basics — this is how the community sees you.</div>

        {/* ONE PICTURE, OF THEM, SQUARE (3783-3796) — no cover photo. The picker is the app's
            own; it needs the row to exist, so before the first Continue the square explains
            that the photo comes right after the name. */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div aria-label={face ? "Your profile photo" : "Your profile photo, not added yet"} style={{ width: 112, height: 112, borderRadius: 24, overflow: "hidden", background: "rgba(255,255,255,.07)", border: face ? "none" : `2px dashed ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", color: SUB, fontSize: 26, fontWeight: 800, flexShrink: 0, position: "relative" }}>
            {face ? <Image src={face} alt="" width={112} height={112} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : "📷"}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 6 }}>
            {saved ? (
              <PhotoPicker owner={{ kind: "avatar", id: userId }} hasPhoto={Boolean(avatarPath)} label="Change your photo" onSaved={setAvatarPath} />
            ) : (
              <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>Your name first — the photo comes right after, on this screen.</div>
            )}
            <div style={{ fontSize: 11, color: SUB, margin: "8px 0 0" }}>{face ? "this is how your profile will look · change it any time" : "your profile photo · required"}</div>
          </div>
        </div>
        <div style={{ height: 22 }} />

        <div style={{ display: "flex", gap: 8 }}>
          <input value={fn} onChange={(e) => setFn(e.target.value.replace(/(^|\s)\S/g, (c) => c.toUpperCase()))} placeholder="First name" autoFocus disabled={saved} style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "13px 14px", fontSize: 14, opacity: saved ? 0.7 : 1 }} />
          <input value={ln} onChange={(e) => setLn(e.target.value.replace(/(^|\s)\S/g, (c) => c.toUpperCase()))} placeholder="Last name" disabled={saved} style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "13px 14px", fontSize: 14, opacity: saved ? 0.7 : 1 }} />
        </div>
        {fn.trim() ? (
          <div style={{ fontSize: 12, color: SUB, marginTop: 10 }}>
            Your handle: <b style={{ color: PINK }}>@{handle}</b> · editable later
          </div>
        ) : null}

        {/* the role and the city are this app's additions (U3) — the prototype derives the
            role from the subscription and asks the city later */}
        <div style={{ fontSize: 12, color: SUB, fontWeight: 700, margin: "16px 0 8px", letterSpacing: 0.5 }}>I AM HERE AS A…</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {ROLES.map((r) => {
            const on = role === r.key;
            const accent = DOS_TINT[r.key];
            return (
              <div key={r.key} role="button" tabIndex={0} aria-pressed={on} aria-disabled={saved} onClick={() => !saved && setRole(r.key)} onKeyDown={pressKey(() => !saved && setRole(r.key))} style={{ padding: "13px 16px", borderRadius: 14, cursor: saved ? "default" : "pointer", background: on ? `${accent}14` : "var(--card)", border: `2px solid ${on ? accent : LINE}`, transition: "all .15s", opacity: saved && !on ? 0.55 : 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: on ? accent : INK }}>
                  {r.label}
                  {on && " ✓"}
                </div>
                <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{r.caption}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>CITY (OPTIONAL)</div>
        <input name="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" disabled={saved} style={{ ...inputStyle, marginBottom: 16, opacity: saved ? 0.7 : 1 }} />

        <button
          type="button"
          disabled={pending || (!saved && !fn.trim()) || (saved && !ready)}
          aria-disabled={!saved ? !fn.trim() : !ready}
          onClick={() => {
            if (!saved) {
              /* the first Continue makes the row, and stays — the photo needs it */
              start(async () => {
                const out = await saveProfileBasicsAction({ fullName, role, city: city.trim() || undefined });
                if (out.error) return fire(out.error);
                setSaved(true);
              });
              return;
            }
            if (ready) setStep("styles");
          }}
          style={{ ...BTN_STYLE, background: (!saved ? fn.trim() : ready) ? PINK : LINE, color: (!saved ? fn.trim() : ready) ? "#fff" : SUB, marginTop: 4, transition: "all .2s" }}
        >
          {pending ? "Saving…" : !saved ? (fn.trim() ? "Continue" : "Enter your first name") : ready ? "Continue" : missing}
        </button>
      </AuthShell>
    );
  }

  /* ─── STYLES (3860-3888) ─── */
  if (step === "styles") {
    return (
      <AuthShell toast={toast} progress={[2, 3]}>
        <button type="button" aria-label="Back" onClick={() => setStep("profile")} style={{ fontSize: 20, cursor: "pointer", background: "none", border: "none", color: INK, padding: 0, fontFamily: "inherit" }}>
          ←
        </button>
        <div style={{ fontSize: 24, fontWeight: 800, margin: "14px 0 4px", fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>Your dance styles</div>
        <div style={{ fontSize: 13, color: SUB, marginBottom: 18 }}>Everyone starts as a dancer — this shapes your feed &amp; recommendations.</div>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: SUB, marginBottom: 8 }}>
          🕺 STYLES YOU DANCE <span style={{ fontWeight: 600, letterSpacing: 0 }}>· how you&apos;d describe yourself</span>
        </div>
        {/* StyleGrid (3655-3659): every style in the registry, a coin and its name, ✓ when picked */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          {DOS_STYLE_REG.map(([l]) => {
            const on = mine.includes(l);
            return (
              <button type="button" key={l} aria-pressed={on} aria-label={l} onClick={() => setMine((v) => (on ? v.filter((x) => x !== l) : [...v, l]))} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px 6px 6px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 750, background: on ? `${PINK}14` : "var(--card)", color: on ? PINK : SUB, border: `2px solid ${on ? PINK : LINE}`, transition: "all .15s", fontFamily: "inherit" }}>
                <DosStyleCoin label={l} size={30} active={on} />
                {l}
                {on ? " ✓" : ""}
              </button>
            );
          })}
        </div>
        {mine.length > 1 ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: SUB, margin: "10px 0 6px" }}>Drag order with ↑↓ — this is the order shown on your profile.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
              {mine.map((l, i, arr) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: 12, background: "var(--card)", color: INK, border: `1.5px solid ${LINE}` }}>
                  <Arrows i={i} n={arr.length} onMove={(dir) => setMine(move(arr, i, dir))} />
                  <DosStyleCoin label={l} size={24} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{l}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        <button
          type="button"
          disabled={pending || mine.length === 0}
          aria-disabled={mine.length === 0}
          onClick={() => mine.length && writeProfile({ styles: mine, socials: [] }, () => setStep("socials"))}
          style={{ ...BTN_STYLE, background: mine.length ? PINK : LINE, color: mine.length ? "#fff" : SUB, marginTop: 14 }}
        >
          {pending ? "Saving…" : mine.length ? `Continue · ${mine.length} ${mine.length === 1 ? "style" : "styles"}` : "Pick at least one style"}
        </button>
      </AuthShell>
    );
  }

  /* ─── SOCIALS (3890-3913) ─── */
  if (step === "socials") {
    const any = Boolean(yt.trim() || ig.trim() || fb.trim() || extras.some((x) => x.url.trim()));
    return (
      <AuthShell toast={toast} progress={[3, 3]}>
        <button type="button" aria-label="Back" onClick={() => setStep("styles")} style={{ fontSize: 20, cursor: "pointer", background: "none", border: "none", color: INK, padding: 0, fontFamily: "inherit" }}>
          ←
        </button>
        <div style={{ fontSize: 24, fontWeight: 800, margin: "14px 0 4px", fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>Your social links</div>
        <div style={{ fontSize: 13, color: SUB, marginBottom: 16 }}>Optional now — worth adding if you set up a trainer or studio profile.</div>
        <Soc ic={<span style={{ color: "#FF0000", fontWeight: 900 }}>▶</span>} ph="YouTube channel URL" label="YouTube channel URL" val={yt} set={setYt} color="#FF0000" />
        <Soc ic={<span style={{ background: "linear-gradient(45deg,#F56040,#C13584)", WebkitBackgroundClip: "text", color: "transparent", fontWeight: 900 }}>◎</span>} ph="Instagram profile URL" label="Instagram profile URL" val={ig} set={setIg} color="#C13584" />
        <Soc ic={<span style={{ color: "#1877F2", fontWeight: 900, fontFamily: "Georgia" }}>f</span>} ph="Facebook profile URL" label="Facebook profile URL" val={fb} set={setFb} color="#1877F2" />
        {extras.map((x, i, arr) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <Arrows i={i} n={arr.length} onMove={(dir) => setExtras(move(arr, i, dir))} />
            <input value={x.label} onChange={(e) => setExtras((a) => a.map((v, vi) => (vi === i ? { ...v, label: e.target.value } : v)))} placeholder="Label (e.g. Website)" aria-label="Link label" style={{ ...inputStyle, width: 110, flex: "0 0 auto", padding: "11px 10px", fontSize: 13 }} />
            <input value={x.url} onChange={(e) => setExtras((a) => a.map((v, vi) => (vi === i ? { ...v, url: e.target.value } : v)))} placeholder="https://…" aria-label="Link URL" style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "11px 12px", fontSize: 13 }} />
            <button type="button" aria-label="Remove this link" onClick={() => setExtras((a) => a.filter((_, vi) => vi !== i))} style={{ alignSelf: "center", color: "#EF4444", fontWeight: 900, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setExtras((a) => [...a, { label: "", url: "" }])} style={{ fontSize: 12.5, fontWeight: 800, color: PINK, cursor: "pointer", margin: "4px 0 16px", background: "none", border: "none", padding: 0, fontFamily: "inherit" }}>
          ＋ Add another link
        </button>
        <button type="button" disabled={pending} onClick={() => writeProfile({ styles: mine, socials: socials() }, () => setStep("done"))} style={{ ...BTN_STYLE, background: PINK, color: "#fff" }}>
          {pending ? "Saving…" : any ? "Continue" : "Skip for now →"}
        </button>
      </AuthShell>
    );
  }

  /* ─── DONE — take a bow 🎉 (3915-3943) ─── */
  const myStyles = [...new Set(mine)].slice(0, 5);
  return (
    <div style={{ background: "radial-gradient(ellipse at 50% 16%, #2E1D45 0%, #0E0A14 60%)", minHeight: "100vh", color: "#F5F2FA", maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, padding: "52px 22px 44px", boxSizing: "border-box", position: "relative", overflow: "hidden", textAlign: "center" }}>
      <style>{`
        @keyframes dosConf{0%{transform:translateY(-8vh) rotate(0)}100%{transform:translateY(108vh) rotate(720deg)}}
        @keyframes dosOrb{to{transform:rotate(360deg)}}
        @keyframes dosGlow{0%,100%{box-shadow:0 0 24px rgba(236,72,153,.4)}50%{box-shadow:0 0 46px rgba(236,72,153,.75)}}
        @keyframes dosRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion:reduce){*{animation:none !important}}
      `}</style>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} aria-hidden="true" style={{ position: "absolute", top: 0, left: `${(i * 61) % 100}%`, width: 7, height: 11, borderRadius: 2, background: ["#EC4899", "#F59E0B", "#22C55E", "#3498DB", "#7C3AED"][i % 5], animation: `dosConf ${2.6 + (i % 5) * 0.5}s linear ${i * 0.22}s infinite`, opacity: 0.85 }} />
      ))}
      <div style={{ fontSize: 12, letterSpacing: 3, color: "#B7AECB", animation: "dosRise .5s ease both" }}>5 · 6 · 7 · 8</div>
      <div style={{ display: "flex", justifyContent: "center", margin: "22px 0 0", animation: "dosRise .5s .1s ease both" }}>
        <div style={{ position: "relative", width: 112, height: 112 }}>
          <div aria-hidden="true" style={{ position: "absolute", inset: -7, borderRadius: 63, animation: "dosOrb 3s linear infinite", background: "conic-gradient(from 0deg,#EC4899,#F59E0B,transparent 62%,#EC4899)", WebkitMask: "radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px))", mask: "radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px))" }} />
          <div style={{ width: 112, height: 112, borderRadius: 56, overflow: "hidden", animation: "dosGlow 2.4s ease infinite", background: "#1A1425", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42 }}>
            {face ? <Image src={face} alt="" width={112} height={112} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : "🕺"}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, margin: "18px 0 4px", animation: "dosRise .5s .2s ease both", fontFamily: DOS_DISPLAY }}>Take a bow, {fn.trim() || "dancer"}!</div>
      <div style={{ fontSize: 13.5, color: "#B7AECB", animation: "dosRise .5s .25s ease both" }}>@{handle} · the stage is officially yours.</div>
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8, margin: "28px 0 8px", animation: "dosRise .5s .35s ease both" }}>
        {myStyles.map((l) => {
          const c = dosStyleColor(l) || "#EC4899";
          return (
            <span key={l} style={{ padding: "9px 15px", borderRadius: 999, background: dosToolPaint(c), color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: DOS_DISPLAY, letterSpacing: -0.2, boxShadow: `0 3px 12px ${c}44` }}>
              {l}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: "#7E7492", animation: "dosRise .5s .4s ease both" }}>your styles — already dancing</div>
      <div style={{ fontSize: 12.5, color: "#B7AECB", marginTop: 22, background: "rgba(255,255,255,.05)", border: "1px solid #241B33", borderRadius: 14, padding: "11px 14px", lineHeight: 1.55, animation: "dosRise .5s .5s ease both" }}>
        🏢 Teach or run a studio? Set up your <b style={{ color: "#F5F2FA" }}>business profile anytime</b> from your Profile tab.
      </div>
      {/* the flow ends here and nowhere else: the cookie goes with it, and Home is next */}
      <button type="button" disabled={pending} onClick={() => start(async () => { await finishOnboardingAction(); })} style={{ marginTop: 26, padding: 16, borderRadius: 999, background: "#EC4899", color: "#fff", fontWeight: 800, fontSize: 15.5, cursor: "pointer", animation: "dosGlow 2.4s ease infinite", border: "none", width: "100%", fontFamily: "inherit" }}>
        Open DanceOS →
      </button>
      {toast ? <div role="status" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 40 }}>{toast}</div> : null}
    </div>
  );
}
