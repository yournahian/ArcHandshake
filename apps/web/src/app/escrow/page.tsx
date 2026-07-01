"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatUnits } from "viem";
import { escrowAbi, DEPLOYED_ESCROW_ADDRESS } from "@/lib/contracts";
import { Plus, Search, ExternalLink, Clock, ShieldCheck, ShieldAlert, Activity } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { publicClient } from "@/lib/publicClient";

import { getStoredJobIds, trackJobId } from "@/lib/escrow-tracking";

// Single job row — fetches live data from chain
function JobRow({ jobId }: { jobId: number }) {
  const [jobRaw, setJobRaw] = useState<any>(null);

  useEffect(() => {
    publicClient.readContract({
      address: DEPLOYED_ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "jobs",
      args: [BigInt(jobId)],
    }).then(data => setJobRaw(data)).catch(() => {});
  }, [jobId]);

  const statuses = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired", "Disputed"];
  const badgeClass = (s: number) =>
    s === 3 ? "badge-success" : s === 6 ? "badge-danger" : s === 1 || s === 2 ? "badge-info" : "badge-warning";

  if (!jobRaw) {
    return (
      <div style={{ padding: "16px 20px", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-color)", borderRadius: "12px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Loading job #{jobId}...
      </div>
    );
  }

  const [_, client, provider, , description, budgetRaw, , status, , , qrConfirmationHash] = jobRaw;
  const budget = formatUnits(budgetRaw, 6);
  const isPhysical = qrConfirmationHash && qrConfirmationHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  return (
    <Link href={`/escrow/${jobId}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div 
        className="job-row-card"
        onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--primary)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-color)")}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "0.75rem", fontFamily: "Space Grotesk", color: "var(--text-muted)" }}>JOB #{jobId}</span>
            {isPhysical && (
              <span style={{ fontSize: "0.7rem", background: "rgba(255,255,255,0.08)", color: "var(--text-primary)", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                Meetup
              </span>
            )}
            {status === 3 && <ShieldCheck size={12} style={{ color: "var(--success)" }} />}
            {status === 6 && <ShieldAlert size={12} style={{ color: "var(--danger)" }} />}
          </div>
          <h4 style={{ fontWeight: 600, fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {description || "(no description)"}
          </h4>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
            Buyer: {client.slice(0, 6)}...{client.slice(-4)} &nbsp;|&nbsp; Seller: {provider.slice(0, 6)}...{provider.slice(-4)}
          </p>
        </div>
        <div className="job-row-right">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontWeight: 700, fontFamily: "Space Grotesk", fontSize: "0.95rem" }}>
              {parseFloat(budget) > 0 ? `${budget} USDC` : "—"}
            </span>
            <span className={`badge ${badgeClass(status)}`}>{statuses[status]}</span>
          </div>
          <ExternalLink size={14} style={{ color: "var(--text-muted)" }} />
        </div>
      </div>
    </Link>
  );
}

// Reads nextJobId from contract and renders last N on-chain jobs
function RecentJobs() {
  const [nextJobIdRaw, setNextJobIdRaw] = useState<bigint | null>(null);

  useEffect(() => {
    publicClient.readContract({
      address: DEPLOYED_ESCROW_ADDRESS,
      abi: [
        {
          type: "function",
          name: "nextJobId",
          stateMutability: "view",
          inputs: [],
          outputs: [{ type: "uint256" }],
        },
      ] as const,
      functionName: "nextJobId",
    }).then(data => setNextJobIdRaw(data as bigint)).catch(() => {});
  }, []);

  const totalJobs = nextJobIdRaw ? Number(nextJobIdRaw) - 1 : 0;
  const recentCount = Math.min(totalJobs, 10);
  const recentIds = Array.from({ length: recentCount }, (_, i) => totalJobs - i).filter(id => id > 0);

  if (recentIds.length === 0) return null;

  return (
    <div className="glass-card responsive-card-padding">
      <div className="section-header-flex">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Activity size={18} style={{ color: "var(--primary)" }} />
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Recent On-Chain Activity</h2>
        </div>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {totalJobs} total job{totalJobs !== 1 ? "s" : ""} on-chain
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {recentIds.map((id) => (
          <JobRow key={id} jobId={id} />
        ))}
      </div>
    </div>
  );
}

export default function EscrowList() {
  const router = useRouter();
  const { address } = useWallet();

  const [knownIds, setKnownIds] = useState<number[]>([]);
  const [searchInput, setSearchInput] = useState("");

  // Load stored job IDs on mount
  useEffect(() => {
    setKnownIds(getStoredJobIds());
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(searchInput.trim());
    if (!isNaN(id) && id > 0) {
      trackJobId(id);
      router.push(`/escrow/${id}`);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Header */}
      <div className="glass-card responsive-card-padding">
        <div className="escrow-list-header">
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>OTC Escrows</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>
              Manage your onchain escrow contracts
            </p>
          </div>
          <Link href="/escrow/create" className="btn-primary" style={{ textDecoration: "none" }}>
            <Plus size={16} /> Create Escrow
          </Link>
        </div>
      </div>

      {/* Seller: Find by Job ID */}
      <div className="glass-card responsive-card-padding">
        <div style={{ marginBottom: "16px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Find Escrow by Job ID</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>
            Seller? Got a Job ID from the buyer or Telegram bot? Enter it here to view and set your budget.
          </p>
        </div>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px" }}>
          <input
            type="number"
            placeholder="Enter Job ID (e.g. 42)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            min="1"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn-primary" style={{ whiteSpace: "nowrap" }}>
            <Search size={16} /> Go to Job
          </button>
        </form>
      </div>

      {/* Known Jobs List */}
      <div className="glass-card responsive-card-padding">
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "20px" }}>Your Recent Jobs</h2>

        {knownIds.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
            <Clock size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: "0.9rem" }}>No jobs tracked yet.</p>
            <p style={{ fontSize: "0.85rem", marginTop: "4px" }}>
              Jobs you create or visit will appear here automatically.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {knownIds.map((id) => (
              <JobRow key={id} jobId={id} />
            ))}
          </div>
        )}
      </div>

      {/* Recent on-chain jobs from contract */}
      <RecentJobs />

    </div>
  );
}
