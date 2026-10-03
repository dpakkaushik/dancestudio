import { redirect } from "next/navigation";
import { RoomsManager } from "@/features/rooms/components/RoomsManager";
import { reversePlace } from "@/lib/geo/places";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countRoomClasses, findRoomsByBusiness } from "@/repositories/rooms";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

export default async function BusinessRoomsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessId } = await params;
  /* the form opens over the desk at `?new=1` (22 Sep 2026) — and the gate is
     re-checked below against `canEdit`, because a query parameter is a request
     and never an authority */
  const sp = await searchParams;
  const opening = sp.new === "1";
  /* and a room is EDITED only through the same form, at `?edit={room}` (4 Oct 2026) */
  const editId = sp.edit ?? null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* membership is the spine — and the seat has to RUN the business (28 Sep 2026) */
  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const business = seat.business;

  /* ⚠ THE TWO POLICIES ON `rooms` ADMIT AN OWNER OR A TRAINER to write ("rooms
     are plain studio config, not a seat ledger"), and until 21 Sep the desk took
     no role at all — so the ＋, the ✕ and every amenity toggle were drawn for a
     visiting teacher, an assistant and the front desk, and each press came back
     an RLS refusal in silence.
     ⚠ SINCE 28 Sep 2026 ONLY A SEAT THAT RUNS THE BUSINESS REACHES THIS PAGE, so
     the trainer half of that test is unreachable from here and `canEdit` is the
     same question the guard above already answered. The seat is read once.
     ⚠ A MANAGER IS IN BOTH `rooms` POLICIES since `20260928110000` applied, so
     the screen and the database now admit the same two seats. This line said the
     opposite while that migration was still held. */
  const myRole = seat.memberRole;
  const canEdit = runsTheBusiness(myRole);
  /* the rooms and the studio's full address in ONE batch — the address is the
     slow one (a geocoder) and is given a deadline, so it can never be why this
     page is slow (4 Oct 2026, the user: "make page quicker") */
  const areaCity = [business.area, business.city].filter(Boolean).join(", ") || "Your studio";
  const [rooms, address] = await Promise.all([findRoomsByBusiness(supabase, businessId), fullAddressOf(supabase, businessId, areaCity)]);
  /* each room's published (still to run — those offer no Remove) and completed
     classes, the card's two boxes (4 Oct 2026) */
  const counts = Object.fromEntries(
    await countRoomClasses(supabase, rooms.map((r) => r.id)).catch(() => new Map<string, { published: number; completed: number }>())
  );
  /* the room is looked up among THIS studio's own — a pointer, never an authority */
  const editing = !opening && editId ? rooms.find((r) => r.id === editId) ?? null : null;
  return (
    <RoomsManager
      businessId={businessId}
      businessName={business.name}
      businessPhotoPath={business.photoPath ?? null}
      businessAddress={address}
      rooms={rooms}
      counts={counts}
      initialSheet={opening ? { mode: "new" } : editing ? { mode: "edit", room: editing } : null}
      canEdit={canEdit}
    />
  );
}

/** THE STUDIO'S FULL ADDRESS (4 Oct 2026, the user: "studio name with profile pic
 *  and full address"). A business stores no street address — only its area, its
 *  city and, once the owner placed it, a map PIN — so the full address is what
 *  the pin resolves to (`reversePlace`, the location picker's own geocoder, cached
 *  per instance). ⚠ A pin that was never placed is the city's centre, a guess, so
 *  it is not resolved; ⚠ and the geocoder gets 1.2 s — past that, or with no key,
 *  or on any error, the area and city stand in rather than the page waiting. */
async function fullAddressOf(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, businessId: string, fallback: string): Promise<string> {
  try {
    const { data } = await supabase.from("businesses").select("lat, lng, location_set_at").eq("id", businessId).maybeSingle();
    const b = data as { lat: number | null; lng: number | null; location_set_at: string | null } | null;
    if (!b?.location_set_at || b.lat == null || b.lng == null) return fallback;
    const place = await Promise.race([reversePlace(b.lat, b.lng), new Promise<null>((r) => setTimeout(() => r(null), 1200))]);
    return place?.label?.trim() || fallback;
  } catch {
    return fallback;
  }
}
