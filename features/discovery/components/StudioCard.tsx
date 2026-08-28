import Image from "next/image";
import Link from "next/link";
import { gradientOf } from "@/features/profiles/components/PublicProfile";
import { dosStyleColor } from "@/lib/constants/styles";
import { DOS_DISPLAY, INK } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import type { NearbyTenant } from "@/repositories/discovery";
import { DosStyleTile } from "./DiscoverFilters";
import { DosFollowers, DosWhere, initialsOf, kmLabel } from "./discover-kit";

const CARD = "var(--card)";
const EL = "var(--el)";

/**
 * A STUDIO IS A ROOM YOU WALK INTO — the prototype's StudioCard (4306-4369):
 * a 150px cover strip (the studio's photo when it has put one up, else a quiet
 * field in its own colours), the count of photos in the corner, THE STUDIO'S
 * OWN FACE ON THE COVER'S EDGE half on and half off, the name at full size,
 * then the one foot line — where, as one fact ("Pune  2.4 km"), and the
 * follower count — and the studio's styles as the app's own tiles, one line
 * that scrolls. The card opens the business's public page.
 */
export function StudioCard({ tenant, followers = 0, styles = [] }: { tenant: NearbyTenant; followers?: number; styles?: string[] }) {
  const grad = gradientOf(tenant.name);
  const photo = photoUrl(tenant.photoPath);
  const photos = photo ? 1 : 0;
  const place = tenant.city ?? tenant.area ?? "—";

  return (
    <Link
      href={publicProfilePath(tenant)}
      aria-label={`Open ${tenant.name}`}
      style={{
        display: "block",
        borderRadius: 20,
        overflow: "hidden",
        background: CARD,
        border: `1px solid ${EL}`,
        marginBottom: 12,
        color: INK,
        textDecoration: "none",
      }}
    >
      <div style={{ position: "relative" }}>
        <div style={{ height: 150, position: "relative", background: `linear-gradient(140deg, ${grad[0]}55, ${grad[1]}33), var(--el)` }}>
          {photo ? <Image src={photo} alt="" fill sizes="(max-width: 430px) 100vw, 430px" style={{ objectFit: "cover" }} /> : null}
        </div>
        {photos > 0 ? (
          <span aria-hidden="true" style={{ position: "absolute", right: 10, top: 10, fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "rgba(0,0,0,.5)", color: "rgba(255,255,255,.9)", fontVariantNumeric: "tabular-nums" }}>
            {photos} photo{photos === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {/* position:relative — the cover above is positioned and would otherwise paint over the face that overlaps it */}
      <div style={{ padding: "0 13px 12px", minWidth: 0, display: "flex", flexDirection: "column", gap: 5, position: "relative", zIndex: 1 }}>
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
              border: "3px solid var(--card)",
              boxSizing: "border-box",
              boxShadow: "0 6px 16px -6px rgba(0,0,0,.7)",
            }}
          >
            {initialsOf(tenant.name)}
          </span>
          <span style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
            <span style={{ display: "block", fontWeight: 900, fontSize: 17, letterSpacing: -0.4, fontFamily: DOS_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tenant.name}</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <DosWhere city={place} km={kmLabel(tenant.distanceKm)} />
          <DosFollowers n={followers} />
        </div>
        {/* the app's own style tiles — one line that scrolls, not a block that wraps (4360-4366) */}
        {styles.length ? (
          <div style={{ display: "flex", gap: 6, marginTop: 1, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", paddingBottom: 1 }}>
            {styles.map((s) => (
              <span key={s} style={{ flexShrink: 0, display: "inline-flex" }}>
                <DosStyleTile label={s} color={dosStyleColor(s)} small />
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
