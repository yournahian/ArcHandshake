"use client";

/**
 * CircleWalletCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays the user's Circle-managed wallet details and lets them initiate
 * a USDC withdrawal to any external wallet (e.g. MetaMask).
 */

import React, { useState, useEffect, useCallback } from "react";
import { useCircleWallet } from "./CircleWalletContext";
import {
  Wallet, Copy, CheckCircle, Loader2, ArrowUpRight,
  RefreshCw, ExternalLink, AlertCircle, ShieldCheck,
  ArrowDownLeft,
} from "lucide-react";
import { CctpBridgeCard } from "./CctpBridgeCard";

export function CircleWalletCard() {
  const {
    status, wallet, errorMessage, email, userToken,
    setupWallet, refreshWallet, transferOut,
    loginWithEmail, logout,
  } = useCircleWallet();

  // Automatically trigger PIN setup modal when user login succeeds but no wallet exists yet
  useEffect(() => {
    if (status === "setup_required") {
      setupWallet();
    }
  }, [status, setupWallet]);

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"none" | "withdraw" | "bridge">("none");
  const [destAddress, setDestAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [txError, setTxError] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [usdcTokenId, setUsdcTokenId] = useState<string | undefined>(undefined);
  // Removed transactions state and history logic (moved to Profile page)

  // Fetch USDC token ID from balances to configure token transfer
  useEffect(() => {
    if (!wallet?.id || !userToken) return;
    fetch(`/api/circle/balance?walletId=${wallet.id}&userToken=${encodeURIComponent(userToken)}`)
      .then(res => res.json())
      .then(data => {
        const balances = data.tokenBalances || [];
        const usdc = balances.find((b: any) => b.token?.symbol === "USDC");
        if (usdc) {
          setUsdcTokenId(usdc.token.id);
        }
      })
      .catch(err => console.error("Error fetching USDC token ID:", err));
  }, [wallet?.id, userToken]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }
    setIsSubmittingEmail(true);
    try {
      await loginWithEmail(emailInput);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingEmail(false);
    }
  };

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
      // Circle W3S API expects the amount as a human-readable decimal string (e.g. "5.00"), not base units.
      await transferOut({ destinationAddress: destAddress, amount, tokenId: usdcTokenId });
      setTxStatus("done");
      setAmount("");
      setDestAddress("");
      // Refresh wallet after 2 seconds to let the chain update balance
      setTimeout(refreshWallet, 2000);
      setTimeout(() => { setTxStatus("idle"); setActiveTab("none"); }, 3000);
    } catch (err: any) {
      setTxStatus("error");
      setTxError(err.message || "Transfer failed");
    }
  };

  // ── If still idle (non-Telegram user), show email signup/login form ──────
  if (status === "idle") {
    return (
      <div className="glass-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <Wallet size={20} style={{ color: "#818cf8" }} />
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Circle Smart Wallet</h3>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
          Use a secure, PIN-protected MPC smart wallet. No MetaMask or extensions required.
        </p>
        <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input
            type="email"
            placeholder="Enter your email"
            required
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              fontSize: "0.85rem",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <button
            type="submit"
            disabled={isSubmittingEmail}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "11px 20px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
          >
            {isSubmittingEmail ? (
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              "Sign In / Sign Up"
            )}
          </button>
        </form>
      </div>
    );
  }

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
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Circle Smart Wallet</h3>
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
        <div style={{ display: "flex", gap: "10px" }}>
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
          {email && (
            <button
              onClick={logout}
              style={{
                padding: "10px 18px", borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent", color: "var(--text-muted)",
                fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
              }}
            >
              Cancel / Change Email
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────────
  if (!wallet) return null;

  if (activeTab === "bridge") {
    return <CctpBridgeCard onBack={() => setActiveTab("none")} />;
  }

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
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Circle Smart Wallet</h3>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
              <span style={{
                fontSize: "0.7rem", padding: "2px 8px", borderRadius: "20px",
                background: "rgba(16,185,129,0.1)", color: "#10b981",
                border: "1px solid rgba(16,185,129,0.2)", fontWeight: 600,
              }}>
                {wallet.state === "LIVE" ? "● Active" : wallet.state}
              </span>
              {email && (
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }} title={email}>
                  ({email})
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            onClick={refreshWallet}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          {email && (
            <button
              onClick={logout}
              style={{
                background: "none",
                border: "none",
                color: "rgba(239, 68, 68, 0.7)",
                cursor: "pointer",
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: "4px",
                transition: "color 0.2s",
              }}
              title="Log Out"
            >
              Log Out
            </button>
          )}
        </div>
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
      {/* Tabs: Withdraw | Deposit (Bridge) */}
      {(() => {
        const tab = activeTab as "none" | "withdraw" | "bridge";
        return (
          <div style={{ display: "flex", gap: "8px", marginBottom: tab === "none" ? "0px" : "12px" }}>
            <button
              onClick={() => { setActiveTab(tab === "withdraw" ? "none" : "withdraw"); }}
              style={{
                flex: 1, padding: "8px", borderRadius: "8px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
                background: tab === "withdraw" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                color:      tab === "withdraw" ? "#818cf8" : "var(--text-muted,#888)",
                border: "1px solid rgba(255,255,255,0.05)"
              }}
            >
              Withdraw
            </button>
            <button
              onClick={() => { setActiveTab(tab === "bridge" ? "none" : "bridge"); }}
              style={{
                flex: 1, padding: "8px", borderRadius: "8px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
                background: tab === "bridge" ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                color:      tab === "bridge" ? "#818cf8" : "var(--text-muted,#888)",
                border: "1px solid rgba(255,255,255,0.05)"
              }}
            >
              Deposit (Bridge)
            </button>
          </div>
        );
      })()}

      {activeTab === "withdraw" && (
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
              onClick={() => { setActiveTab("none"); setTxStatus("idle"); }}
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
