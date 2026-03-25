import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PokerTracker from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PokerTracker />
  </StrictMode>
);
