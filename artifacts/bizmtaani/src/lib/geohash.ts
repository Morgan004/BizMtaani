const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Encode a lat/lng pair to a geohash string.
 * Precision guide (approximate cell size):
 *   4 → ~40km × 20km  (good for ward-area range queries)
 *   5 → ~4.9km × 4.9km
 *   6 → ~1.2km × 0.6km  (stored on products for fine-grained future use)
 */
export function encodeGeohash(lat: number, lng: number, precision = 6): string {
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let hash = "";
  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = (idx << 1) | 1; lngMin = mid; }
      else { idx <<= 1; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = (idx << 1) | 1; latMin = mid; }
      else { idx <<= 1; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) {
      hash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }
  return hash;
}

/**
 * Return the precision-4 prefix of a geohash (covers ~40km × 20km).
 * Used as the range query prefix for the home feed.
 */
export function areaPrefix(lat: number, lng: number): string {
  return encodeGeohash(lat, lng, 4);
}
