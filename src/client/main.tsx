import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Toaster } from "./components/ui/sonner";
import { TopProgressBar } from "./components/layout/TopProgressBar";
import { ConnectionBanner } from "./components/layout/ConnectionBanner";
import { installNetInstrumentation } from "./lib/net";
import "./index.css";

// Wrap global fetch before anything renders, so every data hook is tracked
// (progress bar) and resilient to a momentarily-down API server (retries).
installNetInstrumentation();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <TopProgressBar />
    <ConnectionBanner />
    <App />
    <Toaster />
  </StrictMode>
);
