"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
import { PLATFORMS, handleOf, isPlatform } from "@/lib/constants/socials";
import { CARD, INK, LINE, MUTED, SUB } from "@/lib/design/tokens";
import type { PublicTenant } from "@/types/publicProfile";
import { PlatformIcon, Sheet, fieldInput, fieldLabel, sheetBtn } from "./profile-kit";

/** The business's own Edit sheet — the prototype has ONE editor for a profile
 *  (11364, "one editor, and it is Edit profile"), and a studio's page is the
 *  same S_profiletab, so its owner edits the same way: the words under About
 *  (≤ 220, the sheet's own counter), the founding year ("Since 2016", 10691),
 *  the number the Call button dials (10879) and the links rail (10760). Saved
 *  through the one owner-only door, `update_tenant_profile`, which re-checks
 *  ownership inside and validates what a form cannot be trusted to. */

export function BusinessEditSheet({ tenant, onClose }: { tenant: PublicTenant; onClose: () => void }) {
  const router = useRouter();
  const [about, setAbout] = useState(tenant.about ?? "");
  const [founded, setFounded] = useState(tenant.foundedYear ? String(tenant.foundedYear) : "");
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [socials, setSocials] = useState<Array<{ platform: string; url: string }>>(tenant.socials);
  const [addPlatform, setAddPlatform] = useState<string>("");
  const [addUrl, setAddUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1950 + 1 }, (_, i) => thisYear - i);
  const free = PLATFORMS.filter((p) => !socials.some((s) => s.platform === p));

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
    <Sheet label="Edit business" onClose={onClose} maxHeight="88vh">
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>Edit {tenant.type === "studio" ? "studio" : "artist page"}</div>
      <label style={fieldLabel}>
        About
        <textarea value={about} maxLength={220} onChange={(e) => setAbout(e.target.value)} rows={3} placeholder={tenant.type === "studio" ? "Where the city comes to move…" : "Movement is a language…"} style={{ ...fieldInput, resize: "none", lineHeight: 1.5 }} />
        <span style={{ display: "block", textAlign: "right", fontSize: 10.5, color: about.length > 200 ? "#F59E0B" : MUTED, marginTop: 3 }}>{about.length}/220</span>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={fieldLabel}>
          Since
          <select value={founded} onChange={(e) => setFounded(e.target.value)} style={fieldInput}>
            <option value="">Not shown</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldLabel}>
          Phone (Call button)
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={fieldInput} />
        </label>
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
          <label style={fieldLabel}>
            Platform
            <select value={addPlatform} onChange={(e) => setAddPlatform(e.target.value)} style={fieldInput}>
              <option value="">Pick…</option>
              {free.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldLabel}>
            URL
            <input value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder={addPlatform === "WhatsApp" ? "https://wa.me/919876543210" : "https://…"} style={fieldInput} />
          </label>
          <button type="button" onClick={addLink} style={{ ...sheetBtn(false), padding: "10px 12px", height: 40 }}>
            Add
          </button>
        </div>
      ) : null}

      {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 10 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={onClose} style={sheetBtn(false)}>
          Cancel
        </button>
        <button type="button" disabled={pending} onClick={save} style={sheetBtn(true)}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </Sheet>
  );
}

/** The owner's Edit control (10613) and the sheet behind it, in one client island. */
export function BusinessEditButton({ tenant }: { tenant: PublicTenant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Edit business" onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 38, borderRadius: 11, cursor: "pointer", fontWeight: 800, fontSize: 11, boxSizing: "border-box", padding: "0 4px", background: CARD, color: INK, border: `1px solid ${LINE}`, fontFamily: "inherit" }}>
        Edit
      </button>
      {open ? <BusinessEditSheet tenant={tenant} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
