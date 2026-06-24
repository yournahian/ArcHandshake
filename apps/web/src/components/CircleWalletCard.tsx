"use client";

/**
 * CircleWalletCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays the user's Circle-managed wallet details and lets them initiate
 * a USDC withdrawal to any external wallet (e.g. MetaMask).
 */

import React, { useState } from "react";
import { useCircleWallet } from "./CircleWalletContext";
import {
  Wallet, Copy, CheckCircle, Loader2, ArrowUpRight,
  RefreshCw, ExternalLink, AlertCircle, ShieldCheck,
} from "lucide-react";

export function CircleWalletCard() {
  const {
    status, wallet, errorMessage,
    setupWallet, refreshWallet, transferOut,
  } = useCircleWallet();

  const [copied, setCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [destAddress, setDestAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [txError, setTxError] = useState("");

  const copyAddress = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWithdraw = async () => {
    if (!destAddress || !amount) return;
    setTxStatus("pending");
    setTxError("");
    try {
      const amountBase = (parseFloat(amount) * 1_000_000).toFixed(0); // USDC 6 decimals
      await transferOut({ destinationAddress: destAddress, amount: amountBase });
      setTxStatus("done");
      setAmount("");
      setDestAddress("");
      setTimeout(() => { setTxStatus("idle"); setShowWithdraw(false); }, 3000);
    } catch (err: any) {
      setTxStatus("error");
      setTxError(err.message || "Transfer failed");
    }
  };

  // ── If still idle (non-Telegram user), show nothing ──────────────────────
  if (status === "idle") return null;

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="glass-card" style={{ padding: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
        <Loader2 size={20} style={{ color: "#818cf8", animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Initializing your wallet…</span>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  // ── Setup required ───────────────────────────────────────────────────────
  if (status === "setup_required" || (status === "error" && !wallet)) {
    return (
      <div className="glass-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <Wallet size={20} style={{ color: "#818cf8" }} />
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Circle Wallet</h3>
        </div>
        {errorMessage && (
          <div style={{
            display: "flex", gap: "8px", alignItems: "flex-start",
            padding: "10px", background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px",
            marginBottom: "14px",
          }}>
            <AlertCircle size={15} style={{ color: "#ef4444", flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#ef4444" }}>{errorMessage}</p>
          </div>
        )}
        <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
          Create your secure wallet to participate in treasury without needing MetaMask.
        </p>
        <button
          onClick={setupWallet}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 18px", borderRadius: "10px", border: "none",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
          }}
        >
          Create Wallet
        </button>
      </div>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────────
  if (!wallet) return null;

  const shortAddress = `${wallet.address.slice(0, 8)}…${wallet.address.slice(-6)}`;

  return (
    <div className="glass-card" style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))",
            border: "1px solid rgba(99,102,241,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ShieldCheck size={18} style={{ color: "#818cf8" }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Circle Wallet</h3>
            <span style={{
              fontSize: "0.7rem", padding: "2px 8px", borderRadius: "20px",
              background: "rgba(16,185,129,0.1)", color: "#10b981",
              border: "1px solid rgba(16,185,129,0.2)", fontWeight: 600,
            }}>
              {wallet.state === "LIVE" ? "● Active" : wallet.state}
            </span>
          </div>
        </div>
        <button
          onClick={refreshWallet}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Address */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "10px",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "16px",
      }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}>Wallet Address</div>
          <code style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>{shortAddress}</code>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={copyAddress}
            title="Copy address"
            style={{ background: "none", border: "none", color: copied ? "#10b981" : "var(--text-muted)", cursor: "pointer" }}
          >
            {copied ? <CheckCircle size={15} /> : <Copy size={15} />}
          </button>
          <a
            href={`https://testnet.arcscan.app/address/${wallet.address}`}
            target="_blank"
            rel="noreferrer"
            title="View on explorer"
            style={{ color: "var(--text-muted)", display: "flex" }}
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {/* Network */}
      <div style={{
        fontSize: "0.78rem", color: "var(--text-muted)",
        marginBottom: "16px",
        display: "flex", gap: "6px", alignItems: "center",
      }}>
        <span style={{
          width: "8px", height: "8px", borderRadius: "50%",
          background: "#10b981", display: "inline-block",
        }} />
        Arc Testnet · MPC secured
      </div>

      {/* Withdraw Section */}
      {!showWithdraw ? (
        <button
          onClick={() => setShowWithdraw(true)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px", borderRadius: "10px",
            border: "1px solid rgba(99,102,241,0.3)",
            background: "rgba(99,102,241,0.08)",
            color: "#818cf8", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
            width: "100%", justifyContent: "center",
          }}
        >
          <ArrowUpRight size={16} /> Withdraw to External Wallet
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 600 }}>
            Withdraw USDC to MetaMask or any address:
          </p>
          <input
            type="text"
            placeholder="Destination address (0x…)"
            value={destAddress}
            onChange={e => setDestAddress(e.target.value)}
            style={{
              padding: "10px 14px", borderRadius: "8px",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0", fontSize: "0.85rem", outline: "none", width: "100%", boxSizing: "border-box",
            }}
          />
          <input
            type="number"
            placeholder="Amount (USDC)"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            min="0"
            step="0.01"
            style={{
              padding: "10px 14px", borderRadius: "8px",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0", fontSize: "0.85rem", outline: "none", width: "100%", boxSizing: "border-box",
            }}
          />

          {txStatus === "error" && (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#ef4444" }}>{txError}</p>
          )}
          {txStatus === "done" && (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#10b981" }}>✓ Transfer submitted!</p>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleWithdraw}
              disabled={txStatus === "pending" || !destAddress || !amount}
              style={{
                flex: 1, padding: "10px", borderRadius: "8px", border: "none",
                background: txStatus === "pending" ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff", fontWeight: 600, fontSize: "0.85rem",
                cursor: txStatus === "pending" ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              }}
            >
              {txStatus === "pending" ? (
                <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Confirming…</>
              ) : "Send"}
            </button>
            <button
              onClick={() => { setShowWithdraw(false); setTxStatus("idle"); }}
              style={{
                padding: "10px 16px", borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent", color: "var(--text-muted)",
                cursor: "pointer", fontSize: "0.85rem",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
