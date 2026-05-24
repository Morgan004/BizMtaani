import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { preloadWards } from "./lib/location";

// Start loading the Kenya wards GeoJSON immediately so it is ready
// by the time the user's GPS fix arrives — no UI thread blocking.
preloadWards();

createRoot(document.getElementById("root")!).render(<App />);
