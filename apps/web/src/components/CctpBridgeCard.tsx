"use client";

/**
 * CctpBridgeCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Full Circle CCTP V2 cross-chain USDC bridge UI.
 * Steps: Approve → Burn → Attest (poll) → Mint → Done
 *
 * Uses wagmi v2 for wallet interactions (already configured in the project).
 * Requires a MetaMask / injected EVM wallet to be connected.
 */

import React, { useState, useCallback, useEffect } from "react";
import { 
  decodeEventLog, keccak256, parseUnits, formatUnits,
  createWalletClient, createPublicClient, custom, http
} from "viem";
import { waitForReceipt } from "@/lib/utils";
import {
  CCTP_CHAINS, CCTP_CHAIN_KEYS,
  USDC_ABI, TOKEN_MESSENGER_ABI, MESSAGE_TRANSMITTER_ABI, MESSAGE_SENT_EVENT_ABI,
  addressToBytes32,
  type CctpChain,
} from "@/lib/cctp";
import {
  GitMerge, ArrowRight, CheckCircle, Loader2, AlertCircle,
  ExternalLink, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type BridgeStep = "idle" | "approving" | "burning" | "attesting" | "minting" | "done" | "error";

const STEP_LABELS: Record<BridgeStep, string> = {
  idle:      "Ready",
  approving: "Approving USDC…",
  burning:   "Burning on source chain…",
  attesting: "Waiting for Circle attestation…",
  minting:   "Minting on destination chain…",
  done:      "Bridge complete!",
  error:     "Error",
};

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { key: BridgeStep; label: string }[] = [
  { key: "approving", label: "Approve" },
  { key: "burning",   label: "Burn" },
  { key: "attesting", label: "Attest" },
  { key: "minting",   label: "Mint" },
];

function StepTracker({ current }: { current: BridgeStep }) {
  const activeIdx = STEPS.findIndex(s => s.key === current);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0", marginBottom: "20px" }}>
      {STEPS.map((s, i) => {
        const done    = activeIdx > i;
        const active  = activeIdx === i;
        const pending = activeIdx < i;
        return (
          <React.Fragment key={s.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flex: 1 }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? "#10b981" : active ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "rgba(255,255,255,0.07)",
                border: `2px solid ${done ? "#10b981" : active ? "#f59e0b" : "rgba(255,255,255,0.12)"}`,
                fontSize: "0.7rem", fontWeight: 700, color: done || active ? "#fff" : "var(--text-muted,#666)",
                transition: "all 0.3s",
              }}>
                {done ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: "0.62rem", color: active ? "#f59e0b" : done ? "#10b981" : "var(--text-muted,#666)", fontWeight: active || done ? 600 : 400 }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: "2px", background: done ? "#10b981" : "rgba(255,255,255,0.07)", transition: "background 0.3s", marginBottom: "18px" }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Chain Selector ───────────────────────────────────────────────────────────

function ChainSelect({ label, value, onChange, exclude }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  exclude?: string;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "0.75rem", color: "var(--text-muted,#888)", fontWeight: 600 }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: "10px 12px", borderRadius: "10px",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          color: "#e2e8f0", fontSize: "0.85rem", cursor: "pointer", outline: "none",
          appearance: "none", WebkitAppearance: "none",
        }}
      >
        {CCTP_CHAIN_KEYS.filter(k => k !== exclude).map(key => (
          <option key={key} value={key}>{CCTP_CHAINS[key].emoji} {CCTP_CHAINS[key].shortName}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  onBack?: () => void;
}

export function CctpBridgeCard({ onBack }: Props) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const [srcKey, setSrcKey]   = useState("eth-sepolia");
  const [dstKey, setDstKey]   = useState("base-sepolia");
  const [amount, setAmount]   = useState("");
  const [step, setStep]       = useState<BridgeStep>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg]   = useState("");
  const [burnTxHash, setBurnTxHash] = useState<`0x${string}` | null>(null);
  const [dstTxHash, setDstTxHash]   = useState<`0x${string}` | null>(null);

  const srcChain = CCTP_CHAINS[srcKey];
  const dstChain = CCTP_CHAINS[dstKey];

  // Connect to MetaMask / injected wallet
  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setErrorMsg("MetaMask or compatible injected wallet not found.");
      return;
    }
    try {
      const provider = (window as any).ethereum;
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const currentChainId = await provider.request({ method: "eth_chainId" });
      setAddress(accounts[0] as `0x${string}`);
      setChainId(parseInt(currentChainId, 16));
      setErrorMsg("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to connect wallet.");
    }
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const provider = (window as any).ethereum;

    const handleAccounts = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0] as `0x${string}`);
      } else {
        setAddress(null);
      }
    };

    const handleChain = (hexId: string) => {
      setChainId(parseInt(hexId, 16));
    };

    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);

    // Initial check
    provider.request({ method: "eth_accounts" }).then((accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0] as `0x${string}`);
      }
    });
    provider.request({ method: "eth_chainId" }).then((hexId: string) => {
      setChainId(parseInt(hexId, 16));
    });

    return () => {
      if (provider.removeListener) {
        provider.removeListener("accountsChanged", handleAccounts);
        provider.removeListener("chainChanged", handleChain);
      }
    };
  }, []);

  // Helper to switch chains
  const switchChain = useCallback(async (targetChainId: number) => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const provider = (window as any).ethereum;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
      setChainId(targetChainId);
    } catch (err: any) {
      if (err.code === 4902) {
        const targetChain = Object.values(CCTP_CHAINS).find(c => c.id === targetChainId);
        if (targetChain) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${targetChainId.toString(16)}`,
                chainName: targetChain.name,
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [targetChain.rpcUrl],
                blockExplorerUrls: [targetChain.explorerUrl],
              },
            ],
          });
          setChainId(targetChainId);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }, []);

  // ── Poll IRIS until attestation is complete ──────────────────────────────
  const pollAttestation = useCallback(async (messageHash: `0x${string}`): Promise<string> => {
    const MAX_POLLS = 60; // 5 min max
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const res = await fetch(`/api/circle/cctp/attestation?messageHash=${messageHash}`);
      const data = await res.json();
      if (data?.status === "complete" && data?.attestation) {
        return data.attestation as string;
      }
    }
    throw new Error("Attestation timed out after 5 minutes.");
  }, []);

  // ── Main bridge flow ─────────────────────────────────────────────────────
  const handleBridge = useCallback(async () => {
    if (!address || !amount || typeof window === "undefined" || !(window as any).ethereum) return;
    setErrorMsg("");
    const amountUnits = parseUnits(amount, 6); // USDC has 6 decimals
    const provider = (window as any).ethereum;

    try {
      // ── Step 1: Approve ────────────────────────────────────────────────
      setStep("approving");
      setStatusMsg("Switching to source chain and approving USDC spend…");

      if (chainId !== srcChain.id) {
        await switchChain(srcChain.id);
      }

      const walletClientSrc = createWalletClient({
        account: address,
        chain: {
          id: srcChain.id,
          name: srcChain.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [srcChain.rpcUrl] } },
        } as any,
        transport: custom(provider),
      });

      const publicClientSrc = createPublicClient({
        chain: {
          id: srcChain.id,
          name: srcChain.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [srcChain.rpcUrl] } },
        } as any,
        transport: http(srcChain.rpcUrl),
      });

      const approveHash = await (walletClientSrc as any).writeContract({
        address: srcChain.usdc,
        abi: USDC_ABI,
        functionName: "approve",
        args: [srcChain.tokenMessenger, amountUnits],
      });

      setStatusMsg("Waiting for approval transaction to be confirmed…");
      const approveReceipt = await waitForReceipt(publicClientSrc, approveHash);
      if (approveReceipt.status !== "success") {
        throw new Error("USDC approval transaction failed.");
      }

      // ── Step 2: Burn ───────────────────────────────────────────────────
      setStep("burning");
      setStatusMsg("Burning USDC on source chain via Circle CCTP…");

      const mintRecipient = addressToBytes32(address) as `0x${string}`;
      const ZERO_BYTES32  = `0x${"0".repeat(64)}` as `0x${string}`;

      const burnHash = await (walletClientSrc as any).writeContract({
        address: srcChain.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurn",
        args: [amountUnits, dstChain.domainId, mintRecipient, srcChain.usdc, ZERO_BYTES32],
      });
      setBurnTxHash(burnHash);

      // Wait for burn tx to be mined
      setStatusMsg("Waiting for burn transaction to be confirmed…");
      const receipt = await waitForReceipt(publicClientSrc, burnHash);

      // Extract MessageSent event to get the message bytes, then compute messageHash
      let messageBytes: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: MESSAGE_SENT_EVENT_ABI,
            eventName: "MessageSent",
            data: log.data,
            topics: log.topics,
          });
          messageBytes = (decoded.args as any).message as `0x${string}`;
          break;
        } catch (_) { /* skip unrelated logs */ }
      }

      if (!messageBytes) throw new Error("Could not find MessageSent event in burn receipt.");

      const msgHash = keccak256(messageBytes) as `0x${string}`;

      // ── Step 3: Attest ─────────────────────────────────────────────────
      setStep("attesting");
      setStatusMsg("Circle is attesting the burn message (~30s). Please wait…");
      const attestation = await pollAttestation(msgHash);

      // ── Step 4: Mint ───────────────────────────────────────────────────
      setStep("minting");
      setStatusMsg("Switching to destination chain to mint USDC…");

      // We must switch to the destination chain before creating the wallet client for the destination
      await switchChain(dstChain.id);

      const walletClientDst = createWalletClient({
        account: address,
        chain: {
          id: dstChain.id,
          name: dstChain.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [dstChain.rpcUrl] } },
        } as any,
        transport: custom(provider),
      });

      const publicClientDst = createPublicClient({
        chain: {
          id: dstChain.id,
          name: dstChain.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [dstChain.rpcUrl] } },
        } as any,
        transport: http(dstChain.rpcUrl),
      });

      setStatusMsg("Minting USDC on destination chain…");
      const mintHash = await (walletClientDst as any).writeContract({
        address: dstChain.messageTransmitter,
        abi: MESSAGE_TRANSMITTER_ABI,
        functionName: "receiveMessage",
        args: [messageBytes, attestation as `0x${string}`],
      });
      setDstTxHash(mintHash);

      await waitForReceipt(publicClientDst, mintHash);

      setStep("done");
      setStatusMsg("");
    } catch (err: any) {
      console.error("[CCTP Bridge]", err);
      setStep("error");
      setErrorMsg(err.shortMessage || err.message || "Bridge failed. Please try again.");
    }
  }, [address, amount, chainId, srcChain, dstChain, pollAttestation, switchChain]);

  const reset = () => {
    setStep("idle"); setStatusMsg(""); setErrorMsg(""); setBurnTxHash(null); setDstTxHash(null); setAmount("");
  };

  const isRunning = ["approving","burning","attesting","minting"].includes(step);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.2))",
            border: "1px solid rgba(245,158,11,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <GitMerge size={18} style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>CCTP Bridge</h3>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted,#888)" }}>Powered by Circle</span>
          </div>
        </div>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-muted,#888)", cursor: "pointer", fontSize: "0.8rem" }}>
            ← Back
          </button>
        )}
      </div>

      {/* Wallet not connected */}
      {!address && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", fontSize: "0.85rem", color: "#f59e0b" }}>
            ⚠️ Please connect a MetaMask wallet to use the CCTP bridge.
          </div>
          <button
            onClick={connectWallet}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "12px 20px", borderRadius: "12px", border: "none",
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer"
            }}
          >
            Connect MetaMask
          </button>
        </div>
      )}

      {/* Step tracker — only show once started */}
      {step !== "idle" && <StepTracker current={step} />}

      {step === "idle" && address && (
        <>
          {/* Chain selectors */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
            <ChainSelect label="FROM" value={srcKey} onChange={setSrcKey} exclude={dstKey} />
            <div style={{ paddingBottom: "28px", color: "var(--text-muted,#888)" }}>
              <ArrowRight size={18} />
            </div>
            <ChainSelect label="TO" value={dstKey} onChange={setDstKey} exclude={srcKey} />
          </div>

          {/* Amount input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted,#888)", fontWeight: 600 }}>USDC AMOUNT</label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0" step="0.01"
                style={{
                  width: "100%", padding: "12px 60px 12px 14px", borderRadius: "10px",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#e2e8f0", fontSize: "1rem", outline: "none", boxSizing: "border-box",
                }}
              />
              <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "0.82rem", color: "var(--text-muted,#888)", fontWeight: 600 }}>
                USDC
              </span>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted,#666)" }}>
              Get testnet USDC at{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{ color: "#818cf8" }}>faucet.circle.com ↗</a>
            </span>
          </div>

          {/* Bridge button */}
          <button
            onClick={handleBridge}
            disabled={!amount || parseFloat(amount) <= 0}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "12px 20px", borderRadius: "12px", border: "none",
              background: !amount || parseFloat(amount) <= 0
                ? "rgba(255,255,255,0.06)"
                : "linear-gradient(135deg, #f59e0b, #ef4444)",
              color: !amount || parseFloat(amount) <= 0 ? "var(--text-muted,#888)" : "#fff",
              fontWeight: 700, fontSize: "0.95rem",
              cursor: !amount || parseFloat(amount) <= 0 ? "not-allowed" : "pointer",
            }}
          >
            <GitMerge size={18} /> Start Bridge
          </button>
        </>
      )}

      {/* Running status */}
      {isRunning && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", padding: "8px 0" }}>
          <Loader2 size={32} style={{ color: "#f59e0b", animation: "spin 1s linear infinite" }} />
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary,#aaa)", textAlign: "center", lineHeight: 1.6 }}>
            {STEP_LABELS[step]}
            {statusMsg && <><br /><span style={{ fontSize: "0.8rem", color: "var(--text-muted,#888)" }}>{statusMsg}</span></>}
          </p>
        </div>
      )}

      {/* Done */}
      {step === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", padding: "8px 0", textAlign: "center" }}>
          <CheckCircle size={40} style={{ color: "#10b981" }} />
          <div>
            <h3 style={{ margin: "0 0 6px", color: "#10b981" }}>Bridge Complete! 🎉</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted,#888)" }}>
              {amount} USDC arrived on <strong>{dstChain.shortName}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            {burnTxHash && (
              <a href={`${srcChain.explorerUrl}/tx/${burnTxHash}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "#818cf8" }}>
                <ExternalLink size={12} /> Burn tx
              </a>
            )}
            {dstTxHash && (
              <a href={`${dstChain.explorerUrl}/tx/${dstTxHash}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "#10b981" }}>
                <ExternalLink size={12} /> Mint tx
              </a>
            )}
          </div>
          <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 20px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted,#888)", cursor: "pointer", fontSize: "0.85rem" }}>
            <RefreshCw size={14} /> Bridge Again
          </button>
        </div>
      )}

      {/* Error */}
      {step === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px" }}>
            <AlertCircle size={16} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{errorMsg}</p>
          </div>
          <button onClick={reset} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px 20px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted,#888)", cursor: "pointer" }}>
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
