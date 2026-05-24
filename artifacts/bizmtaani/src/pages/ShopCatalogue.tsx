import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import {
  collection, query, where, orderBy, getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/BottomNav";
import { ChevronLeft, Phone, MessageCircle, Package, Store, MapPin, Loader2 } from "lucide-react";
import { getCategoryBadgeColor } from "@/lib/categories";

interface ShopProduct {
  id: string;
  title: string;
  price: number;
  rentPerMonth?: number;
  category: string;
  subcategory?: string;
  imageUrl: string;
  imageUrls?: string[];
  sellerId: string;
  sellerName: string;
  sellerAvatar: string;
  phone?: string;
  ward?: string;
  pricingBasis?: string;
  priceType?: "fixed" | "negotiable";
  createdAt: { seconds: number } | null;
}

function priceDisplay(p: ShopProduct): string {
  if (p.pricingBasis === "quote_only") return "Quote only";
  if (p.category === "Accommodation") {
    return `KES ${(p.rentPerMonth ?? p.price).toLocaleString()}/mo`;
  }
  if (!p.price) return "Price on request";
  const basisMap: Record<string, string> = {
    per_km: "/km", per_hour: "/hr", per_day: "/day",
    per_session: "/session", per_trip: "/trip",
  };
  const suffix = p.pricingBasis ? (basisMap[p.pricingBasis] ?? "") : "";
  const neg = p.priceType === "negotiable" ? " · Neg." : "";
  return `KES ${p.price.toLocaleString()}${suffix}${neg}`;
}

export default function ShopCatalogue() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwn = user?.uid === userId;

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, "products"),
      where("sellerId", "==", userId),
      orderBy("createdAt", "desc")
    );
    getDocs(q)
      .then((snap) => {
        setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ShopProduct)));
      })
      .finally(() => setLoading(false));
  }, [userId]);

  // Derive seller info from first product
  const sellerName = products[0]?.sellerName ?? "Seller";
  const sellerAvatar = products[0]?.sellerAvatar ?? "";
  const sellerWard = products[0]?.ward ?? "";
  const sellerPhone = products[0]?.phone ?? "";

  const initial = sellerName.charAt(0).toUpperCase();

  // Group products by category for the catalogue view
  const categories = Array.from(new Set(products.map((p) => p.category)));

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header bar */}
      <div className="sticky top-0 z-40 bg-card border-b border-border flex items-center gap-3 px-4 h-14">
        <button
          onClick={() => navigate(-1 as unknown as string)}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Store size={16} className="text-primary flex-shrink-0" />
          <span className="font-black text-base truncate">
            {isOwn ? "My Shop" : `${sellerName}'s Shop`}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Shop profile header */}
          <div className="px-4 pt-5 pb-4 space-y-4">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0 border border-border">
                {sellerAvatar ? (
                  <img src={sellerAvatar} alt={sellerName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-black text-primary">{initial}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="font-black text-xl leading-tight truncate">{sellerName}</h1>
                {sellerWard && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin size={11} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{sellerWard}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {products.length} {products.length === 1 ? "listing" : "listings"}
                  {categories.length > 1 ? ` across ${categories.length} categories` : ""}
                </p>
              </div>
            </div>

            {/* Contact buttons — only for other buyers */}
            {!isOwn && sellerPhone && (
              <div className="flex gap-2">
                <a
                  href={`tel:${sellerPhone}`}
                  className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-secondary text-white text-sm font-bold"
                >
                  <Phone size={15} />
                  Call
                </a>
                <a
                  href={`https://wa.me/${sellerPhone.replace(/\D/g, "").replace(/^0/, "254")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-green-600 text-white text-sm font-bold"
                >
                  <MessageCircle size={15} />
                  WhatsApp
                </a>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-2 bg-muted" />

          {/* Product grid */}
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
                <Package size={28} className="text-muted-foreground" />
              </div>
              <p className="font-bold text-lg">No listings yet</p>
              {isOwn && (
                <Link
                  href="/post"
                  className="text-primary font-semibold text-sm underline underline-offset-2"
                >
                  Post your first product
                </Link>
              )}
            </div>
          ) : (
            <div className="px-4 pt-4 space-y-6">
              {categories.map((cat) => {
                const catProducts = products.filter((p) => p.category === cat);
                const badgeColor = getCategoryBadgeColor(cat);
                return (
                  <div key={cat}>
                    {/* Category heading — only shown when multiple categories */}
                    {categories.length > 1 && (
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>
                          {cat}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {catProducts.length} {catProducts.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {catProducts.map((product) => {
                        const displayImage =
                          product.imageUrls?.[0] ?? product.imageUrl ?? "";
                        return (
                          <Link
                            key={product.id}
                            href={`/product/${product.id}`}
                            className="bg-card rounded-2xl border border-border overflow-hidden active:scale-[0.97] transition-transform"
                          >
                            {/* Image */}
                            <div className="relative w-full aspect-square bg-muted">
                              {displayImage ? (
                                <img
                                  src={displayImage}
                                  alt={product.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package size={28} className="text-muted-foreground" />
                                </div>
                              )}
                              {/* Price overlay */}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6">
                                <span className="text-white text-xs font-bold line-clamp-1">
                                  {priceDisplay(product)}
                                </span>
                              </div>
                            </div>

                            {/* Title */}
                            <div className="px-2.5 py-2.5">
                              <p className="text-sm font-semibold leading-tight line-clamp-2">
                                {product.title}
                              </p>
                              {product.subcategory && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                  {product.subcategory}
                                </p>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <BottomNav />
    </div>
  );
}
