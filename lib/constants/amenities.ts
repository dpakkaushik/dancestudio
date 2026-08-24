/** What a room has — a fixed vocabulary, so "AC" and "air conditioning" can't
 *  become two things (prototype DOS_AMENITIES, DanceOSApp.jsx:150-151). The
 *  emoji is part of the string in the prototype; keeping it means the stored
 *  value is the label, and the class page prints it unchanged. */
export const DOS_AMENITIES = [
  "🪞 Mirrors",
  "🪵 Sprung floor",
  "🔊 Sound",
  "❄️ AC",
  "🧘 Mats",
  "📺 Projector",
  "🚿 Changing room",
  "🚻 Washroom",
  "💧 Drinking water",
  "🅿️ Parking",
  "🛗 Lift access",
  "🔐 Lockers",
] as const;

export type Amenity = (typeof DOS_AMENITIES)[number];

export const isAmenity = (value: string): value is Amenity =>
  (DOS_AMENITIES as readonly string[]).includes(value);
