import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Package, Loader2, Store } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";

interface Product {
  id: string;
  title: string;
  price: number;
  category: string;
  imageUrl: string;
  createdAt: { seconds: number } | null;
}

export default function MyListings() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!user) {
      setLocation("/login");
      return;
    }
    const q = query(
      collection(db, "products"),
      where("sellerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    });
    return unsub;
  }, [user, setLocation]);

  async function confirmDelete() {
    if (!confirmProduct) return;
    const product = confirmProduct;
    setConfirmProduct(null);
    setDeleting(product.id);
    try {
      await deleteDoc(doc(db, "products", product.id));
      if (product.imageUrl) {
        try {
          const storageRef = ref(storage, product.imageUrl);
          await deleteObject(storageRef);
        } catch {}
      }
      toast({ title: "Listing deleted" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-card border-b border-border px-4 h-14 flex items-center justify-between">
        <h1 className="font-black text-lg">My Listings</h1>
        <div className="flex items-center gap-2">
          {products.length > 0 && (
            <button
              onClick={() => setLocation(`/shop/${user?.uid}`)}
              className="flex items-center gap-1.5 text-xs text-primary font-semibold px-3 py-1.5 rounded-xl bg-primary/10"
            >
              <Store size={13} />
              My Shop
            </button>
          )}
          <Button
            data-testid="button-post-product"
            size="sm"
            className="gap-1.5 font-semibold"
            onClick={() => setLocation("/post")}
          >
            <Plus size={16} />
            Post
          </Button>
        </div>
      </header>

      <div className="px-4 py-4 max-w-lg mx-auto">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
              <Package size={36} className="text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">No listings yet</p>
              <p className="text-muted-foreground text-sm mt-1">Post your first product to start selling</p>
            </div>
            <Button data-testid="button-first-post" onClick={() => setLocation("/post")} className="gap-2">
              <Plus size={16} />
              Post a Product
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => (
              <div
                key={product.id}
                data-testid={`card-product-${product.id}`}
                className="bg-card rounded-2xl border border-border overflow-hidden"
              >
                <Link href={`/product/${product.id}`}>
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-muted flex items-center justify-center">
                      <Package size={28} className="text-muted-foreground" />
                    </div>
                  )}
                </Link>
                <div className="p-3">
                  <p data-testid={`text-title-${product.id}`} className="font-bold text-sm line-clamp-1">{product.title}</p>
                  <p data-testid={`text-price-${product.id}`} className="text-primary font-bold text-sm mt-0.5">
                    KES {product.price.toLocaleString()}
                  </p>
                  <button
                    data-testid={`button-delete-${product.id}`}
                    onClick={() => setConfirmProduct(product)}
                    disabled={deleting === product.id}
                    className="mt-2 flex items-center gap-1 text-destructive text-xs font-medium hover:opacity-70 transition-opacity"
                  >
                    {deleting === product.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmProduct} onOpenChange={(open) => { if (!open) setConfirmProduct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmProduct?.title}" will be permanently removed from the marketplace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BottomNav />
    </div>
  );
}
