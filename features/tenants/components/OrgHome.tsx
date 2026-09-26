import Link from "next/link";
import { ArrangeTools } from "@/features/home/components/ArrangeTools";
import { ToolsPanel, type Tile } from "@/features/home/components/home-kit";
import { arrangeTiles, orderOf, toolsLayoutKey } from "@/features/home/toolOrder";
import { BusinessEditFromUrl } from "@/features/profiles/components/BusinessEditSheet";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroDot, HeroId, HeroPlace, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { EntityBand, Figure } from "@/features/profiles/components/profile-band";
import { ProfileLink, ProfileShare } from "@/features/profiles/components/ProfileShare";
import { PROFILE_RING, EyeIcon, cornerChip } from "@/features/profiles/components/profile-kit";
import { ActionRow, CallButton, LocationButton, MailButton, MessageButton, mapsPinHref, whatsappHrefOf } from "@/features/profiles/components/ContactButtons";
import { ContactEditButton } from "@/features/profiles/components/ContactEditor";
import { EditDetailsChip, EditModeButton, EditModeProvider } from "@/features/profiles/components/EditMode";
import { RecordListsProvider } from "@/features/profiles/components/RecordLists";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { StudioLinksRow } from "./StudioLinksRow";
import { StudioStylesRow } from "./StudioStylesRow";
import { StudioPicturesButton, StudioPostersButton } from "./StudioPictures";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import type { ProofPhoto } from "@/lib/media/proof";
import type { PublicTenant } from "@/types/publicProfile";
import type { Tenant } from "@/types/tenant";

/* "Since Sep 2026" — the meta line's second word, off the row's own created_at */
const monthYear = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

/** ONE ORGANIZATION'S OWN HOME (26 Sep 2026) — what an organization card on the
 *  hub opens, and what the profile switcher's Organization row goes to.
 *
 *  The user: *"make organization a tab on home for artist and users and
 *  mechanism to create and open an organization similar to studios … separate
 *  login for organization also goes away as it now gets created like studios."*
 *  So this is `StudioHome` for the third kind of business a person opens: the
 *  identity hero every identity page wears — ORGANIZATION over the name, the
 *  number beside it, the disc and the header pictures with their two ⊕ — the
 *  band with its figures, styles and links, the button row its public page
 *  carries, then the Organization Tools grid. ⚠ NO TODAY SHELF: an organization
 *  has no rooms and no classes; its day is its events, on their own desk.
 *
 *  THE PICTURES ARE A STUDIO'S (26 Sep 2026): an organization's header is its
 *  `studio_photos` rows in the private bucket, read by `business_header_photos`
 *  and public once the organization is (`org_is_public`), so the same two
 *  controls a studio's home draws do the job here without a third copy. Nothing
 *  here is a second implementation: the hero is `IdentityHero`, the band is
 *  `EntityBand`, the grid is Home's. */
