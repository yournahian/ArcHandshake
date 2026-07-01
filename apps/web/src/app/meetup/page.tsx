"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatUnits } from "viem";
import { escrowAbi, DEPLOYED_ESCROW_ADDRESS } from "@/lib/contracts";
import { QrCode, Plus, Search, ExternalLink, RefreshCw, Clock } from "lucide-react";
import { publicClient } from "@/lib/publicClient";
import { getStoredJobIds, trackJobId } from "@/lib/escrow-tracking";

interface PhysicalMeetup {
  id: number;
  client: string;
  provider: string;
  description: string;
  budget: string;
  status: number;
}

// Global constants for status mapping
const STATUSES = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired", "Disputed"];
const getBadgeClass = (s: number) =>
  s === 3 ? "badge-success" : s === 6 ? "badge-danger" : s === 1 || s === 2 ? "badge-info" : "badge-warning";

// Single Meetup row — fetches live data from chain, only displays if it is a physical meetup
function MeetupRow({ jobId }: { jobId: number }) {
  const [jobRaw, setJobRaw] = useState<any>(null);

  useEffect(() => {
    publicClient.readContract({
      address: DEPLOYED_ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "jobs",
      args: [BigInt(jobId)],
    }).then(data => setJobRaw(data)).catch(() => {});
  }, [jobId]);

  if (!jobRaw) {
    return (
      <div style={{ padding: "16px 20px", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-color)", borderRadius: "12px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Loading meetup #{jobId}...
      </div>
    );
  }

  const [, client, provider, , description, budgetRaw, , status, , , qrConfirmationHash] = jobRaw;
  const budget = formatUnits(budgetRaw, 6);
  const isPhysical = qrConfirmationHash && qrConfirmationHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  // Only display if this is a physical meetup
  if (!isPhysical) return null;

  return (
    <Link href={`/meetup/${jobId}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div 
        style={{
          background: "rgba(255,255,255,0.01)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          transition: "border-color 0.2s"
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "var(--primary)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-color)"}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "0.72rem", fontFamily: "Space Grotesk", color: "var(--text-muted)" }}>JOB #{jobId}</span>
            <span className={`badge ${getBadgeClass(status)}`}>{STATUSES[status]}</span>
          </div>
          <h4 style={{ fontWeight: 600, fontSize: "0.95rem", margin: 0 }}>{description || "(no description)"}</h4>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px", margin: 0 }}>
            Buyer: {client.slice(0, 6)}...{client.slice(-4)} | Seller: {provider.slice(0, 6)}...{provider.slice(-4)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontWeight: 700, fontFamily: "Space Grotesk", fontSize: "0.95rem" }}>{budget} USDC</span>
          <ExternalLink size={14} style={{ color: "var(--text-muted)" }} />
        </div>
      </div>
    </Link>
  );
}

export default function MeetupList() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [meetups, setMeetups] = useState<PhysicalMeetup[]>([]);
  const [loading, setLoading] = useState(false);
  const [knownIds, setKnownIds] = useState<number[]>([]);

  // Load stored meetup job IDs on mount
  useEffect(() => {
    setKnownIds(getStoredJobIds());
  }, []);

  const fetchMeetups = useCallback(async () => {
    if (!publicClient) return;
    setLoading(true);
    try {
      const nextJobIdRaw = await publicClient.readContract({
        address: DEPLOYED_ESCROW_ADDRESS,
        abi: [
          { type: "function", name: "nextJobId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }
        ],
        functionName: "nextJobId",
      }) as bigint;

      const totalJobs = Number(nextJobIdRaw) - 1;
      const list: PhysicalMeetup[] = [];
      const scanLimit = Math.max(1, totalJobs - 30); // scan last 30 jobs

      for (let i = totalJobs; i >= scanLimit; i--) {
        try {
          const raw = await publicClient.readContract({
            address: DEPLOYED_ESCROW_ADDRESS,
            abi: escrowAbi,
            functionName: "jobs",
            args: [BigInt(i)],
          }) as readonly [any, string, string, any, string, bigint, any, number, any, any, string];

          const [, client, provider, , description, budgetRaw, , status, , , qrHash] = raw;
          
          // Check if it is a physical meetup (has valid qr confirmation hash)
          const isPhysical = qrHash && qrHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";
          
          if (isPhysical) {
            list.push({
              id: i,
              client,
              provider,
              description,
              budget: formatUnits(budgetRaw, 6),
              status
            });
          }
        } catch (e) {
          // skip
        }
      }
      setMeetups(list);
    } catch (err) {
      console.error("Failed to load meetup contracts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetups();
  }, [fetchMeetups]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(searchInput.trim());
    if (!isNaN(id) && id > 0) {
      trackJobId(id); // track this physical job ID
      router.push(`/meetup/${id}`);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "30px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Header Banner */}
      <div className="glass-card responsive-card-padding">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: 0 }}>Active Physical Meetups</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "6px", margin: 0 }}>
              In-person physical sales secured by encrypted QR codes.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={fetchMeetups} className="btn-secondary" style={{ display: "flex", alignItems: "center", gap: "4px", margin: 0, height: "40px" }} title="Refresh list">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <Link href="/escrow/create?type=physical" className="btn-primary" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "6px", height: "40px" }}>
              <Plus size={16} /> New Meetup
            </Link>
          </div>
        </div>
      </div>

      {/* Seller: Find by Job ID */}
      <div className="glass-card responsive-card-padding" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Find Escrow by Job ID</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px", margin: 0 }}>
            Enter a Job ID from a physical meetup contract to view status, scan/generate QR confirmation code, or release funds.
          </p>
        </div>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "10px" }}>
          <input
            type="number"
            placeholder="Enter Physical Job ID (e.g. 42)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            min="1"
            required
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
              fontSize: "0.85rem",
              outline: "none"
            }}
          />
          <button type="submit" className="btn-primary" style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px", height: "40px" }}>
            <Search size={16} /> Search Meetup
          </button>
        </form>
      </div>

      {/* Your Recent Meetups */}
      <div className="glass-card responsive-card-padding">
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "20px" }}>Your Recent Meetups</h2>

        {knownIds.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
            <Clock size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
            <p style={{ fontSize: "0.9rem" }}>No physical meetups tracked yet.</p>
            <p style={{ fontSize: "0.85rem", marginTop: "4px" }}>
              Meetup jobs you create or search for will appear here automatically.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {knownIds.map((id) => (
              <MeetupRow key={id} jobId={id} />
            ))}
          </div>
        )}
      </div>

      {/* Active Meetups List */}
      <div className="glass-card responsive-card-padding" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Recent Meetups On-Chain</h2>
        
        {loading && meetups.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            Loading active meetup contracts…
          </div>
        ) : meetups.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: "12px" }}>
            No physical meetup contracts found on-chain.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {meetups.map((meetup) => (
              <Link key={meetup.id} href={`/meetup/${meetup.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div 
                  style={{
                    background: "rgba(255,255,255,0.01)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "12px",
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "border-color 0.2s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--primary)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border-color)"}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.72rem", fontFamily: "Space Grotesk", color: "var(--text-muted)" }}>JOB #{meetup.id}</span>
                      <span className={`badge ${getBadgeClass(meetup.status)}`}>{STATUSES[meetup.status]}</span>
                    </div>
                    <h4 style={{ fontWeight: 600, fontSize: "0.95rem", margin: 0 }}>{meetup.description || "(no description)"}</h4>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px", margin: 0 }}>
                      Buyer: {meetup.client.slice(0, 6)}...{meetup.client.slice(-4)} | Seller: {meetup.provider.slice(0, 6)}...{meetup.provider.slice(-4)}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontWeight: 700, fontFamily: "Space Grotesk", fontSize: "0.95rem" }}>{meetup.budget} USDC</span>
                    <ExternalLink size={14} style={{ color: "var(--text-muted)" }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>

    </div>
  );
}
