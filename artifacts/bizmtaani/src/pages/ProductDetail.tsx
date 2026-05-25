import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, MessageCircle, MapPin, Tag, Loader2, Store, Phone, ChevronRight } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { getCategoryBadgeColor } from "@/lib/categories";

interface MenuItem { name: string; price: number; }
interface HotelMenu { breakfast: MenuItem[]; lunch: MenuItem[]; supper: MenuItem[]; }

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  rentPerMonth?: number;
  category: string;
  subcategory?: string;
  imageUrl: string;
  imageUrls?: string[];
  lat: number;
  lng: number;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string;
  phone?: string;
  priceType?: "fixed" | "negotiable";
  pricingBasis?: string;
  hotelMenu?: HotelMenu;
  createdAt: { seconds: number } | null;
}

const MEAL_PERIODS: { key: keyof HotelMenu; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "supper", label: "Supper" },
];

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function HotelMenuDisplay({ menu }: { menu: HotelMenu }) {
  const periodsWithItems = MEAL_PERIODS.filter(({ key }) => (menu[key]?.length ?? 0) > 0);
  if (periodsWithItems.length === 0) return null;
  return (
    <div className="space-y-4">
      <h2 className="font-black text-lg">Menu</h2>
      {periodsWithItems.map(({ key, label }) => (
        <div key={key} className="rounded-2xl border border-border overflow-hidden">
          <div className="bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 border-b border-border">
            <span className="font-bold text-sm text-rose-700 dark:text-rose-400">{label}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Dish</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Price</th>
              </tr>
            </thead>
            <tbody>
              {menu[key].map((item, i) => (
                <tr key={i} className={i > 0 ? "border-t border-border" : ""}>
                  <td className="px-4 py-2.5 font-medium">{item.name}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-primary whitespace-nowrap">KES {item.price.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ImageGallery({ images }: { images: string[] }) {
  const [active, setActive] = useState(0);
  if (images.length === 0) return (
    <div className="w-full aspect-square bg-muted flex items-center justify-center">
      <Store size={48} className="text-muted-foreground" />
    </div>
  );
  return (
    <div>
      <img src={images[active]} alt="" className="w-full aspect-square object-cover" />
      {images.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar bg-card border-b border-border">
          {images.map((url, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${i === active ? "border-primary" : "border-transparent opacity-60"}`}>
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "products", id)).then((snap) => {
      if (snap.exists()) setProduct({ id: snap.id, ...snap.data() } as Product);
      setLoading(false);
    });
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [id]);

  async function handleChat() {
    if (!user) return setLocation("/login");
    if (!product || product.sellerId === user.uid) return;
    setChatLoading(true);
    try {
      const q = query(collection(db, "chats"), where("productId", "==", product.id), where("buyerId", "==", user.uid));
      const existing = await getDocs(q);
      if (!existing.empty) { setLocation(`/chat/${existing.docs[0].id}`); return; }
      const chatDoc = await addDoc(collection(db, "chats"), {
        productId: product.id, productTitle: product.title,
        productImage: product.imageUrls?.[0] ?? product.imageUrl,
        buyerId: user.uid, buyerName: user.displayName || "Buyer",
        sellerId: product.sellerId, sellerName: product.sellerName,
        participants: [user.uid, product.sellerId],
        lastMessage: "", lastMessageAt: serverTimestamp(),
      });
      setLocation(`/chat/${chatDoc.id}`);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally { setChatLoading(false); }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-primary" />
    </div>
  );
  if (!product) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
      <p className="text-muted-foreground">Product not found.</p>
      <Button onClick={() => setLocation("/")}>Go back</Button>
    </div>
  );

  const isSeller = user?.uid === product.sellerId;
  const isAccommodation = product.category === "Accommodation";
  const isEatery = product.subcategory === "Hotels / Eateries" || product.subcategory === "Restaurants & Cooked Food";
  const badgeColor = getCategoryBadgeColor(product.category);
  const distance = userCoords
    ? getDistanceKm(userCoords.lat, userCoords.lng, product.lat, product.lng)
    : null;
  const images = product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];

  // Seller role label
  const roleLabel = isAccommodation ? "Landlord / Agent"
    : isEatery ? "Restaurant owner"
    : "Seller";

  return (
    <div className="min-h-screen bg-background pb-36">
      <header className="sticky top-0 z-40 bg-transparent px-4 h-14 flex items-center">
        <button data-testid="button-back" onClick={() => setLocation("/")}
          className="p-2 rounded-full bg-card/80 backdrop-blur-sm shadow">
          <ChevronLeft size={20} />
        </button>
      </header>

      <div className="-mt-14">
        <ImageGallery images={images} />
      </div>

      <div className="px-4 pt-4 pb-4 space-y-4">
        {/* Title + price + badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h1 data-testid="text-product-title" className="text-2xl font-black leading-tight">{product.title}</h1>
            {isAccommodation ? (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <p data-testid="text-product-price" className="text-xl font-bold text-indigo-600">
                  KES {(product.rentPerMonth ?? product.price).toLocaleString()} / month
                </p>
                {product.priceType === "negotiable" && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">Negotiable</span>
                )}
              </div>
            ) : !isEatery ? (
              <div className="mt-1 space-y-1">
                {product.pricingBasis === "quote_only" ? (
                  <p data-testid="text-product-price" className="text-2xl font-bold text-primary">
                    Quote on request
                  </p>
                ) : product.price > 0 ? (
                  <p data-testid="text-product-price" className="text-2xl font-bold text-primary">
                    KES {product.price.toLocaleString()}
                    {product.pricingBasis && product.pricingBasis !== "per_trip" && (
                      <span className="text-base font-semibold text-muted-foreground ml-1">
                        {{
                          per_km: "per km",
                          per_hour: "per hour",
                          per_day: "per day",
                          per_session: "per session",
                        }[product.pricingBasis]}
                      </span>
                    )}
                  </p>
                ) : (
                  <p data-testid="text-product-price" className="text-2xl font-bold text-primary">
                    Price on request
                  </p>
                )}
                {product.pricingBasis !== "quote_only" && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      product.priceType === "negotiable"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-100 text-green-700"
                    }`}>
                      {product.priceType === "negotiable" ? "Negotiable" : "Fixed price"}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 ${badgeColor}`}>
              <Tag size={11} />{product.subcategory ?? product.category}
            </span>
          </div>
        </div>

        {product.description && (
          <p data-testid="text-product-description" className="text-muted-foreground leading-relaxed">
            {product.description}
          </p>
        )}

        {/* Hotel/eatery menu */}
        {isEatery && product.hotelMenu && <HotelMenuDisplay menu={product.hotelMenu} />}

        {/* Seller card */}
        <div
          className="flex items-center gap-3 p-3 bg-card rounded-2xl border border-border cursor-pointer active:bg-muted transition-colors"
          onClick={() => setLocation(`/shop/${product.sellerId}`)}
        >
          {product.sellerAvatar ? (
            <img src={product.sellerAvatar} alt={product.sellerName}
              className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-bold text-lg">{product.sellerName[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1">
            <p data-testid="text-seller-name" className="font-semibold text-sm">{product.sellerName}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {distance !== null && (
              <div className="flex items-center gap-1 text-xs">
                <MapPin size={12} />
                <span data-testid="text-distance">
                  {distance < 1 ? `${(distance * 1000).toFixed(0)}m` : `${distance.toFixed(1)}km`}
                </span>
              </div>
            )}
            <ChevronRight size={16} />
          </div>
        </div>
        {/* View shop link */}
        <div className="flex justify-end px-1">
          <button
            onClick={() => setLocation(`/shop/${product.sellerId}`)}
            className="flex items-center gap-1.5 text-xs text-primary font-semibold"
          >
            <Store size={12} />
            {isSeller ? "View my shop" : `See all from ${product.sellerName.split(" ")[0]}`}
            <ChevronRight size={12} />
          </button>
        </div>

        {/* Phone */}
        {product.phone && (
          <a href={`tel:${product.phone}`} data-testid="link-phone"
            className="flex items-center gap-3 p-3 bg-card rounded-2xl border border-border hover:border-secondary transition-colors">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Phone size={18} className="text-secondary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">
                {isAccommodation ? "Landlord's number" : "WhatsApp / Phone"}
              </p>
              <p className="font-bold text-sm">{product.phone}</p>
            </div>
            <span className="text-xs font-semibold text-secondary px-3 py-1.5 bg-secondary/10 rounded-xl">Call</span>
          </a>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 space-y-2">
        {isSeller ? (
          <div className="text-center text-sm text-muted-foreground py-2">This is your listing</div>
        ) : (
          <div className="flex gap-2">
            {product.phone && (
              <a href={`tel:${product.phone}`}
                className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl bg-secondary text-white font-bold shadow-lg">
                <Phone size={17} />Call
              </a>
            )}
            <Button data-testid="button-chat-seller"
              className={`h-12 font-bold gap-2 shadow-xl ${product.phone ? "flex-1" : "w-full"}`}
              onClick={handleChat} disabled={chatLoading}>
              {chatLoading ? <Loader2 size={18} className="animate-spin" /> : <MessageCircle size={18} />}
              {isAccommodation ? "Message Landlord" : isEatery ? "Contact Restaurant" : "Chat with Seller"}
            </Button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
