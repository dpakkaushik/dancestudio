"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { useEditMode } from "@/features/profiles/components/EditMode";
import { STYLES_ROW } from "@/features/profiles/components/profile-band";
import { StylesSheet } from "@/features/profiles/components/StylesSheet";
import { dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, SUB } from "@/lib/design/tokens";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import type { StudioLinkTarget } from "./StudioLinksRow";

/** A STUDIO'S DANCE STYLES, EDITED WHERE A PERSON'S ARE (21 Sep 2026).
 *
 *  The user: *"make sure all profile types have similar ways to edit the
 *  profile, the segments like social media, dance styles, pictures and
 *  posters."*
 *
 *  ⚠ THIS IS THE LAST OF THE FOUR SEGMENTS TO MOVE. A studio's links moved onto
 *  its band on 20 Sep and its pictures onto its disc and rail; its STYLES stayed
 *  behind, as a `<select>` and a row of chips halfway down `BusinessEditSheet` —
 *  so on one profile the same idea was a ＋ on the band and on another it was a
 *  dropdown in a sheet. Same row, same ＋, same editor as a person's now; what
 *  differs is the door behind it and the sentence under the last style.
 *
 *  ⚠ IT SENDS THE FIELDS IT IS NOT EDITING BACK UNCHANGED, exactly as the links
 *  row does and for the same reason: `update_business_profile` takes the whole
 *  profile, so a save that omitted `socials` would empty them.
 *
 *  ⚠ AND THE FLOOR IS THE DATABASE'S. `update_business_profile` refuses a studio
 *  with no style (19 Sep — "it is what Discover files it under"), so Remove is
 *  disabled on the last one with that reason on it rather than offering a press
 *  that can only come back as an error. An ARTIST PAGE has no such floor, which
 *  is why the words are passed in rather than assumed. */
export function StudioStylesRow({
  tenant,
  canEdit,
  isStudio,
  fallback = [],
}: {
  tenant: StudioLinkTarget;
  canEdit: boolean;
  isStudio: boolean;
  /** ⚠ WHAT IT TEACHES, OFF ITS PUBLISHED CLASSES — shown only while the FIELD
   *  is empty, which is the public page's own rule (19 Sep 2026). A studio
   *  created since then cannot have an empty field (the database refuses one),
   *  so this is for the twelve that predate it: without the fallback their home
   *  would go from naming their styles to naming none, which would read as data
   *  lost rather than a field never filled. */
  fallback?: string[];
}) {
  const router = useRouter();
  const [styles, setStyles] = useState<string[]>(tenant.styles);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* the ＋ appears with the pencil (26 Sep 2026) — the owner's right, in edit mode */
  const { editing } = useEditMode();
  const showPlus = canEdit && editing;

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const save = (next: string[], said: string) =>
    start(async () => {
      const out = await updateTenantProfileAction({
        tenantId: tenant.id,
        styles: next,
        /* unchanged, and sent because the door takes the whole profile */
        socials: tenant.socials,
        foundedYear: tenant.foundedYear,
        phone: tenant.phone,
        contactEmail: tenant.contactEmail,
        enquiryTypes: tenant.enquiryTypes,
        accepts: tenant.accepts,
      });
      if (out.error) {
        fire(out.error);
        return;
      }
      setStyles(next);
      fire(said);
      router.refresh();
    });

  return (
    <>
      <div style={STYLES_ROW}>
        {(styles.length ? styles : fallback).map((s) => (
          <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={`${s} — a style this business teaches`} small />
        ))}
        {showPlus ? (
          <button
            type="button"
            aria-label="Add a dance style"
            onClick={() => setOpen(true)}
            style={{ width: 30, height: 30, borderRadius: 10, background: "var(--el)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, fontWeight: 800, color: SUB, flexShrink: 0, border: "none", fontFamily: "inherit" }}
          >
            ＋
          </button>
        ) : null}
        {styles.length === 0 && fallback.length === 0 && !showPlus ? <span style={{ fontSize: 11.5, color: SUB }}>No styles named yet.</span> : null}
      </div>
      {open ? (
        <StylesSheet
          styles={styles}
          pending={pending}
          lastWords={isStudio ? "A studio says at least one dance style — it is what Discover files it under" : "Name at least one style"}
          onSave={save}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 650, fontFamily: DOS_UI }}>
          {toast}
        </div>
      ) : null}
    </>
  );
}
