"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { escrowAbi, DEPLOYED_ESCROW_ADDRESS } from "@/lib/contracts";
import { Plus, Search, ExternalLink, Clock, ShieldCheck, ShieldAlert } from "lucide-react";

const LS_KEY = "arc_known_job_ids";
const LS_TYPE_KEY = "arc_job_types"; // { [jobId]: 'physical' | 'digital' }

// Reads known job IDs from localStorage
function getStoredJobIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

// Adds a job ID to localStorage tracking
export function trackJobId(id: number) {
  if (typeof window === "undefined") return;
  const existing = getStoredJobIds();
  if (!existing.includes(id)) {
    localStorage.setItem(LS_KEY, JSON.stringify([...existing, id].sort((a, b) => b - a)));
  }
}

// Store the job type (physical / digital) for a given job ID
export function setJobType(id: number, type: "physical" | "digital") {
  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(localStorage.getItem(LS_TYPE_KEY) || "{}");
    existing[id] = type;
    localStorage.setItem(LS_TYPE_KEY, JSON.stringify(existing));
  } catch {}
}

// Get the stored type for a job ID (undefined if not known)
export function getJobType(id: number): "physical" | "digital" | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = JSON.parse(localStorage.getItem(LS_TYPE_KEY) || "{}");
    return stored[id];
  } catch {
    return undefined;
  }
}

// Single job row — fetches live data from chain
function JobRow({ jobId }: { jobId: number }) {
  const { data: jobRaw } = useReadContract({
    address: DEPLOYED_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "jobs",
    args: [BigInt(jobId)],
  });

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
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border-color)",
        borderRadius: "12px",
        padding: "18px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        transition: "all 0.2s",
        gap: "16px",
      }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-color)")}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "0.75rem", fontFamily: "Space Grotesk", color: "var(--text-muted)" }}>JOB #{jobId}</span>
            {isPhysical && (
              <span style={{ fontSize: "0.7rem", background: "rgba(168,85,247,0.1)", color: "var(--secondary)", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontFamily: "Space Grotesk", fontSize: "0.95rem" }}>
            {parseFloat(budget) > 0 ? `${budget} USDC` : "—"}
          </span>
          <span className={`badge ${badgeClass(status)}`}>{statuses[status]}</span>
          <ExternalLink size={14} style={{ color: "var(--text-muted)" }} />
        </div>
      </div>
    </Link>
  );
}

export default function EscrowList() {
  const router = useRouter();
  const { address } = useAccount();

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
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px 0", display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Header */}
      <div className="glass-card" style={{ padding: "32px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
      <div className="glass-card" style={{ padding: "28px 40px" }}>
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
      <div className="glass-card" style={{ padding: "32px 40px" }}>
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

    </div>
  );
}
