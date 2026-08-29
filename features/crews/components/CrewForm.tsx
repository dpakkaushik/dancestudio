"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCrewAction } from "@/features/crews/server-actions/crews";
import { PeoplePicker, personGradient, personInitials } from "@/features/people/components/PeoplePicker";
import { DOS_CITIES, type DosCity } from "@/lib/constants/cities";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import type { Profile } from "@/types/profile";
import { Toast, pressKey } from "./crew-kit";

/** Create your crew — prototype S_profiletab's `crewFormOnly` render
 *  (9545-9611): the blue sleeve ("Details · members · done — you'll be the
 *  leader"), DETAILS (name, city, style), MEMBERS · N added as a row of faces
 *  with the dashed ＋, the Save crew bar, and the CONFIRM · CREATE CREW sheet.
 *  "AND NOW IT ACTUALLY CREATES ONE": the crew is a record, you are its leader,
 *  and the manager opens on it. Everyone you added is being put on a public
 *  roster — same rule as everywhere — so each of them is ASKED, not written. */

const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "12px 14px", marginBottom: 10 };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--solid)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "var(--text)", outline: "none", fontFamily: DOS_UI };
const sel: React.CSSProperties = { flex: 1, minWidth: 0, background: "var(--solid)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "10px", color: "var(--text)", fontSize: 12, fontWeight: 700, outline: "none", WebkitAppearance: "none", appearance: "none", fontFamily: DOS_UI };

export function CrewForm({ defaultCity }: { defaultCity: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [city, setCity] = useState<DosCity>(defaultCity && (DOS_CITIES as readonly string[]).includes(defaultCity) ? (defaultCity as DosCity) : "New Delhi");
  const [style, setStyle] = useState("");
  const [members, setMembers] = useState<Profile[]>([]);
  const [pick, setPick] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2300);
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const out = await createCrewAction({ name: name.trim(), city, style: style || "All styles", memberIds: members.map((m) => m.id) });
    setBusy(false);
    setConfirm(false);
    if (out.error || !out.crewId) {
      fire(out.error ?? "Give the crew a name first");
      return;
    }
    fire(`🎉 ${name.trim()} created — you're the leader`);
    setTimeout(() => router.push(`/crews/${out.crewId}/manage`), 700);
  };

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ margin: "12px 16px 0", borderRadius: 22, padding: "18px 18px 14px", background: "linear-gradient(135deg,#2563EB,#60A5FA)", color: "#fff" }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Create your crew</div>
        <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 2 }}>Details · members · done — you&apos;ll be the leader</div>
      </div>
      <div style={{ padding: "12px 16px 0", textAlign: "left" }}>
        <div style={card}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", marginBottom: 8 }}>DETAILS</div>
          <input value={name} aria-label="Crew name" onChange={(e) => setName(e.target.value.slice(0, 64))} placeholder="Crew name" style={{ ...inp, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <select value={city} aria-label="City" onChange={(e) => setCity(e.target.value as DosCity)} style={sel}>
              {DOS_CITIES.map((x) => (
                <option key={x} value={x}>
                  📍 {x}
                </option>
              ))}
            </select>
          </div>
          {/* the app's one style picker (9561) — searchable, with "All styles" above the list */}
          <div style={{ marginTop: 8 }}>
            <DosStylePicker value={style} onChange={setStyle} all placeholder="Dance style" />
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", marginBottom: 8 }}>MEMBERS · {members.length} added</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
            {members.map((m) => {
              const g = personGradient(m.fullName);
              return (
                <div key={m.id} style={{ textAlign: "center", width: 58, flexShrink: 0 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${m.fullName} from the list`}
                    onKeyDown={pressKey(() => setMembers((ms) => ms.filter((x) => x.id !== m.id)))}
                    onClick={() => setMembers((ms) => ms.filter((x) => x.id !== m.id))}
                    style={{ width: 44, height: 44, borderRadius: 22, margin: "0 auto", background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" }}
                  >
                    {personInitials(m.fullName)}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--sub)", marginTop: 3, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.fullName.split(" ")[0]}</div>
                </div>
              );
            })}
            <div role="button" tabIndex={0} aria-label="Add a member" onKeyDown={pressKey(() => setPick((v) => !v))} onClick={() => setPick((v) => !v)} style={{ textAlign: "center", width: 58, flexShrink: 0, cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, border: "2px dashed var(--el)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "var(--sub)", margin: "0 auto" }}>＋</div>
              <div style={{ fontSize: 9, color: "var(--sub)", marginTop: 3, fontWeight: 700 }}>Add</div>
            </div>
          </div>
          {pick ? (
            <div style={{ marginTop: 10 }}>
              <PeoplePicker
                title="CREW MEMBERS"
                placeholder="Add dancers or artists…"
                actionWord="Add ›"
                exclude={members.map((m) => m.id)}
                pickLabel={(p) => `Add ${p.fullName} to the crew`}
                onPick={(p) => {
                  setMembers((ms) => (ms.some((x) => x.id === p.id) ? ms : [...ms, p]));
                  fire(`✅ ${p.fullName} added — they'll be asked to confirm`);
                }}
              />
            </div>
          ) : null}
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Save crew"
          onKeyDown={pressKey(() => (name.trim() ? setConfirm(true) : fire("Name your crew first")))}
          onClick={() => (name.trim() ? setConfirm(true) : fire("Name your crew first"))}
          style={{ textAlign: "center", padding: "14px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 14, cursor: "pointer" }}
        >
          Save crew
        </div>
        {confirm ? (
          <div onClick={() => setConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 620 }}>
            <div role="dialog" aria-modal="true" aria-label="Confirm · create crew" onClick={(e) => e.stopPropagation()} style={{ background: "var(--solid)", color: "var(--text)", borderRadius: "24px 24px 0 0", padding: "18px 16px 28px", width: "100%", maxWidth: 430, boxSizing: "border-box", textAlign: "center" }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--muted)" }}>CONFIRM · CREATE CREW</div>
              <b style={{ fontSize: 17, display: "block", marginTop: 8 }}>{name.trim()}</b>
              <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 4 }}>
                {style || "All styles"} · {city} · {members.length} member{members.length === 1 ? "" : "s"} + you as leader
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="button" onClick={() => setConfirm(false)} style={{ flex: 1, textAlign: "center", padding: "12px", borderRadius: 999, background: "var(--card)", border: "1px solid var(--el)", color: "var(--text)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Go back
                </button>
                <button type="button" disabled={busy} onClick={() => void create()} style={{ flex: 1.3, textAlign: "center", padding: "12px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13, cursor: "pointer", border: "none", fontFamily: "inherit" }}>
                  {busy ? "Creating…" : "Confirm & create"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <Toast msg={toast} />
    </div>
  );
}
