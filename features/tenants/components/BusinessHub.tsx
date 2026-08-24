"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createTenantAction, type TenantActionState } from "@/features/tenants/server-actions/tenants";
import { DOS_CITIES } from "@/lib/constants/cities";
import { DOS_DISPLAY, DOS_TINT, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import type { Tenant, TenantType } from "@/types/tenant";

/* Icons + gradient painter lifted from the prototype (DanceOSApp.jsx:2944, 3136-3142). */
const STROKE = { fill: "none", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const dosToolPaint = (c: string) => `linear-gradient(135deg,${c} 0%, ${c}cc 55%, ${c}80 100%)`;

const StudioI = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9.5 21v-4h5v4M9 8h2M13 8h2M9 12h2M13 12h2" />
  </svg>
);

const ArtistI = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" stroke={color} {...STROKE}>
    <circle cx="12" cy="9.6" r="2.9" />
    <path d="M5.5 20.5c.8-3.2 3.3-4.9 6.5-4.9s5.7 1.7 6.5 4.9" />
    <path d="M7.8 6.4h8.4" />
    <path d="M9.4 6.4c0-1.9 1.1-3 2.6-3s2.6 1.1 2.6 3" />
  </svg>
);

const CARD = "var(--card)";
const EL = "var(--el)";
const ACCENT_STUDIO = DOS_TINT.studio;
const initialState: TenantActionState = { error: null };

const inp: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: EL,
  border: `1px solid ${EL}`,
  borderRadius: 12,
  padding: "11px 12px",
  color: INK,
  fontSize: 14,
  fontWeight: 600,
  outline: "none",
};

