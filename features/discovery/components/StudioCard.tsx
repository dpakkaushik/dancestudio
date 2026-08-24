import { DOS_DISPLAY, SUB } from "@/lib/design/tokens";
import type { NearbyTenant } from "@/repositories/discovery";

const CARD = "rgba(255,255,255,.07)";
const EL = "rgba(255,255,255,.13)";

/** Every studio wears a gradient of its own until real photos arrive — the same
 *  fallback the prototype's cover strip uses (DanceOSApp.jsx:4323). */
const GRADS: [string, string][] = [
  ["#E84393", "#F39C12"],
  ["#3B82F6", "#7C3AED"],
  ["#922B21", "#00CEC9"],
  ["#8E44AD", "#E84393"],
  ["#7C3AED", "#EC4899"],
  ["#0D9488", "#3498DB"],
];

const hashOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
};

const initialsOf = (name: string) =>
  name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/**
 * Discovery card for a studio or trainer business — lifted from the prototype's
 * StudioCard (DanceOSApp.jsx:4306-4351): cover strip, the business's own face
 * riding the cover's bottom-left edge half on and half off, name at full size,
 * the where-line underneath. Photos and follower counts arrive with Phase 3.
 */
export function StudioCard({ tenant }: { tenant: NearbyTenant }) {
  const grad = GRADS[hashOf(tenant.name) % GRADS.length];
  const sub = [
    tenant.type === "studio" ? "Studio" : "Trainer business",
    [tenant.area, tenant.city].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        borderRadius: 20,
        overflow: "hidden",
        background: CARD,
        border: `1px solid ${EL}`,
        marginBottom: 12,
      }}
    >
      <div style={{ position: "relative" }}>
        <div
          style={{
            height: 110,
            background: `linear-gradient(140deg, ${grad[0]}55, ${grad[1]}33)`,
          }}
        />
        <span
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            fontSize: 9,
            fontWeight: 800,
            padding: "2px 8px",
            borderRadius: 999,
            background: "rgba(0,0,0,.5)",
            color: "rgba(255,255,255,.9)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {tenant.distanceKm} km
        </span>
      </div>

      <div
        style={{
          padding: "0 13px 12px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 5,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: -26, marginBottom: 2, minWidth: 0 }}>
          <span
            style={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: 17,
              overflow: "hidden",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(150deg, ${grad[0]}, ${grad[1]})`,
              color: "#fff",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 0.5,
              fontFamily: DOS_DISPLAY,
              border: "3px solid #141414",
              boxSizing: "border-box",
              boxShadow: "0 6px 16px -6px rgba(0,0,0,.7)",
            }}
          >
            {initialsOf(tenant.name)}
          </span>
          <span style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
            <span
              style={{
                display: "block",
                fontWeight: 900,
                fontSize: 17,
                letterSpacing: -0.4,
                fontFamily: DOS_DISPLAY,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tenant.name}
            </span>
          </span>
        </div>
        <div style={{ fontSize: 11, color: SUB }}>{sub}</div>
      </div>
    </div>
  );
}
