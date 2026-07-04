"use client";

import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  X, Copy, CheckCheck, RefreshCw, LogOut,
  ShieldCheck, ExternalLink, Wallet, Coins,
  AlertCircle, Loader2, ArrowUpRight, User,
} from "lucide-react";
import { useCircleWallet } from "./CircleWalletContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenBalance {
  token: {
    id: string;
    name: string;
    symbol: string;
    decimals: number;
    blockchain: string;
  };
  amount: string;
  updateDate: string;
}

interface CircleWalletProfileProps {
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddress(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function formatAmount(raw: string) {
  // Circle API returns amounts already in human-readable format (e.g. "5" = 5 USDC)
  const n = parseFloat(raw || "0");
  if (isNaN(n)) return "0.00";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

// Deduplicate by symbol — keep entry with largest amount, drop zeros
// (Circle may return the same token via multiple contract addresses)
function aggregateBalances(raw: TokenBalance[]): TokenBalance[] {
  const map = new Map<string, TokenBalance>();
  for (const b of raw) {
    const key = b.token.symbol;
    const existing = map.get(key);
    const newAmt  = parseFloat(b.amount || "0");
    const prevAmt = existing ? parseFloat(existing.amount || "0") : -1;
    if (newAmt > prevAmt) map.set(key, b);
  }
  return Array.from(map.values()).filter(b => parseFloat(b.amount || "0") > 0);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CircleWalletProfile({ onClose }: CircleWalletProfileProps) {
  const { wallet, userToken, email, status, refreshWallet, logout } = useCircleWallet();

  const [balances, setBalances]   = useState<TokenBalance[]>([]);
  const [loadingBal, setLoadingBal] = useState(false);
  const [balError, setBalError]   = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!wallet?.id || !userToken) return;
    setLoadingBal(true);
    setBalError(null);
    try {
      const res  = await fetch(`/api/circle/balance?walletId=${wallet.id}&userToken=${encodeURIComponent(userToken)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load balances");
      setBalances(aggregateBalances(data.tokenBalances || []));
    } catch (err: any) {
      setBalError(err.message);
    } finally {
      setLoadingBal(false);
    }
  }, [wallet?.id, userToken]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshWallet();
    await fetchBalances();
    setRefreshing(false);
  };

  const handleCopy = () => {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  const blockchainLabel = wallet?.blockchain?.replace("ARC-TESTNET", "Arc Testnet") ?? "–";
  const explorerUrl = wallet?.address
    ? `https://testnet.arcscan.app/address/${wallet.address}`
    : null;

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
          zIndex: 9999,
        }}
      />

      {/* Profile panel */}
      <div style={{
        position: "fixed",
        top: "64px",
        right: "20px",
        width: "360px",
        maxHeight: "calc(100vh - 84px)",
        overflowY: "auto",
        background: "#0a0a12",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "20px",
        zIndex: 10000,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "12px",
              background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.25))",
              border: "1px solid rgba(99,102,241,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ShieldCheck size={18} style={{ color: "#818cf8" }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Circle Smart Wallet</div>
              <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                {blockchainLabel} · {status === "ready" ? (
                  <span style={{ color: "#10b981" }}>● Active</span>
                ) : (
                  <span style={{ color: "#f59e0b" }}>● {status}</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.4)", display: "flex", padding: "4px",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Email */}
        {email && (
          <div style={{
            padding: "12px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "0.75rem", fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>
              {email[0].toUpperCase()}
            </div>
            <div style={{ fontSize: "0.82rem", color: "#e2e8f0", wordBreak: "break-all" }}>{email}</div>
          </div>
        )}

        {/* Wallet Address */}
        {wallet?.address && (
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Wallet Address
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px", padding: "10px 12px",
            }}>
              <code style={{ fontSize: "0.78rem", color: "#a5b4fc", fontFamily: "monospace", wordBreak: "break-all", flex: 1 }}>
                {shortAddress(wallet.address)}
              </code>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0, marginLeft: "8px" }}>
                <button
                  onClick={handleCopy}
                  title={copied ? "Copied!" : "Copy address"}
                  style={{
                    background: copied ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)",
                    border: "1px solid " + (copied ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.1)"),
                    borderRadius: "6px", padding: "5px", cursor: "pointer",
                    color: copied ? "#10b981" : "rgba(255,255,255,0.5)",
                    display: "flex", transition: "all 0.2s",
                  }}
                >
                  {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
                </button>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on Explorer"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px", padding: "5px", cursor: "pointer",
                      color: "rgba(255,255,255,0.5)", display: "flex", textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Balances */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px",
          }}>
            <div style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Token Balances
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing || loadingBal}
              title="Refresh"
              style={{
                background: "none", border: "none", cursor: refreshing || loadingBal ? "default" : "pointer",
                color: "rgba(255,255,255,0.35)", display: "flex", padding: "2px",
                opacity: refreshing || loadingBal ? 0.5 : 1,
              }}
            >
              <RefreshCw size={13} style={{ animation: refreshing || loadingBal ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>

          {loadingBal && (
            <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
              <Loader2 size={20} style={{ color: "#818cf8", animation: "spin 1s linear infinite" }} />
            </div>
          )}

          {balError && !loadingBal && (
            <div style={{
              display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px",
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: "10px", fontSize: "0.78rem", color: "#ef4444",
            }}>
              <AlertCircle size={13} />
              {balError}
            </div>
          )}

          {!loadingBal && !balError && balances.length === 0 && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "16px 0", gap: "6px",
            }}>
              <Coins size={20} style={{ color: "rgba(255,255,255,0.2)" }} />
              <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>No tokens yet</span>
            </div>
          )}

