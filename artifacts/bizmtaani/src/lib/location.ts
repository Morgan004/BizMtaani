/**
 * Location resolution — priority order:
 *  1. GeoJSON ward polygon match  (fastest, most accurate, no network call)
 *  2. Module-level result cache   (avoids repeated work)
 *  3. OSM Nominatim               (fallback only, never overwrites GeoJSON)
 *
 * The GeoJSON file (kenya-wards.geojson) is fetched once and kept in
 * memory. All lookups are asynchronous and non-blocking.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface WardFeature {
  type: "Feature";
  properties: { ward: string; constituency: string; county: string };
  geometry: GeoJSONGeometry;
  /** Precomputed bounding box for fast rejection */
  _bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
}

type GeoJSONGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface ResolvedLocation {
  /** Ward name in Title Case, e.g. "Baba Dogo" — use for Firestore queries */
  wardName: string;
  constituency: string;
  county: string;
  /** Human-readable display string, e.g. "Baba Dogo, Nairobi" */
  displayName: string;
}

// ── Module-level singletons ───────────────────────────────────────────────────

/** Cache keyed at ~111m precision: "lat3_lng3" → ResolvedLocation */
const resolvedCache = new Map<string, ResolvedLocation>();

/** Loaded ward features; undefined = not yet attempted; null = load failed */
let wardFeatures: WardFeature[] | null | undefined = undefined;

/** Inflight fetch promise so we only ever fetch once */
let loadPromise: Promise<WardFeature[] | null> | null = null;

// ── GeoJSON loader ────────────────────────────────────────────────────────────

function computeBbox(geom: GeoJSONGeometry): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  function scanRing(ring: number[][]) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) scanRing(ring);
  } else {
    for (const poly of geom.coordinates) for (const ring of poly) scanRing(ring);
  }
  return [minLng, minLat, maxLng, maxLat];
}

async function loadWards(): Promise<WardFeature[] | null> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const res = await fetch("/kenya-wards.geojson");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geojson = await res.json() as {
        type: string;
        features: Omit<WardFeature, "_bbox">[];
      };
      const features: WardFeature[] = geojson.features
        .filter((f) => f.properties.ward)
        .map((f) => ({ ...f, _bbox: computeBbox(f.geometry) }));
      wardFeatures = features;
      return features;
    } catch (e) {
      console.warn("[location] GeoJSON load failed:", e);
      wardFeatures = null;
      return null;
    }
  })();
  return loadPromise;
}

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, geom: GeoJSONGeometry): boolean {
  if (geom.type === "Polygon") {
    if (!pointInRing(lng, lat, geom.coordinates[0])) return false;
    for (let i = 1; i < geom.coordinates.length; i++) {
      if (pointInRing(lng, lat, geom.coordinates[i])) return false; // inside a hole
    }
    return true;
  }
  for (const poly of geom.coordinates) {
    if (!pointInRing(lng, lat, poly[0])) continue;
    let inHole = false;
    for (let i = 1; i < poly.length; i++) {
      if (pointInRing(lng, lat, poly[i])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

function findWard(lat: number, lng: number, features: WardFeature[]): WardFeature["properties"] | null {
  for (const f of features) {
    const [minLng, minLat, maxLng, maxLat] = f._bbox;
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
    if (pointInPolygon(lng, lat, f.geometry)) return f.properties;
  }
  return null;
}

// ── OSM Nominatim fallback ────────────────────────────────────────────────────

async function nominatimFallback(lat: number, lng: number): Promise<Partial<ResolvedLocation>> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=14`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "en", "User-Agent": "BizMtaani/1.0" },
    });
    if (!res.ok) throw new Error("Nominatim error");
    const data = await res.json();
    const addr = data.address ?? {};
    const ward =
      addr.suburb ?? addr.neighbourhood ?? addr.village ?? addr.town ?? addr.city_district ?? "";
    const county = (addr.state ?? addr.county ?? "")
      .replace(/ County$/i, "").trim();
    const wardName = toTitleCase(ward);
    const countyName = toTitleCase(county);
    const displayName =
      wardName && countyName && wardName !== countyName
        ? `${wardName}, ${countyName}`
        : wardName || countyName || "your area";
    return { wardName, county: countyName, constituency: "", displayName };
  } catch {
    return { wardName: "", displayName: "your area" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Kick off GeoJSON loading in the background as early as possible.
 * Call once when the app mounts so data is ready before GPS arrives.
 */
export function preloadWards(): void {
  void loadWards();
}

/**
 * Resolve a GPS coordinate to structured location info including the raw
 * ward name (for Firestore queries) and a display string (for the UI).
 */
export async function getWardInfo(lat: number, lng: number): Promise<ResolvedLocation> {
  const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
  if (resolvedCache.has(key)) return resolvedCache.get(key)!;

  // 1. Try GeoJSON (primary — no network call once loaded)
  const features = await loadWards();
  if (features) {
    const match = findWard(lat, lng, features);
    if (match) {
      const wardName = toTitleCase(match.ward);
      const county = toTitleCase(match.county);
      const constituency = toTitleCase(match.constituency);
      const displayName = county ? `${wardName}, ${county}` : wardName;
      const result: ResolvedLocation = { wardName, constituency, county, displayName };
      resolvedCache.set(key, result);
      return result;
    }
  }

  // 2. OSM Nominatim (fallback only)
  const fallback = await nominatimFallback(lat, lng);
  const result: ResolvedLocation = {
    wardName: fallback.wardName ?? "",
    constituency: fallback.constituency ?? "",
    county: fallback.county ?? "",
    displayName: fallback.displayName ?? "your area",
  };
  resolvedCache.set(key, result);
  return result;
}

/**
 * Convenience wrapper — returns just the display string.
 * Used by places that only need to show a location label.
 */
export async function getWardName(lat: number, lng: number): Promise<string> {
  const info = await getWardInfo(lat, lng);
  return info.displayName;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
