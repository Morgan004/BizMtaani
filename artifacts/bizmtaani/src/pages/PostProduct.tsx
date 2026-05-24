import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Camera, MapPin, Loader2,
  CheckCircle2, Plus, Trash2, Phone, Search, X,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { encodeGeohash } from "@/lib/geohash";
import { getWardInfo, type ResolvedLocation } from "@/lib/location";
import { CATEGORY_DEFS } from "@/lib/categories";

// ── Hotel menu types ─────────────────────────────────────────────────────────
const MEAL_PERIODS = [
  { key: "breakfast" as const, label: "Breakfast" },
  { key: "lunch" as const, label: "Lunch" },
  { key: "supper" as const, label: "Supper" },
];
type MealPeriod = "breakfast" | "lunch" | "supper";
interface MenuItem { name: string; price: string; }
type HotelMenu = Record<MealPeriod, MenuItem[]>;
function emptyMenu(): HotelMenu { return { breakfast: [], lunch: [], supper: [] }; }

function MenuSection({ period, label, items, onChange }: {
  period: MealPeriod; label: string; items: MenuItem[];
  onChange: (items: MenuItem[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{label}</span>
        <button type="button"
          onClick={() => onChange([...items, { name: "", price: "" }])}
          className="flex items-center gap-1 text-xs font-semibold text-primary">
          <Plus size={12} /> Add dish
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">No dishes yet — tap "Add dish"</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-full">Dish name</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">KES</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className={i > 0 ? "border-t border-border" : ""}>
                  <td className="px-2 py-1.5">
                    <input type="text" placeholder="e.g. Ugali + Beef" value={item.name}
                      onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))}
                      className="w-full bg-transparent outline-none text-sm placeholder:text-muted-foreground/50" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" placeholder="200" value={item.price}
                      onChange={(e) => onChange(items.map((it, idx) => idx === i ? { ...it, price: e.target.value } : it))}
                      className="w-20 text-right bg-transparent outline-none text-sm placeholder:text-muted-foreground/50" />
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ImageSlot({ label, preview, onPick, onRemove }: {
  label: string; preview: string | null; onPick: () => void; onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div onClick={!preview ? onPick : undefined}
        className={`relative aspect-square rounded-xl overflow-hidden border-2 border-dashed flex items-center justify-center transition-colors ${
          preview ? "border-transparent cursor-default" : "border-border cursor-pointer hover:border-primary"
        } bg-muted`}>
        {preview ? (
          <>
            <img src={preview} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="absolute top-1 right-1 bg-black/60 rounded-full p-1">
              <Trash2 size={12} className="text-white" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Camera size={20} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Tap to add</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {[1, 2, 3].map((s) => (
        <div key={s}
          className={`rounded-full transition-all ${s === step ? "w-6 h-2 bg-primary" : s < step ? "w-2 h-2 bg-primary/40" : "w-2 h-2 bg-muted-foreground/25"}`} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PostProduct() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // Navigation state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");

  // Common form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<"fixed" | "negotiable">("fixed");
  const [pricingBasis, setPricingBasis] = useState<"per_trip" | "per_km" | "per_hour" | "per_day" | "per_session" | "quote_only">("per_trip");
  const [phone, setPhone] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [wardInfo, setWardInfo] = useState<ResolvedLocation | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Location search (for sellers whose advert is at a different location)
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);

  // Single image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const singleFileRef = useRef<HTMLInputElement>(null);
  const singleCameraRef = useRef<HTMLInputElement>(null);

  // Accommodation: 3 images
  const [accomFiles, setAccomFiles] = useState<(File | null)[]>([null, null, null]);
  const [accomPreviews, setAccomPreviews] = useState<(string | null)[]>([null, null, null]);
  const accomRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const accomCameraRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Image source picker sheet: "single" or accom slot index 0-2
  const [showImageMenu, setShowImageMenu] = useState<null | "single" | number>(null);

  // Hotel/Eatery menu
  const [hotelMenu, setHotelMenu] = useState<HotelMenu>(emptyMenu());

  // Prefill phone from user profile
  useEffect(() => {
    if (user?.phoneNumber) setPhone(user.phoneNumber);
  }, [user]);

  // Auto-detect GPS on mount
  useEffect(() => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c); setGpsLoading(false);
        getWardInfo(c.lat, c.lng).then(setWardInfo);
      },
      () => setGpsLoading(false),
      { timeout: 10000 }
    );
  }, []);

  function detectLocation() {
    setGpsLoading(true);
    setShowLocationSearch(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c); setGpsLoading(false);
        getWardInfo(c.lat, c.lng).then(setWardInfo);
        toast({ title: "Location detected" });
      },
      () => {
        setGpsLoading(false);
        toast({ title: "Location not found", description: "Please enable GPS and try again.", variant: "destructive" });
      },
      { timeout: 10000 }
    );
  }

  async function runLocationSearch() {
    if (!locationQuery.trim()) return;
    setSearchingLocation(true);
    setLocationResults([]);
    try {
      const q = encodeURIComponent(locationQuery.trim() + ", Kenya");
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&countrycodes=ke&limit=6`,
        { headers: { "User-Agent": "BizMtaani/1.0", "Accept-Language": "en" } }
      );
      const data = await res.json();
      setLocationResults(data);
      if (data.length === 0) toast({ title: "No results", description: "Try a different area name." });
    } catch {
      toast({ title: "Search failed", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setSearchingLocation(false);
    }
  }

  async function pickSearchedLocation(r: { lat: string; lon: string; display_name: string }) {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    setCoords({ lat, lng });
    setLocationResults([]);
    setLocationQuery("");
    setShowLocationSearch(false);
    const info = await getWardInfo(lat, lng);
    setWardInfo(info);
    toast({ title: "Location set", description: info.displayName });
  }

  function handleSingleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleAccomImage(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const files = [...accomFiles]; files[index] = file;
    const previews = [...accomPreviews]; previews[index] = URL.createObjectURL(file);
    setAccomFiles(files); setAccomPreviews(previews);
  }

  function removeAccomImage(index: number) {
    const files = [...accomFiles]; files[index] = null;
    const previews = [...accomPreviews]; previews[index] = null;
    setAccomFiles(files); setAccomPreviews(previews);
  }

  async function uploadFile(file: File, path: string): Promise<string> {
    const snap = await uploadBytes(ref(storage, path), file);
    return getDownloadURL(snap.ref);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return setLocation("/login");
    if (!coords) return toast({ title: "We need your location", description: "Tap 'Use my current location' so buyers near you can find this advert.", variant: "destructive" });
    if (!phone.trim()) return toast({ title: "Phone number required", description: "Buyers need a way to reach you.", variant: "destructive" });

    setSubmitting(true);
    try {
      const geohash = encodeGeohash(coords.lat, coords.lng, 6);
      const base = {
        category,
        subcategory,
        description,
        lat: coords.lat, lng: coords.lng, geohash,
        ward: wardInfo?.wardName ?? "",
        constituency: wardInfo?.constituency ?? "",
        county: wardInfo?.county ?? "",
        priceType,
        pricingBasis: isServices ? pricingBasis : undefined,
        sellerId: user.uid,
        sellerName: user.displayName || "Seller",
        sellerAvatar: user.photoURL || "",
        phone: phone.trim(),
        createdAt: serverTimestamp(),
      };

      const ts = Date.now();
      const uid = user.uid;

      if (isAccommodation) {
        const urls: string[] = [];
        for (let i = 0; i < 3; i++) {
          if (accomFiles[i]) {
            urls.push(await uploadFile(accomFiles[i]!, `products/${uid}/${ts}_${i}_${accomFiles[i]!.name}`));
          }
        }
        await addDoc(collection(db, "products"), {
          ...base,
          title: title || subcategory,
          rentPerMonth: parseFloat(price) || 0,
          price: parseFloat(price) || 0,
          imageUrl: urls[0] ?? "",
          imageUrls: urls,
        });
      } else if (isEatery) {
        let imageUrl = "";
        if (imageFile) imageUrl = await uploadFile(imageFile, `products/${uid}/${ts}_${imageFile.name}`);
        const cleanMenu: Record<string, { name: string; price: number }[]> = {};
        for (const { key } of MEAL_PERIODS) {
          cleanMenu[key] = hotelMenu[key].filter((it) => it.name.trim())
            .map((it) => ({ name: it.name.trim(), price: parseFloat(it.price) || 0 }));
        }
        await addDoc(collection(db, "products"), { ...base, title, price: 0, imageUrl, hotelMenu: cleanMenu });
      } else {
        let imageUrl = "";
        if (imageFile) imageUrl = await uploadFile(imageFile, `products/${uid}/${ts}_${imageFile.name}`);
        await addDoc(collection(db, "products"), { ...base, title, price: parseFloat(price) || 0, imageUrl });
      }

      toast({ title: "Advert posted!", description: wardInfo?.wardName ? `Buyers in ${wardInfo.wardName} will see it.` : "Your advert is now live." });
      setLocation("/my-listings");
    } catch (err: unknown) {
      toast({ title: "Could not post advert", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false); }
  }

  const catDef = CATEGORY_DEFS.find((c) => c.key === category);
  const isAccommodation = category === "Accommodation";
  const isServices = category === "Services";
  const isEatery = subcategory === "Hotels / Eateries" || subcategory === "Restaurants & Cooked Food";

  // ── STEP 1: Main category ─────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 bg-card border-b border-border px-4 h-14 flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="p-1 -ml-1 rounded-lg hover:bg-muted">
            <ChevronLeft size={22} />
          </button>
          <div>
            <h1 className="font-black text-lg leading-tight">What would you like to advertise?</h1>
            <p className="text-xs text-muted-foreground">Pick a category to start your advert</p>
          </div>
        </header>
        <StepDots step={1} />
        <div className="px-4 max-w-lg mx-auto space-y-2.5 pb-6">
          {CATEGORY_DEFS.map(({ key, icon: Icon, color, tagline }) => (
            <button
              key={key}
              data-testid={`category-pick-${key.toLowerCase().replace(/[\s/&]+/g, "-")}`}
              onClick={() => { setCategory(key); setSubcategory(""); setStep(2); }}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] text-left ${color}`}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white/60 flex-shrink-0">
                <Icon size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{key}</p>
                <p className="text-xs opacity-70 mt-0.5">{tagline}</p>
              </div>
              <ChevronRight size={16} className="opacity-40 flex-shrink-0" />
            </button>
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── STEP 2: Subcategory ───────────────────────────────────────────────────
  if (step === 2 && catDef) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-40 bg-card border-b border-border px-4 h-14 flex items-center gap-3">
          <button onClick={() => setStep(1)} className="p-1 -ml-1 rounded-lg hover:bg-muted">
            <ChevronLeft size={22} />
          </button>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 ${catDef.color}`}>
            <catDef.icon size={16} />
          </div>
          <div>
            <h1 className="font-black text-base leading-tight">{catDef.key}</h1>
            <p className="text-xs text-muted-foreground">Choose the type that fits best</p>
          </div>
        </header>
        <StepDots step={2} />
        <div className="px-4 max-w-lg mx-auto space-y-2.5 pb-6">
          {catDef.subcategories.map((sub) => (
            <button
              key={sub}
              data-testid={`subcategory-pick-${sub.toLowerCase().replace(/[\s/&]+/g, "-")}`}
              onClick={() => { setSubcategory(sub); setStep(3); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-primary hover:bg-muted/40 transition-all active:scale-[0.98] text-left"
            >
              <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${catDef.color.split(" ")[2]}`} />
              <p className="flex-1 font-semibold text-sm">{sub}</p>
              <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── STEP 3: Form ──────────────────────────────────────────────────────────
  if (!catDef) return null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-card border-b border-border px-4 h-14 flex items-center gap-3">
        <button onClick={() => setStep(2)} className="p-1 -ml-1 rounded-lg hover:bg-muted">
          <ChevronLeft size={22} />
        </button>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 flex-shrink-0 ${catDef.color}`}>
          <catDef.icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-base leading-tight truncate">{subcategory}</h1>
          <p className="text-xs text-muted-foreground">{category}</p>
        </div>
      </header>

      <StepDots step={3} />

      <form onSubmit={handleSubmit} className="px-4 pb-6 space-y-5 max-w-lg mx-auto">

        {/* Photo upload */}
        <div className="space-y-2">
          <div>
            <p className="font-bold text-sm">
              {isAccommodation ? "Add photos of the property" : isEatery ? "Add a photo of your restaurant" : "Add a clear photo"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAccommodation ? "Good photos attract more tenants — add up to 3" : "Adverts with photos get 5x more views"}
            </p>
          </div>
          {isAccommodation ? (
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <input ref={accomRefs[i]} type="file" accept="image/*" className="hidden"
                    onChange={(e) => handleAccomImage(i, e)} />
                  <input ref={accomCameraRefs[i]} type="file" accept="image/*" capture="environment"
                    className="hidden" onChange={(e) => handleAccomImage(i, e)} />
                  <ImageSlot
                    label={i === 0 ? "Front view" : i === 1 ? "Inside" : "Extra"}
                    preview={accomPreviews[i]}
                    onPick={() => setShowImageMenu(i)}
                    onRemove={() => removeAccomImage(i)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <>
              <input ref={singleFileRef} type="file" accept="image/*" className="hidden"
                onChange={handleSingleImage} data-testid="input-image" />
              <input ref={singleCameraRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={handleSingleImage} />
              <div data-testid="image-upload-area" onClick={() => setShowImageMenu("single")}
                className="relative w-full aspect-video rounded-2xl bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-border cursor-pointer hover:border-primary transition-colors">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Camera size={36} />
                    <span className="text-sm font-semibold">Tap to add a photo</span>
                    <span className="text-xs opacity-60">Camera or gallery</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Image source action sheet */}
          {showImageMenu !== null && (
            <>
              <div className="fixed inset-0 z-50 bg-black/40"
                onClick={() => setShowImageMenu(null)} />
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl border-t border-border px-4 pt-4"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}>
                <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-5" />
                <p className="font-bold text-sm text-center mb-4">Add a photo</p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImageMenu(null);
                      if (showImageMenu === "single") singleCameraRef.current?.click();
                      else accomCameraRefs[showImageMenu as number].current?.click();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted font-semibold text-sm"
                  >
                    <Camera size={20} className="text-primary" />
                    Take a photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowImageMenu(null);
                      if (showImageMenu === "single") singleFileRef.current?.click();
                      else accomRefs[showImageMenu as number].current?.click();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted font-semibold text-sm"
                  >
                    <ChevronRight size={20} className="text-primary" />
                    Choose from gallery
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImageMenu(null)}
                    className="w-full flex items-center justify-center px-4 py-3.5 rounded-2xl font-semibold text-sm text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <p className="font-bold text-sm">
            {isAccommodation ? "Describe the property"
            : isEatery ? "Restaurant / hotel name"
            : isServices ? "What service do you offer?"
            : "What are you selling?"}
          </p>
          <Input
            id="title" data-testid="input-title" required
            placeholder={
              isAccommodation ? `e.g. ${subcategory} in Kasarani, Nairobi`
              : isEatery ? "e.g. Mama Njeri Hotel, Baba Dogo"
              : isServices ? `e.g. ${subcategory} — describe what you do`
              : `e.g. ${subcategory} — add your details here`
            }
            value={title} onChange={(e) => setTitle(e.target.value)} className="h-12"
          />
        </div>

        {/* Price / Rent */}
        {!isEatery && (
          <div className="space-y-1.5">
            {/* Services: How do you charge? */}
            {isServices && (
              <div className="space-y-1.5">
                <p className="font-bold text-sm">How do you charge?</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { value: "per_trip", label: "Per trip / job" },
                      { value: "per_km",   label: "Per km" },
                      { value: "per_hour", label: "Per hour" },
                      { value: "per_day",  label: "Per day" },
                      { value: "per_session", label: "Per session" },
                      { value: "quote_only", label: "Quote only" },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPricingBasis(value as typeof pricingBasis)}
                      className={`h-10 rounded-xl text-xs font-semibold border-2 transition-all ${
                        pricingBasis === value
                          ? "bg-primary text-white border-primary"
                          : "bg-muted text-muted-foreground border-transparent hover:border-border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Price input — hidden for services when "quote only" */}
            {!(isServices && pricingBasis === "quote_only") && (
              <>
                <p className="font-bold text-sm">
                  {isAccommodation ? "Rent per month (KES)"
                  : isServices ? `Your rate (KES${pricingBasis === "per_km" ? " per km" : pricingBasis === "per_hour" ? " per hour" : pricingBasis === "per_day" ? " per day" : pricingBasis === "per_session" ? " per session" : " per trip"}) — optional`
                  : "Price (KES)"}
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">KES</span>
                  <Input
                    id="price" data-testid="input-price" type="number" min="0"
                    placeholder={
                      isAccommodation ? "e.g. 8000"
                      : isServices ? "e.g. 500 — leave blank if it varies"
                      : "e.g. 500"
                    }
                    value={price} onChange={(e) => setPrice(e.target.value)}
                    required={!isServices} className="h-12 pl-12"
                  />
                </div>
              </>
            )}

            {/* Fixed / Negotiable toggle — not shown for "quote only" */}
            {!(isServices && pricingBasis === "quote_only") && (
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPriceType("fixed")}
                  className={`flex-1 h-10 rounded-xl text-sm font-semibold border-2 transition-all ${
                    priceType === "fixed"
                      ? "bg-primary text-white border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}
                >
                  Fixed price
                </button>
                <button
                  type="button"
                  onClick={() => setPriceType("negotiable")}
                  className={`flex-1 h-10 rounded-xl text-sm font-semibold border-2 transition-all ${
                    priceType === "negotiable"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"
                  }`}
                >
                  Negotiable
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hotel/Eatery menu */}
        {isEatery && (
          <div className="space-y-4 p-4 rounded-2xl border border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20">
            <div>
              <p className="font-black text-base">Your Menu</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add your dishes and prices for each meal period</p>
            </div>
            {MEAL_PERIODS.map(({ key, label }) => (
              <MenuSection key={key} period={key} label={label} items={hotelMenu[key]}
                onChange={(items) => setHotelMenu((prev) => ({ ...prev, [key]: items }))} />
            ))}
          </div>
        )}

        {/* Description */}
        <div className="space-y-1.5">
          <p className="font-bold text-sm">
            {isAccommodation ? "Describe the property"
            : isEatery ? "About your restaurant (optional)"
            : isServices ? "Tell customers more about your service"
            : "More details (optional)"}
          </p>
          <Textarea
            id="description" data-testid="input-description" rows={3} className="resize-none"
            placeholder={
              isAccommodation
                ? "No. of bedrooms, bathroom, water & electricity, nearby matatu stage, any other details..."
                : isEatery
                ? "Opening hours, delivery available, parking, specials..."
                : isServices
                ? "Areas you cover, experience, tools you use, availability, any other details customers should know..."
                : "Condition, size, colour, where to find you, any other details buyers might want to know..."
            }
            value={description} onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* WhatsApp / phone */}
        <div className="space-y-1.5">
          <p className="font-bold text-sm">Your WhatsApp / phone number</p>
          <p className="text-xs text-muted-foreground">
            {isServices ? "Customers will call or WhatsApp you to book your service" : "Buyers will call or WhatsApp you on this number"}
          </p>
          <div className="relative">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="phone" data-testid="input-phone" type="tel" required
              placeholder="e.g. 0712 345 678"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              className="h-12 pl-9"
            />
          </div>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <p className="font-bold text-sm">Where is this located?</p>
          <p className="text-xs text-muted-foreground">Set the location where buyers can find this</p>

          {/* GPS button */}
          <button type="button" data-testid="button-detect-location"
            onClick={detectLocation} disabled={gpsLoading}
            className={`w-full h-14 rounded-xl flex items-center gap-3 px-4 border-2 text-sm font-semibold transition-colors text-left ${
              coords && !showLocationSearch
                ? "bg-secondary/10 text-secondary border-secondary/40"
                : "bg-muted text-muted-foreground border-dashed border-border hover:border-primary hover:text-foreground"
            }`}>
            {gpsLoading
              ? <Loader2 size={20} className="animate-spin flex-shrink-0" />
              : coords && !showLocationSearch
              ? <CheckCircle2 size={20} className="flex-shrink-0" />
              : <MapPin size={20} className="flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              {gpsLoading ? "Detecting your location..."
              : coords && !showLocationSearch
                ? `Location set${wardInfo?.displayName ? ` — ${wardInfo.displayName}` : ""}`
                : "Use my current location"}
              {!coords && !gpsLoading && !showLocationSearch && (
                <p className="text-xs opacity-60 font-normal">Make sure GPS is turned on</p>
              )}
            </div>
          </button>

          {/* Different location toggle */}
          <button
            type="button"
            onClick={() => { setShowLocationSearch(s => !s); setLocationResults([]); setLocationQuery(""); }}
            className="text-xs text-primary font-semibold underline underline-offset-2 px-1"
          >
            {showLocationSearch ? "Cancel — use GPS instead" : "The item is at a different location"}
          </button>

          {/* Location search panel */}
          {showLocationSearch && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="e.g. Kibera, Mombasa CBD, Thika..."
                    value={locationQuery}
                    onChange={e => setLocationQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), runLocationSearch())}
                    className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={runLocationSearch}
                  disabled={searchingLocation || !locationQuery.trim()}
                  className="h-11 px-4 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                >
                  {searchingLocation ? <Loader2 size={16} className="animate-spin" /> : "Search"}
                </button>
              </div>

              {/* Results list */}
              {locationResults.length > 0 && (
                <div className="rounded-xl border border-border bg-background overflow-hidden">
                  {locationResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickSearchedLocation(r)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-muted border-b last:border-b-0 border-border flex items-start gap-2"
                    >
                      <MapPin size={14} className="text-primary flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{r.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ward confirmed */}
          {coords && wardInfo?.wardName && !showLocationSearch && (
            <div className="flex items-center gap-2 px-1">
              <MapPin size={12} className="text-secondary flex-shrink-0" />
              <p className="text-xs text-secondary font-semibold">
                Advert will appear to buyers in {wardInfo.wardName}
              </p>
            </div>
          )}
        </div>

        <Button data-testid="button-submit-product" type="submit"
          className="w-full h-14 font-black text-base rounded-2xl" disabled={submitting}>
          {submitting ? <Loader2 size={20} className="animate-spin" />
          : isAccommodation ? "Post House Advert"
          : isEatery ? "Post Restaurant"
          : isServices ? "Post Service Advert"
          : "Post Advert"}
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-2">
          Your advert will be visible immediately to nearby buyers.
        </p>
      </form>

      <BottomNav />
    </div>
  );
}
