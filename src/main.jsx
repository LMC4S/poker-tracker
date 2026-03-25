import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { inject } from "@vercel/analytics";
import PokerTracker from "./App.jsx";

inject();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PokerTracker />
  </StrictMode>
);