export function OrgHome({
  tenant,
  photo,
  canEditPhoto,
  header,
  ownerId,
  editable = null,
  since = null,
  followers = 0,
  tiles,
  order = null,
  editOpen = false,
}: {
  tenant: Tenant;
  /** the organization's own picture — `businesses.profile_photo_path`, the public bucket */
  photo: string | null;
  canEditPhoto: boolean;
  /** its header pictures — signed URLs into the private bucket */
  header: ProofPhoto[];
  /** the owner's own id: the folder a new picture goes into; null for anybody else */
  ownerId: string | null;
  /** the organization as its Edit sheet reads it; null for anybody but the owner */
  editable?: PublicTenant | null;
  /** its `created_at` (ISO) — the meta line's "Since"; null draws none */
  since?: string | null;
  /** how many follow it — a business follow, aggregate-only */
  followers?: number;
  tiles: Tile[];
  /** this member's own arrangement of THIS organization's tools, keyed by it */
  order?: string[] | null;
  /** `?edit=1` on this home's own address (C54's grammar) — drawn only when `editable` came back */
  editOpen?: boolean;
}) {
  /* blue, because it is an organization (20 Sep 2026, the user's colour list) */
  const RG = PROFILE_RING.org;
  const place = [tenant.area, tenant.city].filter(Boolean).join(", ");
  const pinHref = editable?.locationSetAt && editable.lat != null && editable.lng != null ? mapsPinHref(editable.lat, editable.lng) : null;
  const shots: HeroShot[] = header
    .filter((p) => p.url)
    .map((p, i) => ({ key: p.id, src: p.url as string, alt: `Header picture ${i + 1} of ${tenant.name}`, signed: true }));
  const layoutKey = toolsLayoutKey("org", tenant.id);
  const canEditAny = Boolean(editable) || canEditPhoto;
  const whatsapp = whatsappHrefOf(tenant.socials);

  return (
    /* EDIT MODE (26 Sep 2026): the pencil toggles it and every editor on this
       home appears with it — see `EditMode.tsx` */
    <EditModeProvider>
    <RecordListsProvider styles={tenant.styles} socials={tenant.socials}>
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, boxSizing: "border-box", paddingBottom: "var(--dos-foot)" }}>
      <div style={{ padding: "0 16px" }}>
        <IdentityHero
          testId="org-hero"
          name={tenant.name}
          grad={RG}
          tint={RG[1]}
          eyebrow="Organization"
          eyebrowSub={tenant.memberNo ? <HeroId>{memberNoWords(tenant.memberNo)}</HeroId> : null}
          /* the tick is the GST number, verified — an organization's whole verified state */
          verified={Boolean(tenant.gstinVerifiedAt)}
          meta={
            <>
              {place ? <HeroPlace text={place} query={`${tenant.name} ${place}`} /> : null}
              {place && since ? <HeroDot /> : null}
              {since ? <span>Since {monthYear(since)}</span> : null}
            </>
          }
          /* empty on purpose — the band below draws the editable rows */
          styles={[]}
          avatar={photo}
          avatarAlt={tenant.name}
          avatarSlot={<StudioPicturesButton tenantId={tenant.id} tenantName={tenant.name} grad={RG} avatar={photo} canEdit={canEditPhoto} />}
          shots={shots}
          headerEdit={ownerId ? <StudioPostersButton tenantId={tenant.id} tenantName={tenant.name} ownerId={ownerId} photos={header} /> : null}
          /* the corner is ONE control, exactly a studio's (C58): the eye onto THIS
             organization's public page. Edit is Settings' THIS ORGANIZATION tile. */
          /* the pencil over the eye (26 Sep 2026) — it toggles edit mode; the
             form's words are the Edit details chip beside the name */
          corner={
            <>
              {canEditAny ? <EditModeButton /> : null}
              <Link href={`/org/${tenant.id}`} aria-label="Public view" style={cornerChip}>
                <EyeIcon />
              </Link>
            </>
          }
          detailsEdit={editable ? <EditDetailsChip href={`/business/${tenant.id}?edit=1`} /> : null}
        >
          <EntityBand
            figures={
              <>
                <Figure n={followers} label="Followers" testId="org-followers" />
                {/* ⚠ NO FOLLOWING FIGURE: a business follows nothing, and the login
                    that used to follow on an organization's behalf is retired */}
              </>
            }
            /* QR · SHARE — no Follow bell on your own home, and no Stats chip: the
               board it opened ranked studios an organization no longer runs */
            chips={
              <>
                <ProfileShare path={`/org/${tenant.id}`} name={tenant.name} />
                <ProfileLink path={`/org/${tenant.id}`} name={tenant.name} />
              </>
            }
            styles={[]}
            socials={[]}
          >
            {/* the two editable rows every business home carries — `isStudio` false,
                because an organization may say it dances nothing at all */}
            <StudioStylesRow tenant={tenant} canEdit={Boolean(editable)} isStudio={false} fallback={[]} />
            <StudioLinksRow tenant={tenant} canEdit={Boolean(editable)} />
          </EntityBand>
        </IdentityHero>

        {/* THE BUTTONS ITS PUBLIC PAGE CARRIES, in the same order, from the same
            fields — Enquiry drawn and DISABLED with its reason, because you are
            on this team (the row is sized by how many cells it is given) */}
        <ActionRow>
          <EnquiryButton tenantId={tenant.id} tenantName={tenant.name} tenantType="org" signedIn accent={RG[1]} enquiryTypes={tenant.enquiryTypes} cannotAsk="You run this organization — enquiries come to you here" />
          {tenant.phone ? <CallButton phone={tenant.phone} /> : null}
          {tenant.contactEmail ? <MailButton email={tenant.contactEmail} /> : null}
          {whatsapp ? <MessageButton href={whatsapp} /> : null}
          {pinHref ? <LocationButton href={pinHref} /> : place ? <LocationButton query={`${tenant.name} ${place}`} /> : null}
        </ActionRow>
        {/* the ⊕ that makes and unmakes those buttons — the owner's, while the pencil is pressed */}
        {editable ? <ContactEditButton target={{ kind: "business", tenant, detailsHref: `/business/${tenant.id}?edit=1` }} /> : null}

        {/* ORGANIZATION TOOLS — every door is THIS organization's */}
        <div style={{ position: "relative", zIndex: 1, background: LILAC, marginTop: 14 }}>
          <ToolsPanel kind="org">
            <ArrangeTools tiles={arrangeTiles(tiles, order)} defaultOrder={orderOf(tiles)} layoutKey={layoutKey} arranged={Boolean(order && order.length > 0)} />
          </ToolsPanel>
        </div>
      </div>
      {/* the form Settings sends you to, over the home it belongs to (C54's shape) */}
      {editOpen && editable ? <BusinessEditFromUrl tenant={editable} /> : null}
    </div>
    </RecordListsProvider>
    </EditModeProvider>
  );
}