/** Businesses hub — layout lifted from the prototype's S_bizhub/Hub (DanceOSApp.jsx:2608-2686). */
export function BusinessHub({ tenants }: { tenants: Tenant[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [type, setType] = useState<TenantType>("studio");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  // the action revalidates in place (no navigation), so the sheet closes itself
  // once a creation lands — prototype behavior after "Create studio"
  const [state, formAction, isPending] = useActionState(
    async (prev: TenantActionState, formData: FormData) => {
      const result = await createTenantAction(prev, formData);
      if (result.created) {
        setSheetOpen(false);
        setName("");
        setArea("");
        setCity("");
      }
      return result;
    },
    initialState
  );

  const isStudio = type === "studio";
  const ok = name.trim().length > 0 && (!isStudio || (area.trim().length > 0 && city.length > 0));

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        paddingBottom: 40,
      }}
    >
      <div style={{ padding: "14px 16px 0" }}>
        <div
          style={{
            borderRadius: 22,
            padding: "15px 17px 14px",
            margin: "12px 0",
            position: "relative",
            overflow: "hidden",
            color: "#fff",
            background: dosToolPaint(ACCENT_STUDIO),
          }}
        >
          <div
            style={{
              position: "absolute",
              right: -28,
              top: -32,
              width: 130,
              height: 130,
              borderRadius: 65,
              background: "var(--el)",
            }}
          />
          <div
            style={{
              fontSize: 21,
              fontWeight: 800,
              letterSpacing: -0.5,
              position: "relative",
              fontFamily: DOS_DISPLAY,
              lineHeight: 1.18,
            }}
          >
            Your businesses
          </div>
        </div>

        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "#707070", margin: "2px 0 8px" }}>
          BUSINESSES YOU OWN
        </div>
        {tenants.length ? (
          tenants.map((t) => {
            const accent = DOS_TINT[t.type === "studio" ? "studio" : "trainer"];
            const sub = [t.area, t.city].filter(Boolean).join(", ") || "—";
            return (
              <Link
                key={t.id}
                href={`/business/${t.id}/classes`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  background: CARD,
                  border: `1px solid ${EL}`,
                  borderLeft: `4px solid ${accent}`,
                  borderRadius: 16,
                  padding: "12px 13px",
                  marginBottom: 9,
                  color: INK,
                  textDecoration: "none",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    flexShrink: 0,
                    background: `${accent}1c`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {t.type === "studio" ? <StudioI size={17} color={accent} /> : <ArtistI size={17} color={accent} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 10, color: SUB, marginTop: 1 }}>
                    {t.type === "studio" ? "Studio" : "Trainer business"} · {sub}
                  </div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: accent, flexShrink: 0 }}>Classes ›</span>
              </Link>
            );
          })
        ) : (
          <div style={{ fontSize: 11.5, color: SUB, padding: "0 2px 10px" }}>
            You do not run a studio or trainer business yet.
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSheetOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSheetOpen(true);
            }
          }}
          style={{
            textAlign: "center",
            padding: "13px",
            borderRadius: 16,
            border: `1.5px dashed ${ACCENT_STUDIO}`,
            color: ACCENT_STUDIO,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ＋ Add studio or business
        </div>
      </div>

      {/* "New studio" bottom sheet — lifted from DanceOSApp.jsx:2659-2685 */}
      {sheetOpen && (
        <div
          onClick={() => setSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 600,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New business"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: LILAC,
              borderRadius: "24px 24px 0 0",
              padding: "18px 16px 28px",
              width: "100%",
              maxWidth: 430,
              boxSizing: "border-box",
              maxHeight: "88vh",
              overflowY: "auto",
              color: INK,
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17, fontFamily: DOS_DISPLAY }}>New business</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "3px 0 14px", lineHeight: 1.5 }}>
              One studio = one location. Opening another branch later? Create it as its own studio — it gets
              its own profile page and calendar.
            </div>

            <form action={formAction}>
              <input type="hidden" name="type" value={type} />
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {(
                  [
                    { key: "studio", label: "Studio", accent: DOS_TINT.studio },
                    { key: "trainer_business", label: "Independent trainer", accent: DOS_TINT.trainer },
                  ] as const
                ).map((o) => {
                  const on = type === o.key;
                  return (
                    <div
                      key={o.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => setType(o.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setType(o.key);
                        }
                      }}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "11px",
                        borderRadius: 999,
                        cursor: "pointer",
                        fontSize: 12.5,
                        fontWeight: 800,
                        background: on ? `${o.accent}14` : EL,
                        color: on ? o.accent : SUB,
                        border: `2px solid ${on ? o.accent : "transparent"}`,
                        transition: "all .15s",
                      }}
                    >
                      {o.label}
                      {on && " ✓"}
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, color: SUB, margin: "0 0 4px" }}>
                {isStudio ? "Studio name" : "Business name"}
              </div>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isStudio ? "e.g. EEE Dance Studio — Andheri" : "e.g. Rhea Kapoor Dance Co."}
                style={inp}
              />
              <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>
                Area{isStudio ? " — the studio's single address" : " (optional)"}
              </div>
              <input
                name="area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Andheri West"
                style={inp}
              />
              <div style={{ fontSize: 12, color: SUB, margin: "12px 0 4px" }}>
                City{isStudio ? "" : " (optional)"}
              </div>
              <select
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{ ...inp, WebkitAppearance: "none", appearance: "none", cursor: "pointer" }}
              >
                <option value="">Pick a city</option>
                {DOS_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {state.error && (
                <div style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, marginTop: 12 }}>{state.error}</div>
              )}
              <button
                type="submit"
                disabled={!ok || isPending}
                style={{
                  marginTop: 14,
                  width: "100%",
                  textAlign: "center",
                  padding: "13px",
                  borderRadius: 999,
                  border: "none",
                  background: ok ? INK : EL,
                  color: ok ? LILAC : "#707070",
                  fontWeight: 800,
                  fontSize: 13.5,
                  cursor: ok ? "pointer" : "default",
                }}
              >
                {isPending ? "Creating…" : isStudio ? "Create studio" : "Create business"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
