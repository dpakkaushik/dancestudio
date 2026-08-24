/** Closed city list — lifted from prototype DOS_CITIES (DanceOSApp.jsx:157).
 *  City is how the app groups studios, so it cannot be free-typed. */
export const DOS_CITIES = [
  "New Delhi",
  "Gurgaon",
  "Noida",
  "Mumbai",
  "Pune",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Jaipur",
  "Chandigarh",
  "Kolkata",
  "Ahmedabad",
] as const;

export type DosCity = (typeof DOS_CITIES)[number];

/** City centre coordinates — mirrors the DB's city_centroids seed (Step 5).
 *  Discovery searches from the picked city's centre until precise geolocation
 *  (browser / Google Maps) arrives. */
export const DOS_CITY_CENTROIDS: Record<DosCity, { lat: number; lng: number }> = {
  "New Delhi": { lat: 28.6139, lng: 77.209 },
  Gurgaon: { lat: 28.4595, lng: 77.0266 },
  Noida: { lat: 28.5355, lng: 77.391 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Chandigarh: { lat: 30.7333, lng: 76.7794 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
};
