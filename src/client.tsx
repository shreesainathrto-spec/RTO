/**
 * Client Entry Point for SPA
 *
 * This is the main entry point for the browser-side application.
 * - Mounts React + TanStack Router to the DOM
 * - Handles all routing client-side
 * - Communicates with Firebase for data
 * - No server-side rendering (pure SPA)
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "@/router";
import "@/styles.css";

// Initialize force-caps body class early (before React mounts) to prevent casing flash
if (typeof window !== "undefined") {
  const forceCaps = localStorage.getItem("force_caps") === "true";
  if (forceCaps) {
    document.body.classList.add("force-caps-on");
  }
}

// Global date formatting override to enforce DD/MM/YYYY format across the whole site
if (typeof Date !== "undefined") {
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function(locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
    if (options) {
      return originalToLocaleDateString.call(this, locale, options);
    }
    const day = String(this.getDate()).padStart(2, "0");
    const month = String(this.getMonth() + 1).padStart(2, "0");
    const year = this.getFullYear();
    return `${day}/${month}/${year}`;
  };
}

// Input type overrides removed to prevent conflicts with the new React-based DateInput component.

// Get the router instance
const router = getRouter();

// Disable wheel scrolling value changes on input[type=number]
if (typeof window !== "undefined") {
  window.addEventListener(
    "wheel",
    () => {
      if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === "number") {
        document.activeElement.blur();
      }
    },
    { passive: true }
  );
}

// Render the app to the DOM
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found. Make sure index.html has <div id='root'></div>");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