          {!loadingBal && balances.map((b, i) => {
            // Map token symbols to their real logo URLs
            const logoMap: Record<string, string> = {
              USDC:   "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
              EURC:   "/eurc.png",
              USDT:   "https://assets.coingecko.com/coins/images/325/small/Tether.png",
              BTC:    "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
              ETH:    "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
              MATIC:  "https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png",
              SOL:    "https://assets.coingecko.com/coins/images/4128/small/solana.png",
              ARB:    "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg",
              BASE:   "https://assets.coingecko.com/coins/images/33613/small/base.png",
            };
            // cirBTC → BTC logo, cir-prefixed tokens → strip prefix
            const symbolKey = b.token.symbol.replace(/^cir/i, "").toUpperCase();
            const logoUrl = logoMap[b.token.symbol.toUpperCase()] || logoMap[symbolKey];
            const fallbackBg = b.token.symbol.toUpperCase() === "USDC"
              ? "linear-gradient(135deg, #2775CA, #1a4f8a)"
              : "linear-gradient(135deg, #6366f1, #8b5cf6)";

            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: "10px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                marginBottom: i < balances.length - 1 ? "6px" : 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    background: fallbackBg,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.65rem", fontWeight: 800, color: "#fff",
                    overflow: "hidden", flexShrink: 0,
                  }}>
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={b.token.symbol}
                        width={32}
                        height={32}
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                          (e.currentTarget.parentElement as HTMLElement).innerText = b.token.symbol.slice(0, 3);
                        }}
                      />
                    ) : (
                      b.token.symbol.slice(0, 3)
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.84rem" }}>{b.token.symbol}</div>
                    <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>{b.token.name}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#e2e8f0" }}>
                    {formatAmount(b.amount)}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>{b.token.blockchain}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{
            fontSize: "0.7rem", color: "#6b7280", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px",
          }}>
            Manage
          </div>

          {wallet?.address && (
            <a
              href="/profile"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "11px 14px", borderRadius: "10px",
                background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)",
                color: "#a5b4fc", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.14)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(99,102,241,0.07)")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <User size={15} />
                Profile
              </div>
              <ArrowUpRight size={14} />
            </a>
          )}

          <button
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "11px 14px", borderRadius: "10px", border: "none",
              background: "rgba(239,68,68,0.06)", cursor: "pointer",
              color: "#f87171", fontSize: "0.85rem", fontWeight: 600,
              width: "100%", textAlign: "left", transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.06)")}
          >
            <LogOut size={15} />
            Log Out
          </button>
        </div>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </>,
    document.body
  );
}
