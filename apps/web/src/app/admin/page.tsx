"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { decodeEventLog, encodeFunctionData } from "viem";
import { DEPLOYED_ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts";
import { Landmark, ArrowRight, RefreshCw, AlertCircle, ShieldAlert, Gavel, Search, Filter, CheckCircle2, Wallet, TrendingUp, ShieldCheck } from "lucide-react";
import { waitForReceipt } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";
import { useCircleWallet } from "@/components/CircleWalletContext";
import { publicClient } from "@/lib/publicClient";
import { supabase } from "@/lib/supabase";

interface EscrowJob {
  id: number;
  client: string;
  provider: string;
  evaluator: string;
  description: string;
  budget: number;
  expiredAt: number;
  status: number; // 0 = Open, 1 = Funded, 2 = Submitted, 3 = Completed, 4 = Rejected, 5 = Expired, 6 = Disputed
  hook: string;
}

export default function AdminDashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const router = useRouter();
  const { isConnected, address } = useWallet();
  const { executeContractCall } = useCircleWallet();

  const [adminPassword, setAdminPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [jobs, setJobs] = useState<EscrowJob[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"disputes" | "all">("disputes");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isTxPending, setIsTxPending] = useState(false);

  // AI Configuration config states
  const [aiProviderInput, setAiProviderInput] = useState<"gemini" | "openai" | "anthropic" | "custom">("gemini");
  const [modelNameInput, setModelNameInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [customBaseUrlInput, setCustomBaseUrlInput] = useState("");
  const [savedSettings, setSavedSettings] = useState({
    aiProvider: "gemini",
    modelName: "gemini-1.5-flash",
    apiKey: "",
    customBaseUrl: ""
  });
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Status mapping helper
  const getStatusLabel = (status: number) => {
    switch (status) {
      case 0: return { label: "Open", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.08)" };
      case 1: return { label: "Funded", color: "#6366f1", bg: "rgba(99, 102, 241, 0.08)" };
      case 2: return { label: "Submitted", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.08)" };
      case 3: return { label: "Completed", color: "#10b981", bg: "rgba(16, 185, 129, 0.08)" };
      case 4: return { label: "Rejected", color: "#ef4444", bg: "rgba(239, 68, 68, 0.08)" };
      case 5: return { label: "Expired", color: "#6b7280", bg: "rgba(107, 114, 128, 0.08)" };
      case 6: return { label: "Disputed", color: "#ec4899", bg: "rgba(236, 72, 153, 0.08)" };
      default: return { label: "Unknown", color: "#6b7280", bg: "rgba(107, 114, 128, 0.08)" };
    }
  };

  // Unified contract writer using Circle Smart Wallet SDK
  const writeContract = useCallback(async (
    contractAddress: string,
    abi: any,
    functionName: string,
    args: any[],
  ): Promise<`0x${string}`> => {
    const calldata = encodeFunctionData({ abi, functionName: functionName as any, args });
    const txHash = await executeContractCall({
      contractAddress,
      abiFunctionSignature: "execute(bytes)",
      abiParameters: [{ type: "callData", value: calldata }],
      amount: "0",
    });
    return (txHash || "0x") as `0x${string}`;
  }, [executeContractCall]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const nextId = await publicClient.readContract({
        address: DEPLOYED_ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "nextJobId",
      });

      const promises = [];
      for (let i = 0n; i < nextId; i++) {
        promises.push(
          publicClient.readContract({
            address: DEPLOYED_ESCROW_ADDRESS,
            abi: escrowAbi,
            functionName: "getJob",
            args: [i],
          })
        );
      }

      const rawJobs = await Promise.all(promises);
      const mapped: EscrowJob[] = rawJobs.map((j: any) => ({
        id: Number(j[0]),
        client: j[1],
        provider: j[2],
        evaluator: j[3],
        description: j[4],
        budget: Number(j[5]) / 1000000, // 6 decimals for USDC
        expiredAt: Number(j[6]),
        status: Number(j[7]),
        hook: j[8]
      })).reverse(); // Newest first

      setJobs(mapped);

      // Fetch user profiles for Telegram handles lookup
      const addresses = new Set<string>();
      mapped.forEach(j => {
        addresses.add(j.client.toLowerCase());
        addresses.add(j.provider.toLowerCase());
      });
      const addrList = Array.from(addresses);
      
      const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (hasSupabase && addrList.length > 0) {
        try {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("address, username")
            .in("address", addrList);
            
          const map: Record<string, string> = {};
          profiles?.forEach((p: any) => {
            map[p.address.toLowerCase()] = p.username;
          });
          setProfilesMap(map);
        } catch (e) {
          console.warn("Failed to load user profiles from Supabase:", e);
        }
      }
    } catch (err) {
      console.error("Failed to fetch jobs from contract:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setSavedSettings({
          aiProvider: data.aiProvider || "gemini",
          modelName: data.modelName || "",
          apiKey: data.apiKey || "",
          customBaseUrl: data.customBaseUrl || ""
        });
        setAiProviderInput(data.aiProvider || "gemini");
        setModelNameInput(data.modelName || "");
        setCustomBaseUrlInput(data.customBaseUrl || "");
      }
    } catch (err) {
      console.error("Failed to load admin settings:", err);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      fetchJobs();
      fetchSettings();
    }
  }, [mounted, fetchJobs, fetchSettings]);

  // Handle manual dispute resolution via backend proxy (secured by password and executed by the bot arbitrator wallet)
  const handleResolve = async (jobId: number, resolution: number, clientShare?: number) => {
    setIsTxPending(true);
    try {
      const res = await fetch("/api/escrow-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          resolution,
          clientShare,
          adminPassword
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Dispute resolution failed");
      }

      const data = await res.json();

      // Send in-app notifications to both parties after a successful resolution
      const job = jobs.find(j => j.id === jobId);
      if (job) {
        const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (hasSupabase) {
          try {
            const resolutionLabels: Record<number, string> = {
              0: "Refund to Buyer",
              1: "Pay Seller in Full",
              2: "50/50 Split",
              3: `Custom Split (${clientShare} USDC to Buyer)`
            };
            const resolutionEmojis: Record<number, string> = { 0: "↩️", 1: "✅", 2: "⚖️", 3: "🔧" };
            const label = resolutionLabels[resolution] ?? "Resolved";
            const emoji = resolutionEmojis[resolution] ?? "⚖️";

            const buyerMsg = `${emoji} Admin has resolved the dispute for JOB #${jobId}. Decision: "${label}". Tx: ${data.txHash?.slice(0, 10)}...`;
            const sellerMsg = `${emoji} Admin has resolved the dispute for JOB #${jobId}. Decision: "${label}". Tx: ${data.txHash?.slice(0, 10)}...`;

            await supabase.from("notifications").insert([
              {
                recipient_address: job.client.toLowerCase(),
                type: "DISPUTE_RESOLVED",
                escrow_id: jobId,
                message: buyerMsg,
                read: false,
                metadata: { resolution, txHash: data.txHash, clientShare }
              },
              {
                recipient_address: job.provider.toLowerCase(),
                type: "DISPUTE_RESOLVED",
                escrow_id: jobId,
                message: sellerMsg,
                read: false,
                metadata: { resolution, txHash: data.txHash, clientShare }
              }
            ]);
            console.log(`Dispute resolved notifications sent to buyer (${job.client}) and seller (${job.provider}).`);
          } catch (notifyErr) {
            console.error("Failed to send resolution notifications:", notifyErr);
          }
        }
      }

      alert(`Dispute resolved successfully!\nTransaction Hash: ${data.txHash}`);
      fetchJobs();
    } catch (err: any) {
      console.error(err);
      alert(`Dispute resolution failed: ${err.message || err}`);
    } finally {
      setIsTxPending(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingKey(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiProvider: aiProviderInput,
          apiKey: apiKeyInput,
          modelName: modelNameInput,
          customBaseUrl: customBaseUrlInput
        }),
      });
      if (res.ok) {
        alert("AI API settings updated successfully!");
        setApiKeyInput("");
        fetchSettings();
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to update settings");
      }
    } catch (err: any) {
      alert(`Error saving AI settings: ${err.message || err}`);
    } finally {
      setIsSavingKey(false);
    }
  };

  // Stats calculation
  const totalVolume = jobs.reduce((acc, j) => acc + (j.status > 0 ? j.budget : 0), 0);
  const activeCount = jobs.filter(j => j.status === 1 || j.status === 2).length;
  const disputeCount = jobs.filter(j => j.status === 6).length;
  const completedCount = jobs.filter(j => j.status === 3).length;

  // Filter jobs
  const filteredJobs = jobs.filter(job => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      job.description.toLowerCase().includes(query) ||
      job.client.toLowerCase().includes(query) ||
      job.provider.toLowerCase().includes(query) ||
      job.id.toString() === query;

    const matchesStatus = statusFilter === "all" || job.status.toString() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeDisputes = jobs.filter(j => j.status === 6);

  if (!mounted) return null;

  if (!isLoggedIn) {
    return (
      <div style={{
        minHeight: "75vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box"
      }}>
        <div className="glass-card" style={{
          maxWidth: "400px",
          width: "100%",
          padding: "32px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxSizing: "border-box"
        }}>
          <div style={{
            background: "rgba(99, 102, 241, 0.08)",
            color: "var(--primary)",
            width: "60px",
            height: "60px",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto"
          }}>
            <Landmark size={30} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>Admin Authentication</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "6px", lineHeight: 1.4 }}>
              Enter the system admin password to access the arbitrator metrics and resolve disputes.
            </p>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault();
            setIsLoggedIn(true);
          }} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <input
              type="password"
              placeholder="Enter Admin Password..."
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{ textAlign: "center", fontSize: "1rem" }}
              required
            />
            <button type="submit" className="btn-primary" style={{ justifyContent: "center", width: "100%" }}>
              Unlock Dashboard <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 800 }}>Admin Arbitrator Panel</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>
              Secure dispute resolution and system metrics dashboard
            </p>
          </div>
          <button 
            onClick={fetchJobs} 
            disabled={loading}
            className="btn-secondary" 
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            Refresh
          </button>
        </div>

        {/* Permissions warning banner */}
        {jobs.length > 0 && (
          (() => {
            const botAddress = jobs[0]?.evaluator.toLowerCase();
            return (
              <div style={{
                background: "rgba(16, 185, 129, 0.05)",
                border: "1px solid rgba(16, 185, 129, 0.15)",
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "12px"
              }}>
                <ShieldCheck size={20} style={{ color: "var(--success)" }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    System Arbitrator (Backend Bot Wallet) Active
                  </span>
                  <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    The contract's evaluator is configured onchain as: <code style={{ color: "var(--primary)" }}>{botAddress}</code>.
                    All dispute resolution verdicts will be signed and broadcast securely by the arbitrator server using this address.
                  </p>
                </div>
              </div>
            );
          })()
        )}

        {/* AI API Configuration Card */}
        <div className="glass-card" style={{ padding: "20px 24px" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
            🤖 AI Arbitrator API Settings
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "4px 0 16px", lineHeight: 1.4 }}>
            Configure the default AI provider, model, and authentication keys used by the automatic escrow verifier. Active settings: <code style={{ color: "var(--primary)", background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px" }}>{savedSettings.aiProvider} ({savedSettings.modelName})</code>
          </p>
          <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>AI Provider</span>
                <select
                  value={aiProviderInput}
                  onChange={(e) => {
                    const val = e.target.value as "gemini" | "openai" | "anthropic" | "custom";
                    setAiProviderInput(val);
                    if (val === "gemini") setModelNameInput("gemini-1.5-flash");
                    else if (val === "openai") setModelNameInput("gpt-4o-mini");
                    else if (val === "anthropic") setModelNameInput("claude-3-5-sonnet-20240620");
                    else if (val === "custom") setModelNameInput("");
                  }}
                  style={{ padding: "10px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: "0.85rem" }}
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="custom">Custom OpenAI-Compatible (DeepSeek, Groq, local, etc.)</option>
                </select>
              </div>

              {aiProviderInput === "custom" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>API Base URL</span>
                  <input
                    type="text"
                    placeholder="e.g. https://api.deepseek.com/v1"
                    value={customBaseUrlInput}
                    onChange={(e) => setCustomBaseUrlInput(e.target.value)}
                    required
                  />
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>Model Name</span>
                <input
                  type="text"
                  placeholder="e.g. gemini-1.5-flash"
                  value={modelNameInput}
                  onChange={(e) => setModelNameInput(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>API Key</span>
                <input
                  type="password"
                  placeholder={savedSettings.apiKey ? `${savedSettings.apiKey} (Enter new key to change)` : "Enter API Key..."}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                />
              </div>

            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={isSavingKey}
                className="btn-primary"
                style={{ padding: "10px 24px", fontSize: "0.85rem" }}
              >
                {isSavingKey ? "Saving Settings..." : "Save AI Configuration"}
              </button>
            </div>
          </form>
        </div>

        {/* Stats Section */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          
          <div className="glass-card" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ background: "rgba(99,102,241,0.08)", color: "#818cf8", width: "44px", height: "44px", borderRadius: "10px", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center" }}>
              <TrendingUp size={20} />
            </div>
            <div>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Total Locked Volume</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "Space Grotesk", marginTop: "2px" }}>{totalVolume.toLocaleString()} USDC</h2>
            </div>
          </div>

          <div className="glass-card" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ background: "rgba(16,185,129,0.08)", color: "#34d399", width: "44px", height: "44px", borderRadius: "10px", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center" }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Completed Escrows</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "Space Grotesk", marginTop: "2px" }}>{completedCount}</h2>
            </div>
          </div>

          <div className="glass-card" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ background: "rgba(236,72,153,0.08)", color: "#f472b6", width: "44px", height: "44px", borderRadius: "10px", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center" }}>
              <Gavel size={20} />
            </div>
            <div>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Active Disputes</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "Space Grotesk", marginTop: "2px" }}>{disputeCount}</h2>
            </div>
          </div>

          <div className="glass-card" style={{ padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ background: "rgba(59,130,246,0.08)", color: "#60a5fa", width: "44px", height: "44px", borderRadius: "10px", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center" }}>
              <Wallet size={20} />
            </div>
            <div>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Active Escrows</span>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "Space Grotesk", marginTop: "2px" }}>{activeCount}</h2>
            </div>
          </div>

        </div>

        {/* Tab Controls */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-color)", paddingBottom: "2px" }}>
          <button 
            onClick={() => setActiveTab("disputes")}
            style={{
              background: "none", border: "none", padding: "10px 16px", cursor: "pointer",
              fontSize: "0.9rem", fontWeight: activeTab === "disputes" ? 600 : 400,
              color: activeTab === "disputes" ? "var(--primary)" : "var(--text-secondary)",
              borderBottom: activeTab === "disputes" ? "2px solid var(--primary)" : "2px solid transparent",
              display: "flex", alignItems: "center", gap: "6px"
            }}
          >
            🚨 Active Disputes
            {disputeCount > 0 && (
              <span style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontSize: "0.72rem", padding: "2px 6px", borderRadius: "99px", fontWeight: 700 }}>
                {disputeCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab("all")}
            style={{
              background: "none", border: "none", padding: "10px 16px", cursor: "pointer",
              fontSize: "0.9rem", fontWeight: activeTab === "all" ? 600 : 400,
              color: activeTab === "all" ? "var(--primary)" : "var(--text-secondary)",
              borderBottom: activeTab === "all" ? "2px solid var(--primary)" : "2px solid transparent",
            }}
          >
            📋 All Transactions
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            Loading transactions from contract...
          </div>
        ) : activeTab === "disputes" ? (
          
          /* Active Disputes View */
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {activeDisputes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", border: "1px dashed var(--border-color)", borderRadius: "16px", color: "var(--text-secondary)" }}>
                🎉 No active disputes pending arbitration.
              </div>
            ) : (
              activeDisputes.map(job => (
                <div key={job.id} className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                    <div>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "Space Grotesk" }}>ESCROW #{job.id}</span>
                      <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginTop: "4px" }}>{job.description}</h3>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)", fontFamily: "Space Grotesk" }}>{job.budget} USDC</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", fontSize: "0.82rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "16px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "left" }}>
                      <span style={{ color: "var(--text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Buyer / Client</span>
                        {profilesMap[job.client.toLowerCase()] ? (
                          <a 
                            href={`https://t.me/${profilesMap[job.client.toLowerCase()]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--primary)", textDecoration: "underline", fontWeight: 600 }}
                          >
                            💬 @{profilesMap[job.client.toLowerCase()]}
                          </a>
                        ) : (
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>(No Telegram linked)</span>
                        )}
                      </span>
                      <code style={{ fontSize: "0.78rem" }}>{job.client}</code>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "left" }}>
                      <span style={{ color: "var(--text-muted)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>Seller / Provider</span>
                        {profilesMap[job.provider.toLowerCase()] ? (
                          <a 
                            href={`https://t.me/${profilesMap[job.provider.toLowerCase()]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--primary)", textDecoration: "underline", fontWeight: 600 }}
                          >
                            💬 @{profilesMap[job.provider.toLowerCase()]}
                          </a>
                        ) : (
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>(No Telegram linked)</span>
                        )}
                      </span>
                      <code style={{ fontSize: "0.78rem" }}>{job.provider}</code>
                    </div>
                  </div>

                  {/* Dispute Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "rgba(239, 68, 68, 0.02)", border: "1px solid rgba(239, 68, 68, 0.1)", borderRadius: "12px", padding: "20px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>Select Resolution Verdict:</span>
                    <p style={{ margin: "2px 0 12px", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                      Execute this transaction to unlock funds. Payout is processed instantly on the Arc network.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
                      <button 
                        onClick={() => handleResolve(job.id, 0)}
                        disabled={isTxPending}
                        className="btn-secondary" 
                        style={{ color: "var(--danger)", borderColor: "rgba(239, 68, 68, 0.3)", justifyContent: "center" }}
                      >
                        Refund Client (100%)
                      </button>
                      <button 
                        onClick={() => handleResolve(job.id, 1)}
                        disabled={isTxPending}
                        className="btn-secondary" 
                        style={{ color: "var(--success)", borderColor: "rgba(16, 185, 129, 0.3)", justifyContent: "center" }}
                      >
                        Pay Provider (100%)
                      </button>
                      <button 
                        onClick={() => handleResolve(job.id, 2)}
                        disabled={isTxPending}
                        className="btn-primary" 
                        style={{ justifyContent: "center" }}
                      >
                        Split Payout (50/50)
                      </button>
                    </div>

                    {/* Custom Split Form */}
                    <div style={{
                      marginTop: "12px",
                      paddingTop: "16px",
                      borderTop: "1px dashed rgba(255, 255, 255, 0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>Or Execute a Custom Split Verdict:</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: "150px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Client:</span>
                          <input 
                            type="number"
                            placeholder="USDC to refund"
                            step="0.01"
                            max={job.budget}
                            min="0"
                            id={`custom-split-client-${job.id}`}
                            style={{ padding: "8px 12px", fontSize: "0.8rem", flex: 1 }}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value || "0");
                              const providerInput = document.getElementById(`custom-split-provider-${job.id}`) as HTMLInputElement;
                              if (providerInput) {
                                if (isNaN(val) || val < 0) {
                                  providerInput.value = "";
                                } else if (val > job.budget) {
                                  providerInput.value = "0.00";
                                } else {
                                  providerInput.value = (job.budget - val).toFixed(2);
                                }
                              }
                            }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: "150px", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Provider:</span>
                          <input 
                            type="number"
                            placeholder="USDC to pay"
                            step="0.01"
                            max={job.budget}
                            min="0"
                            id={`custom-split-provider-${job.id}`}
                            style={{ padding: "8px 12px", fontSize: "0.8rem", flex: 1, opacity: 0.6 }}
                            disabled
                          />
                        </div>
                        <button
                          onClick={async () => {
                            const clientInput = document.getElementById(`custom-split-client-${job.id}`) as HTMLInputElement;
                            const clientAmt = parseFloat(clientInput?.value || "0");
                            if (isNaN(clientAmt) || clientAmt < 0 || clientAmt > job.budget) {
                              alert(`Please enter a valid refund amount between 0 and ${job.budget} USDC.`);
                              return;
                            }
                            const providerAmt = (job.budget - clientAmt).toFixed(2);
                            if (confirm(`Are you sure you want to resolve this dispute with a custom split:\n- Refund to Client: ${clientAmt.toFixed(2)} USDC\n- Pay to Provider: ${providerAmt} USDC?`)) {
                              await handleResolve(job.id, 3, clientAmt);
                            }
                          }}
                          disabled={isTxPending}
                          className="btn-primary"
                          style={{
                            padding: "8px 16px",
                            fontSize: "0.85rem",
                            whiteSpace: "nowrap",
                            background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
                            borderColor: "#6366F1"
                          }}
                        >
                          Execute Custom Split
                        </button>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        <span>Total Escrow Value: <b>{job.budget} USDC</b></span>
                        <span>Remainder automatically goes to Provider</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          
          /* All Escrows / Transaction View */
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Search & Filter Controls */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "260px", position: "relative" }}>
                <input 
                  type="text" 
                  placeholder="Search by Job ID, Description, or Addresses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: "100%", paddingLeft: "40px" }}
                />
                <Search size={16} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Filter size={16} style={{ color: "var(--text-muted)" }} />
                <select 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ padding: "10px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-color)", color: "var(--text-primary)", fontSize: "0.85rem" }}
                >
                  <option value="all">All Statuses</option>
                  <option value="0">Open</option>
                  <option value="1">Funded</option>
                  <option value="2">Submitted</option>
                  <option value="3">Completed</option>
                  <option value="4">Rejected</option>
                  <option value="5">Expired</option>
                  <option value="6">Disputed</option>
                </select>
              </div>
            </div>

            {/* List */}
            {filteredJobs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", border: "1px dashed var(--border-color)", borderRadius: "16px", color: "var(--text-secondary)" }}>
                No escrows found matching filters.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)" }}>
                      <th style={{ padding: "12px 8px" }}>ID</th>
                      <th style={{ padding: "12px 8px" }}>Description</th>
                      <th style={{ padding: "12px 8px" }}>Status</th>
                      <th style={{ padding: "12px 8px" }}>Budget</th>
                      <th style={{ padding: "12px 8px" }}>Addresses</th>
                      <th style={{ padding: "12px 8px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map(job => {
                      const st = getStatusLabel(job.status);
                      return (
                        <tr key={job.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                          <td style={{ padding: "16px 8px", fontFamily: "Space Grotesk", fontWeight: 600 }}>#{job.id}</td>
                          <td style={{ padding: "16px 8px", fontWeight: 500, maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {job.description}
                          </td>
                          <td style={{ padding: "16px 8px" }}>
                            <span style={{ color: st.color, background: st.bg, padding: "4px 8px", borderRadius: "6px", fontSize: "0.74rem", fontWeight: 600 }}>
                              {st.label}
                            </span>
                          </td>
                          <td style={{ padding: "16px 8px", fontFamily: "Space Grotesk", fontWeight: 700 }}>
                            {job.budget} USDC
                          </td>
                          <td style={{ padding: "16px 8px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.74rem" }}>
                              <span>Client: <code>{job.client.substring(0, 6)}...{job.client.substring(38)}</code></span>
                              <span>Provider: <code>{job.provider.substring(0, 6)}...{job.provider.substring(38)}</code></span>
                            </div>
                          </td>
                          <td style={{ padding: "16px 8px" }}>
                            <button 
                              onClick={() => router.push(`/escrow/${job.id}`)}
                              className="btn-secondary"
                              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", fontSize: "0.78rem" }}
                            >
                              View <ArrowRight size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
