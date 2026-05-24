# BizMtaani

A location-based marketplace for Kenya where small business sellers post nearby products and buyers discover them on a live map with real-time chat.

## Run & Operate

- `pnpm --filter @workspace/bizmtaani run dev` — run the frontend (uses PORT env var)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, currently unused)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, wouter routing, shadcn/ui
- Backend: Firebase (Auth, Firestore, Storage) — no Express backend used
- Maps: Leaflet + react-leaflet + OpenStreetMap tiles
- Location: Browser GPS API (navigator.geolocation)
- Fonts: Outfit (Google Fonts)

## Where things live

- `artifacts/bizmtaani/src/lib/firebase.ts` — Firebase init (auth, db, storage)
- `artifacts/bizmtaani/src/contexts/AuthContext.tsx` — Auth state via onAuthStateChanged
- `artifacts/bizmtaani/src/pages/` — All app pages
- `artifacts/bizmtaani/src/components/BottomNav.tsx` — Mobile bottom navigation
- `artifacts/bizmtaani/src/index.css` — Kenyan market colour palette (orange + green)

## Pages

| Route | Page | Auth required |
|-------|------|---------------|
| `/` | MapView — Leaflet map, product pins, category filter | No |
| `/login` | Login — email/password + Google | No |
| `/register` | Register — create account | No |
| `/post` | PostProduct — post with GPS + photo upload | Yes |
| `/product/:id` | ProductDetail — detail + chat CTA | No |
| `/my-listings` | MyListings — seller's products with delete | Yes |
| `/chats` | ChatList — all conversations | Yes |
| `/chat/:chatId` | ChatThread — real-time Firestore messages | Yes |
| `/profile` | Profile — avatar, links, sign out | No |

## Firebase project

- Project ID: `bizmtaani-f50d5`
- Auth: Email/Password + Google enabled (must be enabled in Firebase Console)
- Firestore: `products`, `chats`, `messages` (subcollection) collections
- Storage: product images at `products/{userId}/{timestamp}_{filename}`

## Firestore Security Rules (recommended)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /products/{id} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth.uid == resource.data.sellerId;
    }
    match /chats/{id} {
      allow read, write: if request.auth.uid in resource.data.participants;
      allow create: if request.auth != null;
      match /messages/{msgId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

## Architecture decisions

- Pure Firebase client-side app — no Express backend needed for MVP. Firestore handles real-time sync natively.
- Browser GPS defaults to Nairobi (lat: -1.286389, lng: 36.817223) if denied.
- Leaflet default marker icon bug in Vite fixed by deleting `_getIconUrl` and calling `mergeOptions`.
- Chat deduplication: checks for existing chat doc before creating a new one (same productId + buyerId).
- Firebase Storage URLs stored directly in Firestore — no backend proxy needed.

## User preferences

- Keep code simple and modular
- Build one feature at a time
- Mobile-first UI (390px base)
- No emojis in UI

## Gotchas

- Firebase Auth providers (Email/Password, Google) must be enabled in Firebase Console → Authentication → Sign-in methods.
- Firestore indexes may need to be created for compound queries (Firestore will show a link in browser console if needed).
- `VITE_FIREBASE_*` env vars must be set — they are already configured as shared env vars.
- Leaflet tiles need internet access — they load from openstreetmap.org CDN.
