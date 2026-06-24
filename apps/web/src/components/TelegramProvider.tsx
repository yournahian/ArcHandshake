"use client";

/**
 * TelegramProvider
 * ─────────────────────────────────────────────────────────────────────────────
 * Bootstraps the Telegram Mini App WebApp on mount — but ONLY when actually
 * running inside the Telegram client (i.e. initData is non-empty).
 *
 * On a regular desktop/mobile browser the SDK script may be loaded but
 * initData will be empty, so we bail out early and leave the normal layout
 * completely untouched.
 */

import React, { useEffect } from "react";
import { getTgWebApp, isTelegram, applyTgTheme } from "@/lib/telegram";

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // ⚠️  Only activate TG-specific behaviour when actually inside Telegram.
    // The SDK script is loaded on every page, so getTgWebApp() returns a
    // non-null object even in a regular browser — but initData will be empty.
    if (!isTelegram()) return;

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
    // This is intentionally NOT set on desktop browsers
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
