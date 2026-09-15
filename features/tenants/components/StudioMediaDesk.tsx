"use client";

import Link from "next/link";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { ProofPhotos } from "@/features/orgs/components/ProofPhotos";
import { ProfileDisc } from "@/features/profiles/components/HeroRail";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { BizPage, bizCard, eyebrow } from "@/features/settings/components/settings-kit";
import { DOS_TOOLS, dosToolPaint } from "@/features/tenants/components/biz-kit";
import { INK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { PROOF_MAX, PROOF_MIN, type ProofPhoto } from "@/lib/media/proof";
import type { Tenant } from "@/types/tenant";

const MUTED = "var(--muted)";

/** THE MEDIA DESK (15 Sep 2026, the user: "create a tab for media along with
 *  classes, calendar, earnings"). A studio's two pictures as a desk: the round
 *  PROFILE PICTURE the disc wears, and the HEADER PICTURES that swipe across
 *  the top of its page — which are the photos it showed DanceOS to be
 *  verified, so adding here is adding evidence and the same rules hold: ten at
 *  most, and never fewer than one ("make sure he can't delete all").
 *
 *  Nothing on this desk is a second implementation: the disc is the hero's
 *  `ProfileDisc`, the ＋ is `PhotoPicker`, the grid is the verification form's
 *  `ProofPhotos`. Who may do what is the same pair of rules the hero keeps: an
 *  owner or a trainer changes the studio's picture (the storage policy on
 *  `tenants/{id}` admits both); only the OWNER adds to or takes from the header,
 *  because the files go into the owner's own folder in the private bucket. */
export function StudioMediaDesk({
  tenant,
  /** the owner's id when the viewer IS the owner — the folder a new header picture goes into */
  ownerId,
  canEditPhoto,
  photos,
}: {
  tenant: Tenant;
  ownerId: string | null;
  canEditPhoto: boolean;
  photos: ProofPhoto[];
}) {
  const canEditHeader = ownerId !== null;
  return (
    <BizPage title={DOS_TOOLS.media.name} grad={dosToolPaint(DOS_TOOLS.media.c)}>
      {/* ── the disc ── */}
      <div style={bizCard}>
        <div style={eyebrow}>Profile picture</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ProfileDisc
            name={tenant.name}
            grad={gradientOf(tenant.name)}
            photo={photoUrl(tenant.photoPath)}
            photoAlt={`${tenant.name} — profile picture`}
            testId="media-disc"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: SUB, lineHeight: 1.5, marginBottom: 8 }}>
              The round picture on {tenant.name}&rsquo;s page and Discover card — a logo, or the front of the studio.
            </div>
            {canEditPhoto ? (
              <PhotoPicker owner={{ kind: "tenant", id: tenant.id }} hasPhoto={Boolean(tenant.photoPath)} label="Change the photo" />
            ) : (
              <div style={{ fontSize: 10.5, color: MUTED }}>The owner or a trainer changes this.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── the header ── */}
      <div style={bizCard}>
        {/* no count on the head — the strip carries its own, and two counters
            for one thing is one too many (the verification form's rule) */}
        <div style={eyebrow}>Header pictures</div>
        <div style={{ fontSize: 12.5, color: SUB, lineHeight: 1.5, marginBottom: 12 }}>
          These swipe across the top of {tenant.name}&rsquo;s page. They are also what a DanceOS admin checks to verify the
          studio — {PROOF_MIN} to {PROOF_MAX} photos of the space — so the two are one set.{" "}
          <b style={{ color: INK }}>One always stays</b>: to replace your only picture, add the new one first.
        </div>
        <ProofPhotos orgId={ownerId} tenantId={tenant.id} initialPhotos={photos} compact readOnly={!canEditHeader} />
        {!canEditHeader ? <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>Only the owner adds to or removes from the header.</div> : null}
      </div>

      <Link
        href={`/business/${tenant.id}`}
        style={{ display: "block", textAlign: "center", fontSize: 12, fontWeight: 800, color: SUB, textDecoration: "none", padding: "10px 0" }}
      >
        See them on the studio&rsquo;s home ›
      </Link>
    </BizPage>
  );
}
