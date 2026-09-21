"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CitySelect } from "@/features/geo/components/CitySelect";
import { INK } from "@/lib/design/tokens";

/** WHERE TO LOOK, ONCE (21 Sep 2026, the user: "merge near me and city filter
 *  on discover").
 *
 *  Discover asked the same question twice. The city chip said which city to
 *  measure in; the Near me chip said measure from ME instead of from the middle
 *  of it — and the second was never independent of the first, which is why
 *  18 Sep put them side by side and why side by side was still two controls for
 *  one answer. This is that answer: ONE chip, printing where the list is
 *  measured from, opening on Near me and then the cities DanceOS serves.
 *
 *  ⚠ THE CITY DOES NOT GO AWAY WHEN NEAR ME IS ON, and it must not: `near` is
 *  only the ORIGIN of the radius search, while the city still scopes the shelves
 *  that are not measured at all (classes, crews, events). So pressing Near me
 *  keeps the city underneath and only moves the point; picking a city turns Near
 *  me off, because a place you chose deliberately is a clearer answer than a
 *  point a browser handed over five minutes ago.
 *
 *  ⚠ AND NEAR ME IS OFFERED ONLY WHERE IT DOES SOMETHING — the studios tab, the
 *  one shelf that is a radius search. Elsewhere the same chip is the city alone,
 *  which is the whole of what the page can act on there. */
export function PlaceChip({
  city,
  cities,
  tab,
  extra,
  near,
  offerNearMe,
}: {
  city: string;
  /** the registry, busiest first */
  cities: string[];
  tab: string;
  extra: Record<string, string>;
  /** is the list measured from the person right now */
  near: boolean;
  offerNearMe: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* REPLACE, not push (19 Sep 2026): where the list is measured from is a
     setting of the page you are on, not a page of its own — a push per change
     made the back gesture walk every state before it could leave Discover */
  const go = (nextCity: string, nextNear: string | null) => {
    const p = new URLSearchParams({ city: nextCity, tab, ...extra });
    if (nextNear) p.set("near", nextNear);
    router.replace(`/discover?${p.toString()}`, { scroll: false });
  };

  /* Asking for somebody's location is a prompt people refuse on principle, and
     once refused a browser does not ask again — so it is a row you press, never
     a default, and a refusal says what the list falls back to rather than
     nothing. The coordinates go in the URL, so the SERVER does the search and
     the result is a link somebody can keep; three decimals is about 100 m,
     which is plenty to sort studios by and not somebody's doorstep. */
  const askWhereIAm = () => {
    if (!("geolocation" in navigator)) {
      setErr("This browser will not share where you are.");
      return;
    }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        go(city, `${pos.coords.latitude.toFixed(3)},${pos.coords.longitude.toFixed(3)}`);
      },
      () => {
        setBusy(false);
        setErr("Not shared — the list stays measured from the city centre.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  return (
    <>
      <CitySelect
        variant="chip"
        value={city || null}
        cities={cities}
        placeholder="Anywhere"
        ariaLabel="Where to look"
        disabled={busy}
        lead={
          offerNearMe
            ? {
                value: "__near__",
                option: "◎ Near me",
                label: busy ? "Finding you…" : city ? `Near me · ${city}` : "Near me",
                active: near,
                onPick: askWhereIAm,
              }
            : null
        }
        onChange={(next) => {
          if (next) go(next, null);
        }}
      />
      {err ? (
        <span role="status" style={{ fontSize: 10, color: INK, opacity: 0.75, marginLeft: 6 }}>
          {err}
        </span>
      ) : null}
    </>
  );
}
