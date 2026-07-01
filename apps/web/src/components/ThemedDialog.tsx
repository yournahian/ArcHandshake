"use client";

import React, { useEffect, useRef, useState } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────────── */

interface ThemedDialogProps {
  isOpen: boolean;
  title: string;
  /** Optional description shown under the title */
  description?: string;
  /** Initial value for the input field */
  defaultValue?: string;
  placeholder?: string;
  /** Confirm label */
  confirmLabel?: string;
  /** Cancel label */
  cancelLabel?: string;
  /** Called with the trimmed input value on confirm, or null on cancel */
  onClose: (value: string | null) => void;
  /** If true, renders an alert (no input, no cancel) */
  alertOnly?: boolean;
  /** Extra validation: return an error string or null */
  validate?: (value: string) => string | null;
}

/* ─── Component ──────────────────────────────────────────────────────────────── */

export function ThemedDialog({
  isOpen,
  title,
  description,
  defaultValue = "",
  placeholder = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onClose,
  alertOnly = false,
  validate,
}: ThemedDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, defaultValue]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(null);
      if (e.key === "Enter" && !alertOnly) handleConfirm();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, value]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (validate) {
      const err = validate(trimmed);
      if (err) { setError(err); return; }
    }
    onClose(trimmed || null);
  };

  return (
    <div
      onClick={() => onClose(null)}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "400px",
          background: "hsl(0 0% 8%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
          padding: "24px",
          animation: "slideUp 0.18s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Title */}
        <h3 style={{
          margin: "0 0 6px",
          fontSize: "1.05rem",
          fontWeight: 700,
          color: "#f1f5f9",
          fontFamily: "var(--font-sans)",
        }}>
          {title}
        </h3>

        {/* Description */}
        {description && (
          <p style={{ margin: "0 0 16px", fontSize: "0.82rem", color: "#6b7280", lineHeight: 1.5 }}>
            {description}
          </p>
        )}

        {/* Input */}
        {!alertOnly && (
          <div style={{ marginBottom: "8px" }}>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => { setValue(e.target.value); setError(null); }}
              placeholder={placeholder}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${error ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: "10px",
                color: "#f1f5f9",
                fontSize: "0.9rem",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
                fontFamily: "var(--font-sans)",
              }}
              onFocus={e => {
                if (!error) e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
              }}
              onBlur={e => {
                if (!error) e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              }}
            />
            {error && (
              <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#ef4444" }}>
                ⚠ {error}
              </p>
            )}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" }}>
          {!alertOnly && (
            <button
              onClick={() => onClose(null)}
              style={{
                padding: "9px 20px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "#9ca3af",
                fontSize: "0.84rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "var(--font-sans)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={handleConfirm}
            style={{
              padding: "9px 24px",
              borderRadius: "10px",
              border: "none",
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              fontSize: "0.84rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "opacity 0.15s",
              fontFamily: "var(--font-sans)",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}

/* ─── Hook ───────────────────────────────────────────────────────────────────── */

/**
 * useThemedPrompt — drop-in replacement for window.prompt()
 *
 * Usage:
 *   const { promptNode, showPrompt } = useThemedPrompt();
 *   // in JSX: {promptNode}
 *   // to show: const value = await showPrompt({ title: "...", defaultValue: "..." });
 */
export function useThemedPrompt() {
  const [config, setConfig] = useState<{
    title: string;
    description?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    alertOnly?: boolean;
    validate?: (v: string) => string | null;
    resolve: (v: string | null) => void;
  } | null>(null);

  const showPrompt = (opts: {
    title: string;
    description?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmLabel?: string;
    alertOnly?: boolean;
    validate?: (v: string) => string | null;
  }): Promise<string | null> => {
    return new Promise(resolve => {
      setConfig({ ...opts, resolve });
    });
  };

  const handleClose = (val: string | null) => {
    config?.resolve(val);
    setConfig(null);
  };

  const promptNode = config ? (
    <ThemedDialog
      isOpen={true}
      title={config.title}
      description={config.description}
      defaultValue={config.defaultValue}
      placeholder={config.placeholder}
      confirmLabel={config.confirmLabel || "Confirm"}
      alertOnly={config.alertOnly}
      validate={config.validate}
      onClose={handleClose}
    />
  ) : null;

  return { promptNode, showPrompt };
}
