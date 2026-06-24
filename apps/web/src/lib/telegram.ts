"use client";

/**
 * telegram.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight typed wrappers around the Telegram WebApp global that the TG
 * client injects. No external SDK package required — everything works off the
 * window.Telegram.WebApp object that Telegram already provides.
 */

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TgWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  colorScheme: "light" | "dark";
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  initData: string;
  initDataUnsafe: {
    user?: TgUser;
    query_id?: string;
    auth_date?: number;
    hash?: string;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
  HapticFeedback: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  onEvent: (event: string, fn: () => void) => void;
  offEvent: (event: string, fn: () => void) => void;
  sendData: (data: string) => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  platform: string;
  version: string;
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

/** Returns the TG WebApp object, or null if not running inside Telegram. */
export function getTgWebApp(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as any).Telegram?.WebApp ?? null;
}

/** Returns true when running inside the Telegram client. */
export function isTelegram(): boolean {
  const app = getTgWebApp();
  return !!(app?.initData);
}

/** Returns the authenticated Telegram user, or null. */
export function getTgUser(): TgUser | null {
  return getTgWebApp()?.initDataUnsafe?.user ?? null;
}

/** Apply TG theme colors as CSS variables on the document root. */
export function applyTgTheme(): void {
  const app = getTgWebApp();
  if (!app) return;
  const p = app.themeParams;
  const root = document.documentElement;
  if (p.bg_color)            root.style.setProperty("--tg-bg-color",            p.bg_color);
  if (p.text_color)          root.style.setProperty("--tg-text-color",          p.text_color);
  if (p.hint_color)          root.style.setProperty("--tg-hint-color",          p.hint_color);
  if (p.link_color)          root.style.setProperty("--tg-link-color",          p.link_color);
  if (p.button_color)        root.style.setProperty("--tg-button-color",        p.button_color);
  if (p.button_text_color)   root.style.setProperty("--tg-button-text-color",   p.button_text_color);
  if (p.secondary_bg_color)  root.style.setProperty("--tg-secondary-bg-color",  p.secondary_bg_color);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Shows the TG native Back Button for the lifetime of the component and wires
 * it to `router.back()` by default, or a custom callback.
 */
export function useTgBackButton(onBack?: () => void): void {
  const router = useRouter();
  const handler = useCallback(() => {
    if (onBack) onBack();
    else router.back();
  }, [onBack, router]);

  useEffect(() => {
    const app = getTgWebApp();
    if (!app) return;

    app.BackButton.show();
    app.BackButton.onClick(handler);

    return () => {
      app.BackButton.offClick(handler);
      app.BackButton.hide();
    };
  }, [handler]);
}

/**
 * Configures the TG native Main Button (big green button at the bottom of the
 * WebApp) for the lifetime of the component.
 */
export function useTgMainButton(
  label: string,
  onClick: () => void,
  options?: { disabled?: boolean; progress?: boolean }
): void {
  useEffect(() => {
    const app = getTgWebApp();
    if (!app) return;

    const btn = app.MainButton;
    btn.setText(label);
    btn.show();
    if (options?.disabled) btn.disable(); else btn.enable();
    if (options?.progress) btn.showProgress(true); else btn.hideProgress();
    btn.onClick(onClick);

    return () => {
      btn.offClick(onClick);
      btn.hide();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, onClick, options?.disabled, options?.progress]);
}

/**
 * Triggers TG haptic feedback. Silently no-ops outside of Telegram.
 */
export function haptic(type: "impact" | "success" | "error" | "warning" | "selection" = "impact"): void {
  const app = getTgWebApp();
  if (!app) return;
  if (type === "selection") {
    app.HapticFeedback.selectionChanged();
  } else if (type === "impact") {
    app.HapticFeedback.impactOccurred("medium");
  } else {
    app.HapticFeedback.notificationOccurred(type);
  }
}
