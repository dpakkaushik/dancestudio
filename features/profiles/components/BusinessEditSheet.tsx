"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { LocationPicker, type PickedLocation } from "@/features/geo/components/LocationPicker";
import { setTenantLocationAction } from "@/features/geo/server-actions/location";
import { commitHeaderDraft, commitWords, studioPorts } from "@/features/media/commitHeaderDraft";
import { HeaderPictures, headerTiles } from "@/features/media/components/HeaderPictures";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { useHeaderDraft } from "@/features/media/headerDraft";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import { PLATFORMS, handleOf, isPlatform } from "@/lib/constants/socials";
import { CARD, INK, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { PROOF_MAX, type ProofPhoto } from "@/lib/media/proof";
import type { PublicTenant } from "@/types/publicProfile";
import { ProfileDisc } from "./HeroRail";
import { PencilIcon, PlatformIcon, Sheet, cornerChip, fieldInput, fieldLabel, gradientOf, sheetBtn } from "./profile-kit";

/** The business's own Edit sheet — the prototype has ONE editor for a profile
 *  (11364, "one editor, and it is Edit profile"), and a studio's page is the
 *  same S_profiletab, so its owner edits the same way: the words under About
 *  (≤ 220, the sheet's own counter), the founding year ("Since 2016", 10691),
 *  the number the Call button dials (10879) and the links rail (10760). Saved
 *  through the one owner-only door, `update_tenant_profile`, which re-checks
 *  ownership inside and validates what a form cannot be trusted to.
 *
 *  AND THE PICTURES, SINCE 16 SEP 2026 (the user: "the update image option
 *  should be inside the edit profile"). They used to be controls on the hero —
 *  a ＋ on the disc's rim and a ✕ per header picture, one square at a time. Here
 *  the whole set is a gallery you can open a picture from. A STUDIO's header
 *  pictures are the photos it showed DanceOS (5–10, and the database keeps the
 *  last one); an ARTIST PAGE's header is its OWNER's own pictures, so those are
 *  edited in Edit profile on the person — this sheet draws the disc for both
 *  and the header for a studio.
 *
 *  ⚠ AND THE PICTURES ARE A DRAFT, LIKE EVERY OTHER FIELD HERE (16 Sep 2026).
 *  The first cut put the immediate-write grid from the verification form inside
 *  this sheet, which has a Cancel button — so a ✕ destroyed a picture on the
 *  press and Cancel had nothing to undo. The user lost four that way. Staging
 *  is not a new idea imported to fix it: it is what About, Since, the phone and
 *  the links have always done here, and what the prototype's own edit sheet
 *  does (11364-11400 — Cancel is `setEditOpen(false)` and NOTHING else). The
 *  DISC is the one thing still written immediately, and deliberately: changing
 *  it REPLACES rather than destroys — `PhotoPicker` never deletes the old
 *  object — and the result is visible on screen the moment it lands, which is
 *  the same test the map pin's own comment sets further down. */


export function BusinessEditSheet({
  tenant,
  photos = [],
  ownerId = null,
  canEditPhoto = false,
  onClose,
}: {
  tenant: PublicTenant;
  /** a studio's header pictures, as this viewer may read them */
  photos?: ProofPhoto[];
  /** the owner's own id — the folder in the private bucket a new one goes into;
   *  null hides the header block, because only the owner may add to it */
  ownerId?: string | null;
  /** an owner or a trainer — the pair the storage policy on `tenants/{id}` admits */
  canEditPhoto?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [about, setAbout] = useState(tenant.about ?? "");
  const [founded, setFounded] = useState(tenant.foundedYear ? String(tenant.foundedYear) : "");
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [socials, setSocials] = useState<Array<{ platform: string; url: string }>>(tenant.socials);
  const [addPlatform, setAddPlatform] = useState<string>("");
  const [addUrl, setAddUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* the pictures, as a draft this sheet owns — so Save commits them and Cancel
     is free, exactly like every other field here */
  const isStudio = tenant.type === "studio";
  const canEditHeader = isStudio && Boolean(ownerId);
  const draft = useHeaderDraft({
    initial: photos.map((p) => ({ id: p.id, path: p.path, url: p.url, signed: true })),
    min: 1,
    max: PROOF_MAX,
  });
  const tiles = headerTiles(draft, tenant.name);
  const [lightbox, setLightbox] = useState<number | null>(null);

  /** The pin saves itself. A location is chosen by a gesture that is already
   *  visible on screen — the map has moved, the address has appeared — so
   *  asking for a second press to confirm it reads as though the first did not
   *  register. Failures are said out loud rather than swallowed. */
  const savePlace = (picked: PickedLocation) =>
    start(async () => {
      setPlaceNote("Saving the pin…");
      const out = await setTenantLocationAction({
        tenantId: tenant.id,
        lat: picked.lat,
        lng: picked.lng,
        area: picked.area,
        city: picked.city,
      });
      setPlaceNote(out.error ? `Could not save the pin — ${out.error}` : "Saved. Discover measures from here now.");
      if (!out.error) {
        router.refresh();
      }
    });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1950 + 1 }, (_, i) => thisYear - i);
  const free = PLATFORMS.filter((p) => !socials.some((s) => s.platform === p));

  /** THE WORDS FIRST, THEN THE PICTURES, AND ONE REFRESH AT THE END.
   *
   *  The order is deliberate: `update_tenant_profile` is the likeliest thing to
   *  refuse (a 221-character About, a phone that is not a phone, a link that is
   *  not a URL), and a refusal must cost NOTHING — so it happens before a
   *  single byte moves. If the picture commit then half-fails, the sheet STAYS
   *  OPEN wearing the database's own sentence and pressing Save again retries
   *  only what is left: `applyCommit` has already folded in whatever landed, so
   *  nothing is uploaded or removed twice. */
  const save = () =>
    start(async () => {
      setErr(null);
      const yr = founded ? Number(founded) : null;
      const out = await updateTenantProfileAction({
        tenantId: tenant.id,
        about: about.trim() || null,
        foundedYear: yr,
        phone: phone.trim() || null,
        socials,
        enquiryTypes: tenant.enquiryTypes,
        accepts: tenant.accepts,
      });
      if (out.error) {
        setErr(out.error);
        return;
      }
      if (canEditHeader && draft.dirty && ownerId) {
        const result = await commitHeaderDraft(draft.items, studioPorts(tenant.id, ownerId));
        draft.applyCommit(result);
        if (result.failures.length > 0) {
          setErr(commitWords(result, draft.changeCount));
          router.refresh();
          return;
        }
      }
      onClose();
      router.refresh();
    });

  const addLink = () => {
    const platform = addPlatform || "";
    if (!platform || !addUrl.trim()) return setErr("Pick a platform and paste its address");
    if (!/^https?:\/\//i.test(addUrl.trim())) return setErr("A link is a web address — it starts with https://");
    setSocials((s) => [...s, { platform, url: addUrl.trim() }]);
    setAddPlatform("");
    setAddUrl("");
    setErr(null);
  };

  return (
    <Portal>
    <Sheet label="Edit business" onClose={onClose} maxHeight="88vh">
      <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Edit {isStudio ? "studio" : "artist page"}</b>

      {/* ── THE PICTURES (16 Sep 2026) ────────────────────────────────────────
          The round one first, because it is the one everybody sees on a card;
          then the header, which is a set and needs room to be one. The two
          paragraphs that used to explain them are gone at the user's
          instruction — a picture beside an Add button does not need a caption,
          and what was TRUE in them survives where it can be acted on: "one
          always stays" on the disabled ✕ that enforces it, and "an admin checks
          these" on the count badge and on the verification form itself. */}
      {/* ⚠ ONE LABEL STYLE, EVERY FIELD (16 Sep 2026, the user: "why About,
          Since etc has different font than Header Picture and Profile picture,
          why so much randomness … everything should be standard").
          They were right and it was a half-finished edit of mine: fixing the
          labels' legibility, I introduced a SECOND, larger heading style and
          then used it on two blocks out of five. Two species of heading in one
          form is not a hierarchy, it is an accident. A form gets ONE label
          tier — the small tracked caps every app uses for this — and grouping
          comes from the order and the spacing, not from a second typeface. */}
      <div style={fieldLabel}>Update profile</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <ProfileDisc name={tenant.name} grad={gradientOf(tenant.name)} photo={photoUrl(tenant.photoPath)} photoAlt={`${tenant.name} — profile picture`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {canEditPhoto ? (
            <PhotoPicker owner={{ kind: "tenant", id: tenant.id }} hasPhoto={Boolean(tenant.photoPath)} label="Change the photo" />
          ) : (
            <div style={{ fontSize: 10.5, color: SUB }}>The owner or a trainer changes this.</div>
          )}
        </div>
      </div>

      {/* a studio's header IS its verification photos; an artist page's header
          belongs to the PERSON who owns it, and is edited on their own profile */}
      {canEditHeader ? (
        <>
          <div style={fieldLabel}>Update header</div>
          <HeaderPictures draft={draft} tiles={tiles} kind="studio" canWrite addLabel="Add photos of your space" onOpen={setLightbox} busy={pending} />
        </>
      ) : null}

      {/* ⚠ EVERY LABEL BELOW IS A SIBLING OF ITS CONTROL, NOT ITS WRAPPER
          (16 Sep 2026). These five were `<label style={fieldLabel}>` around the
          input, and `text-transform` inherits while Tailwind's preflight gives
          form controls `font: inherit` — so the studio's own About paragraph,
          its phone number and every pasted URL rendered UPPERCASE at weight
          800. The explicit aria-label on each control is NOT optional: the
          wrapper was what gave these fields their accessible name, and the e2e
          suite finds three of them by it. */}
      <div style={fieldLabel}>About</div>
      <textarea aria-label="About" value={about} maxLength={220} onChange={(e) => setAbout(e.target.value)} rows={3} placeholder={isStudio ? "Where the city comes to move…" : "Movement is a language…"} style={{ ...fieldInput, resize: "none", lineHeight: 1.5 }} />
      <span style={{ display: "block", textAlign: "right", fontSize: 10.5, color: about.length > 200 ? "#F59E0B" : MUTED, marginTop: 3 }}>{about.length}/220</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={fieldLabel}>Since</div>
          <select aria-label="Since" value={founded} onChange={(e) => setFounded(e.target.value)} style={fieldInput}>
            <option value="">Not shown</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          {/* "Phone (Call button)" until 16 Sep 2026 — the parenthetical told
              the owner what the number is FOR, which the public page already
              shows them, at the cost of being the longest label on the form */}
          <div style={fieldLabel}>Phone</div>
          <input aria-label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={fieldInput} />
        </div>
      </div>

      <div style={{ ...fieldLabel, marginTop: 6 }}>Links</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {socials.map((l) => (
          <div key={l.platform} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 12, background: CARD, border: `1px solid ${LINE}` }}>
            <span style={{ flexShrink: 0, lineHeight: 0 }}>
              <PlatformIcon label={l.platform} size={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {l.platform} <span style={{ color: SUB, fontWeight: 600 }}>· {isPlatform(l.platform) ? handleOf(l.url) : l.url}</span>
            </span>
            <button type="button" aria-label={`Remove ${l.platform}`} onClick={() => setSocials((s) => s.filter((x) => x.platform !== l.platform))} style={{ background: "none", border: "none", color: "#F87171", fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              ×
            </button>
          </div>
        ))}
        {socials.length === 0 ? <div style={{ fontSize: 12, color: SUB }}>No links yet — WhatsApp, Instagram, a website…</div> : null}
      </div>
      {free.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr auto", gap: 6, alignItems: "end" }}>
          <div>
            <div style={fieldLabel}>Platform</div>
            <select aria-label="Platform" value={addPlatform} onChange={(e) => setAddPlatform(e.target.value)} style={fieldInput}>
              <option value="">Pick…</option>
              {free.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={fieldLabel}>URL</div>
            <input aria-label="URL" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder={addPlatform === "WhatsApp" ? "https://wa.me/919876543210" : "https://…"} style={fieldInput} />
          </div>
          <button type="button" onClick={addLink} style={{ ...sheetBtn(false), padding: "10px 12px", height: 40 }}>
            Add
          </button>
        </div>
      ) : null}

      {/* ── WHERE IT IS (11 Sep 2026) ──────────────────────────────────────────
          The one field the business never had. Until an owner moves this pin
          their studio sits on its city's centroid, along with every other
          studio in that city, and Discover's "2.4 km away" is the same 2.4 km
          for all of them. Saved on its own, immediately, rather than with the
          rest of the sheet: it is a different kind of edit — a map gesture,
          not a form field — and pressing Save to commit a pin somebody has
          already visibly placed reads like it did not take. */}
      <div style={fieldLabel}>Where it is</div>
      <LocationPicker
        value={{ lat: tenant.lat, lng: tenant.lng, area: tenant.area }}
        /* the business already has a point; the centre is only the fallback for
           one that does not, so its own coordinates are the honest opening */
        centre={tenant.lat != null && tenant.lng != null ? { lat: tenant.lat, lng: tenant.lng } : null}
        onChange={savePlace}
      />
      {/* a failure must not be the faintest text on the screen */}
      <div style={{ fontSize: 10.5, color: placeNote && placeNote.startsWith("Could not") ? "#F87171" : SUB, marginTop: 6, lineHeight: 1.45 }}>
        {placeNote ?? "This is what Discover measures from when somebody looks for studios near them."}
      </div>

      {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 10 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={onClose} style={sheetBtn(false)}>
          Cancel
        </button>
        {/* the count is a substring, so getByRole("button", { name: "Save" }) still finds it */}
        <button type="button" disabled={pending} onClick={save} style={sheetBtn(true)}>
          {pending ? "Saving…" : draft.dirty ? `Save · ${draft.changeCount} ${draft.changeCount === 1 ? "picture change" : "picture changes"}` : "Save"}
        </button>
      </div>
    </Sheet>
    {/* ⚠ A SIBLING OF THE SHEET, NEVER A CHILD — see PhotoLightbox's own header:
        the Sheet's panel carries a transform while it rises, and every test that
        scopes to getByRole("dialog", { name: "Edit business" }) would go
        ambiguous on a dialog nested inside it. */}
    {lightbox !== null ? (
      <PhotoLightbox
        shots={tiles.map((t) => ({ key: t.key, src: t.url, alt: t.alt, signed: t.signed }))}
        index={lightbox}
        onIndex={setLightbox}
        onClose={() => setLightbox(null)}
        label={tenant.name}
      />
    ) : null}
    </Portal>
  );
}

/** The owner's Edit control (10613) and the sheet behind it, in one client
 *  island. Two dresses: the cell in the public page's action row, and — since
 *  15 Sep 2026 — the pencil on the hero's corner of a studio's own home, the
 *  same chip the Profile tab's Edit wears. */
export function BusinessEditButton({
  tenant,
  corner = false,
  photos = [],
  ownerId = null,
  canEditPhoto = false,
}: {
  tenant: PublicTenant;
  corner?: boolean;
  photos?: ProofPhoto[];
  ownerId?: string | null;
  canEditPhoto?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {corner ? (
        <button type="button" aria-label="Edit studio" onClick={() => setOpen(true)} style={{ ...cornerChip, border: "1px solid rgba(255,255,255,.28)" }}>
          <PencilIcon />
        </button>
      ) : (
        <button type="button" aria-label="Edit business" onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 38, borderRadius: 11, cursor: "pointer", fontWeight: 800, fontSize: 11, boxSizing: "border-box", padding: "0 4px", background: CARD, color: INK, border: `1px solid ${LINE}`, fontFamily: "inherit" }}>
          Edit
        </button>
      )}
      {open ? <BusinessEditSheet tenant={tenant} photos={photos} ownerId={ownerId} canEditPhoto={canEditPhoto} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
