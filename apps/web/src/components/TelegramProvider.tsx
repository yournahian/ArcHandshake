"use client";

/**
 * TelegramProvider
 * ─────────────────────────────────────────────────────────────────────────────
 * Bootstraps the Telegram Mini App WebApp on mount:
 *  • Calls WebApp.ready() and WebApp.expand() to fill the entire viewport
 *  • Sets background/header color to match our dark theme
 *  • Applies TG theme params as CSS variables
 *  • Adds a `data-tg` attribute on <body> so CSS can scope TG-specific styles
 *  • Handles viewport resize events from Telegram
 */

import React, { useEffect } from "react";
import { getTgWebApp, applyTgTheme } from "@/lib/telegram";

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const app = getTgWebApp();
    if (!app) return;

    // Signal that our app is ready and request full-screen expansion
    app.ready();
    app.expand();

    // Match our dark theme
    try {
      app.setBackgroundColor("#000000");
      app.setHeaderColor("#000000");
    } catch {
      // Older TG versions may not support these; silently ignore
    }

    // Apply TG theme params as CSS custom properties
    applyTgTheme();

    // Mark the body so CSS can scope TG-specific rules
    document.body.setAttribute("data-tg", "true");

    // Handle viewport resize (e.g. keyboard opening in Telegram)
    const handleViewportChange = () => {
      const vh = app.viewportStableHeight || app.viewportHeight;
      document.documentElement.style.setProperty("--tg-viewport-height", `${vh}px`);
    };

    app.onEvent("viewportChanged", handleViewportChange);
    handleViewportChange(); // Set initial value

    return () => {
      app.offEvent("viewportChanged", handleViewportChange);
      document.body.removeAttribute("data-tg");
    };
  }, []);

  return <>{children}</>;
}
