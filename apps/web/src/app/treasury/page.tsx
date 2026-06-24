"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import { DEPLOYED_FACTORY_ADDRESS, factoryAbi } from "@/lib/contracts";
import { Landmark, PlusCircle, ArrowRight, RefreshCw, AlertCircle, Settings } from "lucide-react";
import { waitForReceipt } from "@/lib/utils";
import confetti from "canvas-confetti";

const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000") as `0x${string}`;

export default function TreasuryLauncher() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const router = useRouter();
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [existingAddress, setExistingAddress] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [txPendingMessage, setTxPendingMessage] = useState<string | null>(null);

  const handleDeploy = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first!");
      return;
    }
    if (DEPLOYED_FACTORY_ADDRESS === "0x0000000000000000000000000000000000000000") {
      alert("Factory address is not configured yet! Please set NEXT_PUBLIC_FACTORY_ADDRESS in the .env file.");
      return;
    }

    setIsDeploying(true);
    setTxPendingMessage("Requesting deployment transaction…");
    try {
      const hash = await writeContractAsync({
        address: DEPLOYED_FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: "deployTreasury",
        args: [USDC_ADDRESS],
      });

      setTxPendingMessage("Broadcasting & waiting for deployment confirmation…");
      const receipt = await waitForReceipt(publicClient!, hash);

      if (receipt.status !== "success") {
        throw new Error("Factory deployment transaction reverted!");
      }

      // Decode transaction logs to find the TreasuryDeployed event
      let deployedAddress = "";
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: factoryAbi,
            eventName: "TreasuryDeployed",
            data: log.data,
            topics: log.topics,
          });
          deployedAddress = decoded.args.treasuryAddress;
          break;
        } catch (e) {
          // ignore logs from other events or contracts
        }
      }

      if (!deployedAddress) {
        throw new Error("Could not extract deployed treasury address from receipt logs.");
      }

      confetti({ particleCount: 150, spread: 80 });
      setTxPendingMessage("Success! Redirecting to your new treasury dashboard…");
      
      // Short delay to let them see success
      setTimeout(() => {
        router.push(`/treasury/${deployedAddress}`);
      }, 1500);

    } catch (err: any) {
      console.error(err);
      alert(`Deployment failed: ${err.shortMessage || err.message || "Unknown error"}`);
      setIsDeploying(false);
      setTxPendingMessage(null);
    }
  };

  const handleOpenExisting = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAddress = existingAddress.trim();
    if (!cleanAddress.startsWith("0x") || cleanAddress.length !== 42) {
      alert("Please enter a valid EVM contract address starting with 0x!");
      return;
    }
    router.push(`/treasury/${cleanAddress}`);
  };

  if (!mounted) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
        <RefreshCw size={24} className="animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "800px", margin: "30px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: "36px" }}>

      {/* Global Transaction Overlay */}
      {txPendingMessage && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
          zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px",
        }}>
          <RefreshCw size={32} className="animate-spin" style={{ color: "var(--primary)" }} />
          <span style={{ fontWeight: 600, fontSize: "1.15rem" }}>{txPendingMessage}</span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Do not close this page. Confirm the transaction in your wallet…</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="glass-card responsive-card-padding" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
        <div style={{ background: "rgba(255,255,255,0.06)", width: "70px", height: "70px", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Landmark size={36} style={{ color: "var(--primary)" }} />
        </div>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, margin: 0, background: "linear-gradient(135deg, #FFF 0%, #AAA 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Group Treasury Portal
        </h1>
        <p style={{ margin: 0, fontSize: "1rem", color: "var(--text-secondary)", maxWidth: "500px", lineHeight: 1.5 }}>
          Create shared multi-sig pools on the Arc Network. Set custom spending limits, draft expenditure proposals, and vote collectively.
        </p>
      </div>

      <div className="treasury-cards-grid">
        
        {/* Deploy New Treasury Card */}
        <div className="glass-card responsive-card-padding" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <PlusCircle size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Deploy New Pool</h2>
          </div>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.6, flex: 1 }}>
            Deploy a fresh custom `ArcGroupTreasury` instance. Your wallet will automatically be set as the **Admin and First Member**, giving you rights to add others.
          </p>
          <button 
            onClick={handleDeploy} 
            disabled={isDeploying} 
            className="btn-primary" 
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", height: "45px", fontSize: "0.95rem" }}
          >
            {isDeploying ? "Deploying…" : "Deploy New Treasury"}
          </button>
        </div>

        {/* Access Existing Treasury Card */}
        <div className="glass-card responsive-card-padding" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Settings size={20} style={{ color: "var(--primary)" }} />
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Open Existing Pool</h2>
          </div>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Already have a group pool address? Paste the deployed treasury contract address below to open its dashboard.
          </p>
          <form onSubmit={handleOpenExisting} style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "auto" }}>
            <input 
              type="text" 
              placeholder="0x contract address" 
              required 
              value={existingAddress} 
              onChange={e => setExistingAddress(e.target.value)} 
              style={{ height: "45px", padding: "0 16px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "rgba(255,255,255,0.02)", fontSize: "0.88rem" }}
            />
            <button 
              type="submit" 
              className="btn-secondary" 
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", height: "45px", gap: "6px", fontSize: "0.95rem" }}
            >
              Open Dashboard <ArrowRight size={16} />
            </button>
          </form>
        </div>

      </div>

      {/* Info footer */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", fontSize: "0.8rem", color: "var(--text-muted)", padding: "10px" }}>
        <AlertCircle size={14} />
        <span>Make sure your wallet is connected to Arc Testnet (Chain ID 5042002).</span>
      </div>

    </div>
  );
}
