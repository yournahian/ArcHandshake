"use client";

import React, { useEffect, useState, useCallback } from "react";

interface ExpiryCountdownProps {
  expiredAt: number; // Unix timestamp (seconds)
  jobId?: number;
  onExpired?: () => void;
  showRefundButton?: boolean;
}

function formatDuration(seconds: number): { text: string; urgent: boolean; expired: boolean } {
  if (seconds <= 0) return { text: "Expired", urgent: true, expired: true };
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const urgent = seconds < 86400; // < 24h
  if (d > 0) return { text: `${d}d ${h}h ${m}m`, urgent: false, expired: false };
  if (h > 0) return { text: `${h}h ${m}m ${s}s`, urgent, expired: false };
  return { text: `${m}m ${s}s`, urgent: true, expired: false };
}

export function ExpiryCountdown({ expiredAt, onExpired, showRefundButton }: ExpiryCountdownProps) {
  const [remaining, setRemaining] = useState<number>(0);

  const calc = useCallback(() => {
    return Math.max(0, expiredAt - Math.floor(Date.now() / 1000));
  }, [expiredAt]);

  useEffect(() => {
    setRemaining(calc());
    const interval = setInterval(() => {
      const r = calc();
      setRemaining(r);
      if (r === 0) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [calc, onExpired]);

  if (!expiredAt || expiredAt === 0) return null;

  const { text, urgent, expired } = formatDuration(remaining);

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 10px",
      borderRadius: "8px",
      background: expired
        ? "rgba(239,68,68,0.1)"
        : urgent
        ? "rgba(245,158,11,0.1)"
        : "rgba(16,185,129,0.08)",
      border: `1px solid ${expired ? "rgba(239,68,68,0.25)" : urgent ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.2)"}`,
      fontSize: "0.75rem",
      fontWeight: 700,
      color: expired ? "#ef4444" : urgent ? "#f59e0b" : "#10b981",
      fontFamily: "'Space Grotesk', monospace",
      animation: expired ? "pulse 1.5s infinite" : "none",
    }}>
      <span style={{ fontSize: "0.7rem" }}>
        {expired ? "⏰" : urgent ? "⚡" : "🕐"}
      </span>
      {expired ? "EXPIRED" : `Expires in ${text}`}
    </div>
  );
}
