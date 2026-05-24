import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Plus, MapPin, Search, Loader2, Store } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const NAIROBI: [number, number] = [-1.286389, 36.817223];
const CATEGORIES = ["All", "Food", "Hotel", "Clothing", "Electronics", "Services", "Produce", "Other"];

const CATEGORY_COLORS: Record<string, string> = {
  Food: "#f59e0b",
  Hotel: "#e11d48",
  Clothing: "#8b5cf6",
  Electronics: "#3b82f6",
  Services: "#14b8a6",
  Produce: "#22c55e",
  Other: "#6b7280",
};

interface Product {
  id: string;
  title: string;
  price: number;
  category: string;
  imageUrl: string;
  lat: number;
  lng: number;
  sellerId: string;
  sellerName: string;
}

function makePriceMarker(price: number, category: string) {
  const color = CATEGORY_COLORS[category] ?? "#f97316";
  const label =
    price >= 1000 ? `${(price / 1000).toFixed(price % 1000 === 0 ? 0 : 1)}k` : String(price);
  const width = Math.max(52, label.length * 10 + 24);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="34" viewBox="0 0 ${width} 34">
      <rect x="1" y="1" width="${width - 2}" height="24" rx="12" fill="${color}" stroke="white" stroke-width="1.5"/>
      <polygon points="${width / 2 - 5},25 ${width / 2 + 5},25 ${width / 2},33" fill="${color}"/>
      <text x="${width / 2}" y="16" font-family="Outfit,sans-serif" font-size="11" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">KES ${label}</text>
    </svg>`.trim();
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [width, 34],
    iconAnchor: [width / 2, 34],
    popupAnchor: [0, -36],
  });
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
}

function FlyToProduct({ coords }: { coords: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo(coords, 16, { duration: 0.8 });
  }, [coords, map]);
  return null;
}

export default function MapView() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const cardStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords([pos.coords.latitude, pos.coords.longitude]);
        setGpsLoading(false);
      },
      () => {
        setUserCoords(NAIROBI);
        setGpsLoading(false);
      },
      { timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    });
  }, []);

  const filtered = products.filter((p) => {
    const matchCat = activeCategory === "All" || p.category === activeCategory;
    const matchSearch =
      !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sellerName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const center = userCoords ?? NAIROBI;

  function scrollCardIntoView(index: number) {
    const strip = cardStripRef.current;
    if (!strip) return;
    const card = strip.children[index] as HTMLElement;
    if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function handleCardClick(product: Product, index: number) {
    setFlyTo([product.lat, product.lng]);
    scrollCardIntoView(index);
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex-shrink-0 z-[500] relative bg-card border-b border-border px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white text-sm font-black">B</span>
          </div>
          <span className="font-black text-lg tracking-tight">BizMtaani</span>
        </div>
        <button
          data-testid="button-toggle-search"
          onClick={() => setShowSearch((s) => !s)}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <Search size={20} />
        </button>
      </header>

      {showSearch && (
        <div className="flex-shrink-0 z-[500] relative bg-card border-b border-border px-4 py-2">
          <input
            data-testid="input-search"
            type="search"
            placeholder="Search products or sellers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full h-10 px-4 rounded-xl bg-muted text-foreground text-sm outline-none border border-transparent focus:border-primary transition-colors"
          />
        </div>
      )}

      <div className="flex-shrink-0 z-[400] relative bg-card/90 backdrop-blur-sm border-b border-border">
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              data-testid={`filter-${cat.toLowerCase()}`}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative z-0 min-h-0">
        {gpsLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/50">
            <Loader2 size={28} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Finding your location...</p>
          </div>
        ) : (
          <MapContainer
            center={center}
            zoom={15}
            className="w-full h-full"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <RecenterMap center={center} />
            <FlyToProduct coords={flyTo} />

            {userCoords && (
              <Marker
                position={userCoords}
                icon={new L.Icon({
                  iconUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="%23f97316" stroke="white" stroke-width="2"/><circle cx="10" cy="10" r="3" fill="white"/></svg>`,
                  iconSize: [20, 20],
                  iconAnchor: [10, 10],
                })}
              >
                <Popup>You are here</Popup>
              </Marker>
            )}

            {filtered.map((product) => (
              <Marker
                key={product.id}
                position={[product.lat, product.lng]}
                icon={makePriceMarker(product.price, product.category)}
              >
                <Popup>
                  <div className="w-44">
                    {product.imageUrl && (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-28 object-cover rounded-lg mb-2"
                      />
                    )}
                    <p className="font-bold text-sm leading-tight">{product.title}</p>
                    <p className="text-primary font-bold text-sm mt-0.5">
                      KES {product.price.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{product.sellerName}</p>
                    <button
                      onClick={() => setLocation(`/product/${product.id}`)}
                      className="mt-2 w-full py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold"
                    >
                      View Details
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}

        {user && (
          <button
            data-testid="fab-post-product"
            onClick={() => setLocation("/post")}
            className="absolute top-4 right-4 z-[400] w-12 h-12 rounded-full bg-primary text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        )}

        {!user && (
          <div className="absolute top-3 left-3 right-3 z-[400]">
            <div className="bg-card/95 backdrop-blur-sm rounded-2xl border border-border p-3 flex items-center gap-3 shadow-lg">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Start selling near you</p>
                <p className="text-xs text-muted-foreground">Sign in to post products</p>
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
          </div>
        )}
      </div>

      {/* Product card strip */}
      {!gpsLoading && (
        <div className="flex-shrink-0 z-[400] bg-transparent">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 bg-card/80 backdrop-blur-sm border-t border-border">
              <p className="text-sm text-muted-foreground text-center">No products in this area</p>
            </div>
          ) : (
            <div className="border-t border-border bg-card/90 backdrop-blur-sm">
              <div
                ref={cardStripRef}
                className="flex gap-3 px-4 py-3 overflow-x-auto no-scrollbar"
              >
                {filtered.map((product, index) => (
                  <div
                    key={product.id}
                    data-testid={`strip-card-${product.id}`}
                    onClick={() => handleCardClick(product, index)}
                    className="flex-shrink-0 w-36 rounded-2xl overflow-hidden bg-card border border-border cursor-pointer active:scale-95 transition-transform shadow-sm"
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-24 object-cover"
                      />
                    ) : (
                      <div className="w-full h-24 bg-muted flex items-center justify-center">
                        <Store size={20} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-bold leading-tight line-clamp-1">{product.title}</p>
                      <p className="text-xs font-bold text-primary mt-0.5">
                        KES {product.price.toLocaleString()}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/product/${product.id}`);
                        }}
                        className="mt-1.5 w-full text-[10px] font-semibold text-primary border border-primary/30 rounded-lg py-1 hover:bg-primary/5 transition-colors"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
