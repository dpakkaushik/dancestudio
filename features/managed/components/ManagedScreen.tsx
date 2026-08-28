import Link from "next/link";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EventCard } from "@/features/events/components/EventCard";
import { DOS_TINT, DOS_UI, INK, LILAC, LINE, SUB } from "@/lib/design/tokens";
import { EV_TINT } from "@/types/event";
import { MANAGED_FILTERS, type ManagedKind, type ManagedListing } from "@/types/managed";
import type { Tenant } from "@/types/tenant";

/** S_managed — "everything you manage", lifted from the prototype (6332-6378):
 *  one segmented control (All · Classes · Events), the "What you run" shelf with
 *  the count at its right, and a row per listing that IS the session's own card
 *  ("the row IS the session card, so it needs the session's own fields — it
 *  used to get only a title and a status, which is why every listing read
 *  'All-day' with no style, date or price"). A class row is the class tile a
 *  learner would see with its manage desk behind it; an event row is the event
 *  card with the event manager behind it. The filter is the URL (`?kind=`), the
 *  way Discover's filters are: a link somebody keeps shows the same list. */

const STATUS_WORD: Record<string, string> = { draft: "Draft", published: "Live", completed: "Over" };
const STATUS_TONE: Record<string, string> = { draft: "#F59E0B", published: "#22C55E", completed: SUB };

function Meta({ listing, showBusiness }: { listing: ManagedListing; showBusiness: boolean }) {
  const status = listing.kind === "class" ? listing.danceClass.status : listing.event.status;
  const tint = listing.kind === "class" ? DOS_TINT[listing.tenant.type === "studio" ? "studio" : "trainer"] : EV_TINT[listing.event.cat];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px 6px", fontSize: 10.5, fontWeight: 800, color: SUB, minWidth: 0 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: STATUS_TONE[status] ?? SUB, flexShrink: 0 }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: STATUS_TONE[status] ?? SUB }} />
        {STATUS_WORD[status] ?? status}
      </span>
      <span aria-hidden="true" style={{ color: LINE }}>·</span>
      <span style={{ color: tint, flexShrink: 0 }}>{listing.kind === "class" ? "Class" : "Event"}</span>
      {showBusiness ? (
        <>
          <span aria-hidden="true" style={{ color: LINE }}>·</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listing.tenant.name}</span>
        </>
      ) : null}
      <Link href={listing.manageHref} style={{ marginLeft: "auto", color: tint, textDecoration: "none", flexShrink: 0 }} aria-label={`Manage ${listing.kind === "class" ? listing.danceClass.title : listing.event.title}`}>
        Manage ›
      </Link>
    </div>
  );
}

export function ManagedScreen({
  tenants,
  listings,
  filter,
}: {
  tenants: Tenant[];
  listings: ManagedListing[];
  filter: "all" | ManagedKind;
}) {
  const rows = listings.filter((l) => filter === "all" || l.kind === filter);
  const manyBusinesses = tenants.length > 1;
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      <div style={{ padding: "14px 16px 0" }}>
        {/* the segmented control — three links, the pressed one solid */}
        <div role="group" aria-label="Show" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {MANAGED_FILTERS.map(({ k, label, aria }) => {
            const on = filter === k;
            return (
              <Link
                key={k}
                href={k === "all" ? "/managed" : `/managed?kind=${k}`}
                aria-label={aria}
                aria-current={on ? "page" : undefined}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "8px 2px",
                  borderRadius: 9,
                  fontSize: 11.5,
                  fontWeight: 800,
                  textDecoration: "none",
                  background: on ? "var(--solid)" : "transparent",
                  color: on ? INK : SUB,
                  boxShadow: on ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "2px 0 8px" }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.4, color: SUB }}>WHAT YOU RUN</div>
          <div data-testid="managed-count" style={{ fontSize: 11.5, fontWeight: 800, color: SUB }}>
            {rows.length} {rows.length === 1 ? "listing" : "listings"}
          </div>
        </div>

        {rows.map((l) => (
          <div key={l.key} data-testid={`managed-${l.kind}`} style={{ marginBottom: 14 }}>
            <Meta listing={l} showBusiness={manyBusinesses} />
            {l.kind === "class" ? (
              <ClassTile danceClass={l.danceClass} filled={l.filled} tenantName={manyBusinesses ? null : l.tenant.name} city={l.tenant.city} href={l.manageHref} />
            ) : (
              <EventCard event={l.event} href={l.manageHref} />
            )}
          </div>
        ))}

        {rows.length === 0 ? (
          <div style={{ background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 16, padding: "22px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 900 }}>Nothing here yet</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 3 }}>
              {tenants.length === 0 ? "Set up a studio or artist business, and the classes and events you create show up here." : "Classes and events you create show up here."}
            </div>
            <Link
              href={tenants.length === 0 ? "/business" : `/business/${tenants[0].id}/classes`}
              style={{ display: "inline-block", marginTop: 12, padding: "9px 18px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 11.5, textDecoration: "none" }}
            >
              {tenants.length === 0 ? "Set up a business" : "Open the classes desk"}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
