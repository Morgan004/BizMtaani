/**
 * Home feed — two-phase ward-first advert loader.
 *
 * Phase 1 — exact ward:  query products WHERE ward == userWard  (fast, most relevant)
 * Phase 2 — wider area:  geohash prefix query (~40 km radius)   (fallback / "load more")
 *
 * Category filter is applied client-side on the small page-sized batches so
 * no composite Firestore index is required.
 *
 * Firestore index required (create once in Firebase Console):
 *   Collection: products  |  Fields: ward ASC, createdAt DESC
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  collection, query, orderBy, where, limit, startAfter,
  getDocs, QueryDocumentSnapshot, DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { areaPrefix } from "@/lib/geohash";
import { getWardInfo, type ResolvedLocation } from "@/lib/location";
import { CATEGORY_DEFS, getCategoryBadgeColor } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Search, Plus, MapPin, Loader2, Package, X } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

// ── Constants ─────────────────────────────────────────────────────────────────
const WARD_PAGE = 20;   // products per ward page
const AREA_PAGE = 20;   // products per area page
const NAIROBI: [number, number] = [-1.286389, 36.817223];

const FILTER_CHIPS = [
  { label: "All", key: "All" },
  ...CATEGORY_DEFS.map((c) => ({ label: c.displayShort, key: c.key })),
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  title: string;
  price: number;
  rentPerMonth?: number;
  category: string;
  subcategory?: string;
  imageUrl: string;
  imageUrls?: string[];
  lat: number;
  lng: number;
  ward?: string;
  priceType?: "fixed" | "negotiable";
  pricingBasis?: string;
  sellerId: string;
  sellerName: string;
  phone?: string;
  geohash?: string;
  createdAt?: { seconds: number } | null;
}

type Cursor = QueryDocumentSnapshot<DocumentData>;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function toProducts(docs: QueryDocumentSnapshot<DocumentData>[]): Product[] {
  return docs.map((d) => ({ id: d.id, ...d.data() } as Product));
}

function dedupe(existing: Product[], incoming: Product[]): Product[] {
  const ids = new Set(existing.map((p) => p.id));
  return [...existing, ...incoming.filter((p) => !ids.has(p.id))];
}

// ── ProductCard ───────────────────────────────────────────────────────────────
function ProductCard({
  product, userCoords, gpsGranted, onClick,
}: {
  product: Product; userCoords: [number, number] | null;
  gpsGranted: boolean; onClick: () => void;
}) {
  const distance =
    gpsGranted && userCoords
      ? getDistanceKm(userCoords[0], userCoords[1], product.lat, product.lng)
      : null;

  const badgeColor = getCategoryBadgeColor(product.category);
  const isAccommodation = product.category === "Accommodation";
  const isEatery =
    product.subcategory === "Hotels / Eateries" ||
    product.subcategory === "Restaurants & Cooked Food";
  const displayImage = product.imageUrls?.[0] ?? product.imageUrl ?? "";

  const negotiable = product.priceType === "negotiable";
  const basisLabel: Record<string, string> = {
    per_km: "/km", per_hour: "/hr", per_day: "/day",
    per_trip: "/trip", per_session: "/session",
  };
  const basisSuffix = product.pricingBasis ? (basisLabel[product.pricingBasis] ?? "") : "";
  const priceLabel = isAccommodation
    ? `KES ${(product.rentPerMonth ?? product.price).toLocaleString()}/mo`
    : isEatery
    ? null
    : product.pricingBasis === "quote_only"
    ? "Quote only"
    : product.price > 0
    ? `KES ${product.price.toLocaleString()}${basisSuffix}${negotiable ? " · Neg." : ""}`
    : negotiable ? "Negotiable" : null;

  return (
    <div
      data-testid={`product-card-${product.id}`}
      onClick={onClick}
      className="bg-card rounded-2xl border border-border overflow-hidden cursor-pointer active:scale-[0.98] transition-transform shadow-sm"
    >
      <div className="relative">
        {displayImage ? (
          <img
            src={displayImage} alt={product.title} loading="lazy"
            className="w-full aspect-square object-cover"
          />
        ) : (
          <div className="w-full aspect-square bg-muted flex items-center justify-center">
            <Package size={28} className="text-muted-foreground" />
          </div>
        )}
        {priceLabel && (
          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-lg">
            {priceLabel}
          </div>
        )}
        <div className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
          {product.subcategory ?? product.category}
        </div>
        {isAccommodation && (product.imageUrls?.length ?? 0) > 1 && (
          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
            +{(product.imageUrls?.length ?? 1) - 1} photos
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <p className="font-bold text-sm leading-tight line-clamp-2">{product.title}</p>
        <div className="flex items-center justify-between mt-1.5 gap-1">
          <p className="text-xs text-muted-foreground truncate">{product.sellerName}</p>
          {distance !== null && (
            <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
              <MapPin size={10} /><span>{fmtDist(distance)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // User location
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [gpsGranted, setGpsGranted] = useState(false);
  const [gpsReady, setGpsReady] = useState(false);
  const [locationInfo, setLocationInfo] = useState<ResolvedLocation | null>(null);

  // Filters
  const [activeKey, setActiveKey] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const isSearchMode = searchQuery.length > 0;

  // ── Phase 1: ward products ─────────────────────────────────────────────────
  const [wardProducts, setWardProducts] = useState<Product[]>([]);
  const [wardCursor, setWardCursor] = useState<Cursor | null>(null);
  const [wardDone, setWardDone] = useState(false);
  const [wardLoading, setWardLoading] = useState(false);

  // ── Phase 2: area products (geohash prefix, excludes ward duplicates) ───────
  const [areaProducts, setAreaProducts] = useState<Product[]>([]);
  const [areaCursor, setAreaCursor] = useState<Cursor | null>(null);
  const [areaDone, setAreaDone] = useState(false);
  const [areaLoading, setAreaLoading] = useState(false);

  // Initial load flag
  const [initialLoading, setInitialLoading] = useState(true);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── GPS detection ──────────────────────────────────────────────────────────
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserCoords(coords);
        setGpsGranted(true);
        setGpsReady(true);
        getWardInfo(coords[0], coords[1]).then(setLocationInfo);
      },
      () => {
        setUserCoords(NAIROBI);
        setGpsGranted(false);
        setGpsReady(true);
        getWardInfo(NAIROBI[0], NAIROBI[1]).then(setLocationInfo);
      },
      { timeout: 8000 }
    );
  }, []);

  // ── Firestore query builders ───────────────────────────────────────────────
  function wardQuery(wardName: string, cursor?: Cursor) {
    const coll = collection(db, "products");
    const base = [
      where("ward", "==", wardName),
      orderBy("createdAt", "desc"),
      limit(WARD_PAGE),
    ] as const;
    return cursor
      ? query(coll, ...base.slice(0, 2), startAfter(cursor), base[2])
      : query(coll, ...base);
  }

  function areaQuery(coords: [number, number], cursor?: Cursor) {
    const prefix = areaPrefix(coords[0], coords[1]);
    const coll = collection(db, "products");
    const base = [
      where("geohash", ">=", prefix),
      where("geohash", "<", prefix + "\uf8ff"),
      orderBy("geohash"),
      limit(AREA_PAGE),
    ] as const;
    return cursor
      ? query(coll, ...base.slice(0, 3), startAfter(cursor), base[3])
      : query(coll, ...base);
  }

  // ── Initial load (ward first, then area if ward is small) ─────────────────
  useEffect(() => {
    if (!gpsReady || !userCoords) return;

    setInitialLoading(true);
    setWardProducts([]); setWardCursor(null); setWardDone(false);
    setAreaProducts([]); setAreaCursor(null); setAreaDone(false);

    const run = async () => {
      // --- Ward phase ---
      const wardName = locationInfo?.wardName ?? "";
      if (wardName && !isSearchMode) {
        try {
          const snap = await getDocs(wardQuery(wardName));
          const docs = toProducts(snap.docs);
          setWardProducts(docs);
          setWardCursor(snap.docs[snap.docs.length - 1] ?? null);
          setWardDone(snap.docs.length < WARD_PAGE);
        } catch {
          setWardDone(true);
        }
      } else {
        setWardDone(true);
      }

      // --- Area phase (always load first page for "other nearby") ---
      try {
        const snap = await getDocs(areaQuery(userCoords));
        setAreaProducts(toProducts(snap.docs));
        setAreaCursor(snap.docs[snap.docs.length - 1] ?? null);
        setAreaDone(snap.docs.length < AREA_PAGE);
      } catch {
        setAreaDone(true);
      }

      setInitialLoading(false);
    };

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsReady, isSearchMode, locationInfo?.wardName]);

  // ── Load more (called by intersection observer) ────────────────────────────
  const loadMore = useCallback(async () => {
    if (!userCoords) return;

    // Extend ward first
    if (!wardDone && !wardLoading && wardCursor && locationInfo?.wardName) {
      setWardLoading(true);
      try {
        const snap = await getDocs(wardQuery(locationInfo.wardName, wardCursor));
        setWardProducts((prev) => dedupe(prev, toProducts(snap.docs)));
        setWardCursor(snap.docs[snap.docs.length - 1] ?? null);
        setWardDone(snap.docs.length < WARD_PAGE);
      } finally {
        setWardLoading(false);
      }
      return;
    }

    // Then extend area
    if (!areaDone && !areaLoading && areaCursor) {
      setAreaLoading(true);
      try {
        const snap = await getDocs(areaQuery(userCoords, areaCursor));
        setAreaProducts((prev) => dedupe(prev, toProducts(snap.docs)));
        setAreaCursor(snap.docs[snap.docs.length - 1] ?? null);
        setAreaDone(snap.docs.length < AREA_PAGE);
      } finally {
        setAreaLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardDone, wardLoading, wardCursor, areaDone, areaLoading, areaCursor, userCoords, locationInfo]);

  // Intersection observer drives infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // ── Client-side filter (category + search) ─────────────────────────────────
  function applyFilters(products: Product[]): Product[] {
    return products.filter((p) => {
      const matchCat = activeKey === "All" || p.category === activeKey;
      const matchSearch =
        !searchQuery ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sellerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.subcategory ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.ward ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }

  // Ward products shown in Phase 1; area products de-duplicated against ward IDs
  const wardIds = new Set(wardProducts.map((p) => p.id));
  const filteredWard = applyFilters(wardProducts);
  const filteredArea = applyFilters(areaProducts.filter((p) => !wardIds.has(p.id)));

  const totalVisible = filteredWard.length + filteredArea.length;
  const isLoadingMore = wardLoading || areaLoading;
  const allDone = wardDone && areaDone;

  // ── Search submit ──────────────────────────────────────────────────────────
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
  }
  function clearSearch() {
    setSearchInput(""); setSearchQuery(""); setShowSearch(false);
  }

  // ── Banner text ────────────────────────────────────────────────────────────
  function bannerText() {
    if (isSearchMode) return `Searching across Kenya`;
    if (!locationInfo) return "Finding your area...";
    const ward = locationInfo.wardName;
    if (ward && gpsGranted) return `Showing adverts in ${ward}`;
    if (ward) return `Showing adverts near ${ward} (location access denied)`;
    return "Finding nearby adverts...";
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">

      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-card border-b border-border px-4 h-14 flex items-center justify-between gap-3 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white text-sm font-black">B</span>
          </div>
          <span className="font-black text-lg tracking-tight">BizMtaani</span>
        </div>
        <div className="flex items-center gap-1">
          {user && (
            <button
              data-testid="fab-post-product"
              onClick={() => setLocation("/post")}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <Plus size={20} />
            </button>
          )}
          <button
            data-testid="button-toggle-search"
            onClick={() => setShowSearch((s) => !s)}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <Search size={20} />
          </button>
        </div>
      </header>

      {/* ── Search bar ── */}
      {showSearch && (
        <form
          onSubmit={handleSearch}
          className="flex-shrink-0 bg-card border-b border-border px-4 py-2 flex gap-2 z-40"
        >
          <input
            data-testid="input-search"
            type="search"
            placeholder="Search products, wards, sellers..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            autoFocus
            className="flex-1 h-10 px-4 rounded-xl bg-muted text-foreground text-sm outline-none border border-transparent focus:border-primary transition-colors"
          />
          <button
            type="submit"
            className="h-10 px-4 bg-primary text-white rounded-xl text-sm font-semibold flex-shrink-0"
          >
            Go
          </button>
        </form>
      )}

      {isSearchMode && (
        <div className="flex-shrink-0 bg-card border-b border-border px-4 py-2 flex items-center gap-2 z-40">
          <span className="text-xs text-muted-foreground">Results for:</span>
          <span className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-3 py-1 rounded-full">
            {searchQuery}
            <button onClick={clearSearch} className="ml-1"><X size={11} /></button>
          </span>
        </div>
      )}

      {/* ── Category filter chips ── */}
      <div className="flex-shrink-0 bg-card/90 backdrop-blur-sm border-b border-border z-30">
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto no-scrollbar">
          {FILTER_CHIPS.map(({ label, key }) => (
            <button
              key={key}
              data-testid={`filter-${key.toLowerCase().replace(/[\s/&]+/g, "-")}`}
              onClick={() => setActiveKey(key)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                activeKey === key
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feed ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Location banner */}
        {gpsReady && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
            <MapPin size={12} className={gpsGranted ? "text-secondary" : "text-muted-foreground"} />
            <p className="text-xs text-muted-foreground">{bannerText()}</p>
          </div>
        )}

        {initialLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Finding nearby adverts...</p>
          </div>
        ) : totalVisible === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 px-6">
            <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
              <Package size={36} className="text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">No adverts found</p>
              <p className="text-muted-foreground text-sm mt-1">
                {isSearchMode
                  ? "Try a different search term"
                  : activeKey !== "All"
                  ? "No listings in this category near you"
                  : "No listings in your area yet"}
              </p>
            </div>
            {user && (
              <Button onClick={() => setLocation("/post")} className="gap-2">
                <Plus size={16} />Be the first to post here
              </Button>
            )}
          </div>
        ) : (
          <div className="px-3 pt-3 pb-24">

            {/* ── Phase 1: Ward products ── */}
            {filteredWard.length > 0 && (
              <>
                {locationInfo?.wardName && !isSearchMode && (
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={13} className="text-primary flex-shrink-0" />
                    <p className="text-xs font-bold text-primary uppercase tracking-wide">
                      In {locationInfo.wardName}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {filteredWard.map((p) => (
                    <ProductCard
                      key={p.id} product={p}
                      userCoords={userCoords} gpsGranted={gpsGranted}
                      onClick={() => setLocation(`/product/${p.id}`)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ── Phase 2: Nearby area products ── */}
            {filteredArea.length > 0 && (
              <>
                <div className={`flex items-center gap-3 ${filteredWard.length > 0 ? "mt-6 mb-3" : "mb-3"}`}>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap px-1">
                    {filteredWard.length > 0 ? "Other nearby adverts" : "Nearby adverts"}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {filteredArea.map((p) => (
                    <ProductCard
                      key={p.id} product={p}
                      userCoords={userCoords} gpsGranted={gpsGranted}
                      onClick={() => setLocation(`/product/${p.id}`)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {isLoadingMore && (
              <div className="flex justify-center py-6">
                <Loader2 size={22} className="animate-spin text-primary" />
              </div>
            )}

            {allDone && totalVisible > 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">
                {isSearchMode
                  ? "No more results"
                  : "You have seen all nearby adverts"}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Advertise FAB ── */}
      {user && (
        <div className="fixed bottom-20 right-4 z-40">
          <button
            data-testid="fab-advertise"
            onClick={() => setLocation("/post")}
            className="flex items-center gap-2 bg-primary text-white font-black text-sm px-5 h-12 rounded-full shadow-xl active:scale-95 transition-transform"
          >
            <Plus size={18} />Advertise
          </button>
        </div>
      )}

      {/* ── Guest sign-in prompt ── */}
      {!user && gpsReady && (
        <div className="flex-shrink-0 bg-card border-t border-border px-4 py-3 flex items-center gap-3 z-40">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">Sell to buyers near you</p>
            <p className="text-xs text-muted-foreground">Sign in to post an advert</p>
          </div>
          <Button
            data-testid="button-signin-prompt"
            size="sm"
            className="flex-shrink-0"
            onClick={() => setLocation("/login")}
          >
            Sign in
          </Button>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
