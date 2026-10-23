// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { unlockAudioOnFirstGesture } from "./lib/sounds";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element found");

unlockAudioOnFirstGesture();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
