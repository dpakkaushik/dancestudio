/** THE SLICE OF THE MAPS JAVASCRIPT API THIS APP ACTUALLY TOUCHES (11 Sep 2026).
 *
 *  Declared here rather than pulled in as `@types/google.maps`, deliberately:
 *  this machine's `node_modules` is a pnpm store that npm has already corrupted
 *  once (8 Sep 2026), and adding a dependency for six type signatures is a
 *  worse trade than writing the six. If the map's surface ever grows past a
 *  screenful, swap this file for the package — it is the same shape.
 *
 *  `google` is a global the loader script defines, so it is declared global and
 *  only ever read after `loadMaps()` has resolved. */
declare namespace google.maps {
  /** THE ONLY CORRECT WAY TO WAIT FOR MAPS. With `loading=async` the script tag
   *  fetches a bootstrap that defines this namespace immediately — so every
   *  obvious readiness check passes while `Map` is still not a constructor.
   *  This is what actually resolves when the classes exist. */
  function importLibrary(name: "maps" | "marker" | "places" | "geometry"): Promise<unknown>;

  interface LatLngLiteral {
    lat: number;
    lng: number;
  }

  interface LatLng {
    lat(): number;
    lng(): number;
  }

  interface MapOptions {
    center?: LatLngLiteral;
    zoom?: number;
    /** a VECTOR map id — AdvancedMarkerElement refuses to draw without one */
    mapId?: string;
    disableDefaultUI?: boolean;
    zoomControl?: boolean;
    /** "greedy" so one finger pans inside a scrolling sheet, which is where
     *  every one of these maps lives */
    gestureHandling?: "cooperative" | "greedy" | "none" | "auto";
    clickableIcons?: boolean;
  }

  interface MapsEventListener {
    remove(): void;
  }

  class Map {
    constructor(element: HTMLElement, options?: MapOptions);
    getCenter(): LatLng | undefined;
    panTo(position: LatLngLiteral): void;
    getZoom(): number | undefined;
    setZoom(zoom: number): void;
    addListener(eventName: string, handler: () => void): MapsEventListener;
  }

  namespace marker {
    interface AdvancedMarkerElementOptions {
      map?: Map | null;
      position?: LatLngLiteral;
      /** any element — which is what lets a marker be a real <a> somebody can
       *  tab to, rather than a canvas shape with a click handler */
      content?: HTMLElement;
      title?: string;
    }

    class AdvancedMarkerElement {
      constructor(options?: AdvancedMarkerElementOptions);
      map: Map | null;
      position?: LatLngLiteral;
    }
  }
}
