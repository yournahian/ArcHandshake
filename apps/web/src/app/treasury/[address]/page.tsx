"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { treasuryAbi } from "@/lib/contracts";
import {
  Landmark, ArrowUpRight, Vote, Check, X, Coins,
  UserPlus, UserMinus, Settings2, Clock, RefreshCw,
  Wallet, ShieldCheck, AlertCircle, ChevronDown, ChevronUp,
  History,
} from "lucide-react";
import confetti from "canvas-confetti";
import { waitForReceipt } from "@/lib/utils";
import { CircleWalletCard } from "@/components/CircleWalletCard";
import { useTgBackButton } from "@/lib/telegram";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Proposal {
  id: number;
  proposer: string;
  recipient: string;
  amount: bigint;
  description: string;
  votesFor: bigint;
  votesAgainst: bigint;
  votingDeadline: bigint;
  executed: boolean;
  rejected: boolean;
}

// ─── Countdown helper ─────────────────────────────────────────────────────────

function useCountdown(deadlineSeconds: bigint) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const target = Number(deadlineSeconds) * 1000;
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setLabel("Deadline passed"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setLabel(d > 0 ? `${d}d ${h}h ${m}m left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [deadlineSeconds]);
  return label;
}

// ─── Format Time helper ───────────────────────────────────────────────────────

function formatTime(timestamp: number) {
  if (!timestamp) return "Pending";
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── ERC-20 minimal ABI for approve ──────────────────────────────────────────

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// USDC on Arc testnet (same token used by the escrow)
const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000") as `0x${string}`;

// ─── Proposal Row Component ───────────────────────────────────────────────────

function ProposalRow({
  proposal,
  isMember,
  address,
  membersCount,
  onRefresh,
  treasuryAddress,
}: {
  proposal: Proposal;
  isMember: boolean;
  address?: string;
  membersCount: number;
  onRefresh: () => void;
  treasuryAddress: `0x${string}`;
}) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [isVoting, setIsVoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const countdown = useCountdown(proposal.votingDeadline);

  const { data: alreadyVoted, refetch: refetchVoted } = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "hasVoted",
    args: [BigInt(proposal.id), (address || "0x0000000000000000000000000000000000000000") as `0x${string}`],
  });

  const totalVotes   = Number(proposal.votesFor) + Number(proposal.votesAgainst);
  const forPct       = totalVotes > 0 ? Math.round((Number(proposal.votesFor) / totalVotes) * 100) : 0;
  const againstPct   = totalVotes > 0 ? Math.round((Number(proposal.votesAgainst) / totalVotes) * 100) : 0;
  const deadlinePassed = Date.now() > Number(proposal.votingDeadline) * 1000;
  const majorityOfAll  = Number(proposal.votesFor) > membersCount / 2;
  const canExecute     = !proposal.executed && !proposal.rejected && (deadlinePassed || majorityOfAll);
  const amount         = formatUnits(proposal.amount, 6);

  const handleVote = async (support: boolean) => {
    if (!isMember || alreadyVoted) return;
    setIsVoting(true);
    try {
      const hash = await writeContractAsync({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "vote",
        args: [BigInt(proposal.id), support],
      });
      await waitForReceipt(publicClient!, hash);
      await refetchVoted();
      onRefresh();
    } catch (err: any) {
      alert(`Vote failed: ${err.shortMessage || err.message || "Unknown error"}`);
    } finally {
      setIsVoting(false);
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      const hash = await writeContractAsync({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "executeSpend",
        args: [BigInt(proposal.id)],
      });
      await waitForReceipt(publicClient!, hash);
      confetti({ particleCount: 80, spread: 60 });
      onRefresh();
    } catch (err: any) {
      alert(`Execute failed: ${err.shortMessage || err.message || "Unknown error"}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const statusBadge = proposal.executed
    ? <span className="badge badge-success">✅ Executed</span>
    : proposal.rejected
    ? <span className="badge badge-danger">❌ Rejected</span>
    : <span className="badge badge-warning">🗳 Active</span>;

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${proposal.executed ? "rgba(16,185,129,0.2)" : proposal.rejected ? "rgba(239,68,68,0.2)" : "var(--border-color)"}`,
      borderRadius: "12px",
      padding: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "14px",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "Space Grotesk", flexShrink: 0 }}>PROPOSAL #{proposal.id}</span>
            {statusBadge}
          </div>
          <h4 style={{ fontSize: "1rem", fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {proposal.description}
          </h4>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 800, fontFamily: "Space Grotesk", color: "var(--primary)" }}>{amount}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>USDC</div>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)" }}>
        <span>→ {proposal.recipient.slice(0,6)}…{proposal.recipient.slice(-4)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Clock size={11} />{countdown}
        </span>
      </div>

      {/* Vote progress bar */}
      {totalVotes > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${forPct}%`, background: "#10b981", transition: "width 0.4s ease" }} />
            <div style={{ width: `${againstPct}%`, background: "#ef4444", transition: "width 0.4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            <span style={{ color: "#10b981" }}>{Number(proposal.votesFor)} YES ({forPct}%)</span>
            <span>{totalVotes} vote{totalVotes !== 1 ? "s" : ""} cast</span>
            <span style={{ color: "#ef4444" }}>{Number(proposal.votesAgainst)} NO ({againstPct}%)</span>
          </div>
        </div>
      )}

      {/* Action bar */}
      {!proposal.executed && !proposal.rejected && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {isMember && !alreadyVoted && !deadlinePassed && (
            <>
              <button
                onClick={() => handleVote(true)}
                disabled={isVoting}
                className="btn-secondary"
                style={{ flex: 1, justifyContent: "center", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", gap: "6px" }}
              >
                {isVoting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                YES
              </button>
              <button
                onClick={() => handleVote(false)}
                disabled={isVoting}
                className="btn-secondary"
                style={{ flex: 1, justifyContent: "center", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", gap: "6px" }}
              >
                {isVoting ? <RefreshCw size={14} className="animate-spin" /> : <X size={14} />}
                NO
              </button>
            </>
          )}
          {isMember && alreadyVoted && !deadlinePassed && (
            <div style={{ flex: 1, textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)", padding: "10px" }}>
              ✅ You already voted on this proposal
            </div>
          )}
          {canExecute && isMember && (
            <button
              onClick={handleExecute}
              disabled={isExecuting}
              className="btn-primary"
              style={{ flexShrink: 0, justifyContent: "center" }}
            >
              {isExecuting ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {isExecuting ? "Executing…" : "Execute Payout"}
            </button>
          )}
          {deadlinePassed && !canExecute && (
            <div style={{ flex: 1, textAlign: "center", fontSize: "0.8rem", color: "var(--danger)", padding: "10px" }}>
              ⏰ Voting ended — not enough YES votes to execute
            </div>
          )}
        </div>
      )}

      {/* Expand details */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: 0 }}
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded && (
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "4px", padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
          <div>Proposer: <span style={{ color: "var(--text-primary)", fontFamily: "Space Grotesk" }}>{proposal.proposer}</span></div>
          <div>Recipient: <span style={{ color: "var(--text-primary)", fontFamily: "Space Grotesk" }}>{proposal.recipient}</span></div>
          <div>Deadline: <span style={{ color: "var(--text-primary)" }}>{new Date(Number(proposal.votingDeadline) * 1000).toLocaleString()}</span></div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TreasuryDashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const params = useParams();
  const treasuryAddress = params.address as `0x${string}`;

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // ── On-chain reads ────────────────────────────────────────────────────────

  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "getBalance",
  });

  const { data: membersCountRaw, refetch: refetchMembers } = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "getMembersCount",
  });

  const { data: nextProposalIdRaw, refetch: refetchNextId } = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "nextProposalId",
  });

  const { data: adminAddress } = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "admin",
  });

  const { data: isMemberRaw, refetch: refetchMember } = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "isMember",
    args: [(address || "0x0000000000000000000000000000000000000000") as `0x${string}`],
  });

  const { data: spendingPolicyRaw, refetch: refetchPolicy } = useReadContract({
    address: treasuryAddress,
    abi: treasuryAbi,
    functionName: "spendingPolicies",
    args: [(address || "0x0000000000000000000000000000000000000000") as `0x${string}`],
  });

  // ── Derived values ────────────────────────────────────────────────────────

  const balance       = balanceRaw       ? formatUnits(balanceRaw as bigint, 6)          : "0.00";
  const membersCount  = membersCountRaw  ? Number(membersCountRaw as bigint)             : 0;
  const nextId        = nextProposalIdRaw? Number(nextProposalIdRaw as bigint)           : 1;
  const isMember      = isMemberRaw as boolean ?? false;
  const isAdmin       = adminAddress && address && (adminAddress as string).toLowerCase() === address.toLowerCase();
  const dailyLimit    = spendingPolicyRaw ? formatUnits((spendingPolicyRaw as any)[0] as bigint, 6) : "0";
  const spentToday    = spendingPolicyRaw ? formatUnits((spendingPolicyRaw as any)[2] as bigint, 6)  : "0";

  // ── Proposals (fetched on-chain) ──────────────────────────────────────────

  const [proposals, setProposals]       = useState<Proposal[]>([]);
  const [loadingProps, setLoadingProps] = useState(false);

  const fetchProposals = useCallback(async () => {
    if (!publicClient || nextId <= 1) return;
    setLoadingProps(true);
    const all: Proposal[] = [];
    for (let i = 1; i < nextId; i++) {
      try {
        const raw = await publicClient.readContract({
          address: treasuryAddress,
          abi: treasuryAbi,
          functionName: "proposals",
          args: [BigInt(i)],
        }) as readonly [bigint, string, string, bigint, string, bigint, bigint, bigint, boolean, boolean];

        if (raw[0] === BigInt(0)) continue;
        all.push({
          id:              Number(raw[0]),
          proposer:        raw[1],
          recipient:       raw[2],
          amount:          raw[3],
          description:     raw[4],
          votesFor:        raw[5],
          votesAgainst:    raw[6],
          votingDeadline:  raw[7],
          executed:        raw[8],
          rejected:        raw[9],
        });
      } catch { /* skip */ }
    }
    setProposals(all.reverse()); // newest first
    setLoadingProps(false);
  }, [publicClient, nextId, treasuryAddress]);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);

  // ── Deposit History (fetched from on-chain events) ─────────────────────────
  const [depositHistory, setDepositHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [proposalTab, setProposalTab] = useState<"active" | "executed">("active");

  const fetchDepositHistory = useCallback(async () => {
    if (!publicClient || !treasuryAddress) return;
    setLoadingHistory(true);
    try {
      const currentBlock = await publicClient.getBlockNumber();
      console.log("Current Block Number fetched:", currentBlock.toString());
      const fromBlock = currentBlock > 9999n ? currentBlock - 9999n : 0n;
      console.log("Querying events with fromBlock:", fromBlock.toString());

      const logs = await publicClient.getContractEvents({
        address: treasuryAddress,
        abi: treasuryAbi,
        eventName: "Deposited",
        fromBlock,
      });

      // Get unique block numbers to query their timestamps
      const uniqueBlockNumbers = Array.from(new Set(logs.map(log => log.blockNumber).filter((b): b is bigint => b !== null)));
      
      // Fetch all blocks in parallel to be efficient
      const blockTimestamps: Record<string, number> = {};
      await Promise.all(
        uniqueBlockNumbers.map(async (blockNum) => {
          try {
            const block = await publicClient.getBlock({ blockNumber: blockNum });
            blockTimestamps[blockNum.toString()] = Number(block.timestamp);
          } catch (e) {
            console.error(`Error fetching block ${blockNum}:`, e);
          }
        })
      );

      const history = logs.map((log) => {
        const blockNum = log.blockNumber;
        const timestamp = blockNum ? (blockTimestamps[blockNum.toString()] || 0) : 0;
        return {
          member: log.args.member as string,
          amount: log.args.amount ? formatUnits(log.args.amount as bigint, 6) : "0",
          timestamp,
          txHash: log.transactionHash,
        };
      });

      // Sort newest first
      history.sort((a, b) => b.timestamp - a.timestamp);
      setDepositHistory(history);
    } catch (err) {
      console.error("Error fetching deposit history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [publicClient, treasuryAddress]);

  useEffect(() => {
    fetchDepositHistory();
  }, [fetchDepositHistory]);

  const refreshAll = () => {
    refetchBalance();
    refetchMembers();
    refetchNextId();
    refetchMember();
    refetchPolicy();
    fetchProposals();
    fetchDepositHistory();
  };

  // ── Form state ────────────────────────────────────────────────────────────

  const [depositAmount,       setDepositAmount]       = useState("");
  const [directRecipient,     setDirectRecipient]     = useState("");
  const [directAmount,        setDirectAmount]        = useState("");
  const [propRecipient,       setPropRecipient]       = useState("");
  const [propAmount,          setPropAmount]          = useState("");
  const [propDesc,            setPropDesc]            = useState("");

  // Admin form
  const [newMemberAddr,       setNewMemberAddr]       = useState("");
  const [removeMemberAddr,    setRemoveMemberAddr]    = useState("");
  const [limitMemberAddr,     setLimitMemberAddr]     = useState("");
  const [limitAmount,         setLimitAmount]         = useState("");

  const [txPending,           setTxPending]           = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !address) return;
    setTxPending("Approving USDC…");
    try {
      const amountRaw = parseUnits(depositAmount, 6);

      // Step 1: approve
      const approveTx = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [treasuryAddress, amountRaw],
      });
      setTxPending("Confirming approval…");
      await waitForReceipt(publicClient!, approveTx);

      // Step 2: deposit
      setTxPending("Depositing USDC…");
      const depositTx = await writeContractAsync({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "deposit",
        args: [amountRaw],
      });
      await waitForReceipt(publicClient!, depositTx);

      confetti({ particleCount: 60, spread: 45 });
      setDepositAmount("");
      refreshAll();
    } catch (err: any) {
      alert(`Deposit failed: ${err.shortMessage || err.message || "Unknown error"}`);
    } finally {
      setTxPending(null);
    }
  };

  const handleDirectSpend = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxPending("Sending direct spend…");
    try {
      const hash = await writeContractAsync({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "directSpend",
        args: [directRecipient as `0x${string}`, parseUnits(directAmount, 6)],
      });
      await waitForReceipt(publicClient!, hash);
      setDirectAmount("");
      setDirectRecipient("");
      refreshAll();
    } catch (err: any) {
      alert(`Direct spend failed: ${err.shortMessage || err.message || "Unknown error"}`);
    } finally {
      setTxPending(null);
    }
  };

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxPending("Submitting proposal…");
    try {
      const hash = await writeContractAsync({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "proposeSpend",
        args: [propRecipient as `0x${string}`, parseUnits(propAmount, 6), propDesc],
      });
      await waitForReceipt(publicClient!, hash);
      setPropRecipient(""); setPropAmount(""); setPropDesc("");
      await refetchNextId();
      setTimeout(fetchProposals, 1000);
    } catch (err: any) {
      alert(`Proposal failed: ${err.shortMessage || err.message || "Unknown error"}`);
    } finally {
      setTxPending(null);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxPending("Adding member…");
    try {
      const hash = await writeContractAsync({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "addMember",
        args: [newMemberAddr as `0x${string}`],
      });
      await waitForReceipt(publicClient!, hash);
      setNewMemberAddr("");
      refreshAll();
    } catch (err: any) {
      alert(`Add member failed: ${err.shortMessage || err.message || "Unknown error"}`);
    } finally {
      setTxPending(null);
    }
  };

  const handleRemoveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxPending("Removing member…");
    try {
      const hash = await writeContractAsync({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "removeMember",
        args: [removeMemberAddr as `0x${string}`],
      });
      await waitForReceipt(publicClient!, hash);
      setRemoveMemberAddr("");
      refreshAll();
    } catch (err: any) {
      alert(`Remove member failed: ${err.shortMessage || err.message || "Unknown error"}`);
    } finally {
      setTxPending(null);
    }
  };

  const handleSetPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxPending("Setting spending policy…");
    try {
      const hash = await writeContractAsync({
        address: treasuryAddress,
        abi: treasuryAbi,
        functionName: "setSpendingPolicy",
        args: [limitMemberAddr as `0x${string}`, parseUnits(limitAmount, 6)],
      });
      await waitForReceipt(publicClient!, hash);
      setLimitMemberAddr(""); setLimitAmount("");
      refreshAll();
    } catch (err: any) {
      alert(`Set policy failed: ${err.shortMessage || err.message || "Unknown error"}`);
    } finally {
      setTxPending(null);
    }
  };

  // ── Counts ────────────────────────────────────────────────────────────────

  const activeProposalsList   = proposals.filter(p => !p.executed && !p.rejected);
  const executedProposalsList = proposals.filter(p => p.executed);
  const activeProposals       = activeProposalsList.length;
  const executedCount         = executedProposalsList.length;

  // TG Back Button — must be before any conditional returns (Rules of Hooks)
  useTgBackButton();

  if (!mounted) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
        <RefreshCw size={24} className="animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "36px", padding: "20px 0" }}>

      {/* ── Global TX overlay ─────────────────────────────────────────────── */}
      {txPending && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px",
        }}>
          <RefreshCw size={32} className="animate-spin" style={{ color: "var(--primary)" }} />
          <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>{txPending}</span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Please confirm in your wallet and wait…</span>
        </div>
      )}

      {/* ── Header Title & Address ────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, background: "linear-gradient(135deg, #FFF 0%, #AAA 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Group Treasury Pool
        </h1>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "Space Grotesk", wordBreak: "break-all" }}>
          Contract: <b style={{ color: "var(--primary)" }}>{treasuryAddress}</b>
        </p>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>

        {/* Pool balance */}
        <div className="glass-card" style={{ padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Total Pool Balance</span>
            <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: "4px", fontFamily: "Space Grotesk" }}>
              {parseFloat(balance).toFixed(2)} <span style={{ fontSize: "1rem", color: "var(--primary)" }}>USDC</span>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", width: "50px", height: "50px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Landmark size={22} />
          </div>
        </div>

        {/* Members count */}
        <div className="glass-card" style={{ padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Group Members</span>
            <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: "4px", fontFamily: "Space Grotesk" }}>
              {membersCount} <span style={{ fontSize: "1rem", color: "var(--primary)" }}>Members</span>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.08)", width: "50px", height: "50px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Coins size={22} />
          </div>
        </div>

        {/* Active proposals */}
        <div className="glass-card" style={{ padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Active Votes</span>
            <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: "4px", fontFamily: "Space Grotesk" }}>
              {activeProposals} <span style={{ fontSize: "1rem", color: "#f59e0b" }}>Proposals</span>
            </div>
          </div>
          <div style={{ background: "rgba(245,158,11,0.1)", width: "50px", height: "50px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Vote size={22} style={{ color: "#f59e0b" }} />
          </div>
        </div>

        {/* Executed count */}
        <div className="glass-card" style={{ padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Executed Payments</span>
            <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: "4px", fontFamily: "Space Grotesk" }}>
              {executedCount} <span style={{ fontSize: "1rem", color: "#10b981" }}>Done</span>
            </div>
          </div>
          <div style={{ background: "rgba(16,185,129,0.1)", width: "50px", height: "50px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ShieldCheck size={22} style={{ color: "#10b981" }} />
          </div>
        </div>
      </div>

      {/* ── Membership banner ─────────────────────────────────────────────── */}
      {isConnected && (
        <div style={{
          padding: "14px 20px",
          borderRadius: "10px",
          border: `1px solid ${isMember ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
          background: isMember ? "rgba(16,185,129,0.04)" : "rgba(245,158,11,0.04)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontSize: "0.875rem",
        }}>
          {isMember
            ? <><ShieldCheck size={16} style={{ color: "#10b981" }} /><span style={{ color: "#10b981", fontWeight: 600 }}>You are a group member.</span></>
            : <><AlertCircle size={16} style={{ color: "#f59e0b" }} /><span style={{ color: "#f59e0b", fontWeight: 600 }}>Not a member.</span><span style={{ color: "var(--text-secondary)" }}>Ask the group admin to add your wallet address.</span></>
          }
          {isMember && Number(dailyLimit) > 0 && (
            <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
              Daily limit: <b style={{ color: "var(--text-primary)" }}>{dailyLimit} USDC</b> · Used today: <b style={{ color: "var(--text-primary)" }}>{spentToday} USDC</b>
            </span>
          )}
        </div>
      )}

      {/* ── Main two-column grid — responsive ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "24px", alignItems: "start" }}
           className="lg:grid-cols-[1fr_1.3fr] md:grid-cols-2">

        {/* ── Left column: Circle Wallet + Deposit + Direct Spend ──────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Circle Wallet — auto-hidden for non-Telegram users */}
          <CircleWalletCard />

          {/* Deposit */}
          <div className="glass-card" style={{ padding: "28px" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Wallet size={18} /> Deposit to Pool
            </h2>
            {!isMember && isConnected && (
              <div style={{ padding: "10px 12px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "8px", fontSize: "0.8rem", color: "#f59e0b", marginBottom: "14px" }}>
                Only group members can deposit.
              </div>
            )}
            <form onSubmit={handleDeposit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label htmlFor="deposit">Amount (USDC)</label>
                <input id="deposit" type="number" min="0.01" step="0.01" placeholder="e.g. 100" required
                  value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Two transactions: first <b>approve</b> USDC, then <b>deposit</b>. Both will prompt in your wallet.
              </p>
              <button type="submit" className="btn-primary" disabled={!!txPending || !depositAmount || !isMember} style={{ justifyContent: "center" }}>
                Deposit USDC
              </button>
            </form>
          </div>

          {/* Deposit History */}
          <div className="glass-card" style={{ padding: "28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <History size={18} /> Deposit History
              </h2>
              <button
                type="button"
                onClick={fetchDepositHistory}
                disabled={loadingHistory}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.8rem",
                  padding: 0,
                }}
              >
                <RefreshCw size={13} className={loadingHistory ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)" }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                Loading history…
              </div>
            ) : depositHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No deposits found for this pool.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "280px", overflowY: "auto", paddingRight: "4px" }}>
                {depositHistory.map((item, idx) => (
                  <div key={idx} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px",
                    background: "rgba(255,255,255,0.01)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        background: "rgba(16,185,129,0.1)",
                        color: "#10b981",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                      }}>
                        ↓
                      </div>
                      <div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 600, fontFamily: "Space Grotesk" }}>
                          {item.member ? `${item.member.slice(0, 6)}…${item.member.slice(-4)}` : "Unknown"}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          {formatTime(item.timestamp)}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#10b981", fontFamily: "Space Grotesk" }}>
                        +{parseFloat(item.amount).toFixed(2)} USDC
                      </span>
                      {item.txHash && (
                        <a
                          href={`https://testnet.arcscan.app/tx/${item.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "var(--text-muted)",
                            display: "flex",
                            alignItems: "center",
                          }}
                          title="View on ArcScan"
                        >
                          <ArrowUpRight size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Direct Spend */}
          <div className="glass-card" style={{ padding: "28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <ArrowUpRight size={18} /> Direct Spend
              </h2>
              {Number(dailyLimit) > 0 && (
                <span className="badge badge-info">{dailyLimit} USDC / day</span>
              )}
            </div>
            {Number(dailyLimit) === 0 && isMember && (
              <div style={{ padding: "10px 12px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "8px", fontSize: "0.8rem", color: "#f59e0b", marginBottom: "14px" }}>
                No daily spending policy set for your wallet. Ask the admin to set one.
              </div>
            )}
            <form onSubmit={handleDirectSpend} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label htmlFor="directTo">Recipient Address</label>
                <input id="directTo" type="text" placeholder="0x…" required
                  value={directRecipient} onChange={e => setDirectRecipient(e.target.value)} />
              </div>
              <div>
                <label htmlFor="directAmt">Amount (USDC)</label>
                <input id="directAmt" type="number" min="0.01" step="0.01" placeholder="Within your daily limit" required
                  value={directAmount} onChange={e => setDirectAmount(e.target.value)} />
              </div>
              {Number(dailyLimit) > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ height: "4px", borderRadius: "2px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", background: "#10b981", width: `${Math.min((Number(spentToday) / Number(dailyLimit)) * 100, 100)}%`, transition: "width 0.4s" }} />
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {spentToday} / {dailyLimit} USDC spent today
                  </span>
                </div>
              )}
              <button type="submit" className="btn-secondary" disabled={!!txPending || !directAmount || !directRecipient || !isMember}
                style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                Send Instantly <ArrowUpRight size={16} />
              </button>
            </form>
          </div>

        </div>

        {/* ── Right column: Proposals ────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Proposal list */}
          <div className="glass-card" style={{ padding: "28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700 }}>Expenditure Proposals</h2>
              <button onClick={refreshAll} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px", fontSize: "0.8rem" }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            {/* Tab Navigation */}
            <div style={{
              display: "flex",
              gap: "8px",
              background: "rgba(255, 255, 255, 0.02)",
              padding: "4px",
              borderRadius: "8px",
              border: "1px solid var(--border-color)",
              marginBottom: "20px"
            }}>
              <button
                type="button"
                onClick={() => setProposalTab("active")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: proposalTab === "active" ? "rgba(255, 255, 255, 0.08)" : "transparent",
                  color: proposalTab === "active" ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Active ({activeProposalsList.length})
              </button>
              <button
                type="button"
                onClick={() => setProposalTab("executed")}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: proposalTab === "executed" ? "rgba(255, 255, 255, 0.08)" : "transparent",
                  color: proposalTab === "executed" ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                Executed ({executedProposalsList.length})
              </button>
            </div>

            {loadingProps ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)" }}>
                <RefreshCw size={20} className="animate-spin" style={{ margin: "0 auto 10px" }} />
                Loading proposals from chain…
              </div>
            ) : (proposalTab === "active" ? activeProposalsList : executedProposalsList).length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                {proposalTab === "active"
                  ? "No active proposals yet. Be the first to propose a spend!"
                  : "No executed proposals found."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {(proposalTab === "active" ? activeProposalsList : executedProposalsList).map(p => (
                  <ProposalRow
                    key={p.id}
                    proposal={p}
                    isMember={isMember}
                    address={address}
                    membersCount={membersCount}
                    onRefresh={refreshAll}
                    treasuryAddress={treasuryAddress}
                  />
                ))}
              </div>
            )}
          </div>

          {/* New Proposal form — only for members */}
          {isMember && (
            <div className="glass-card" style={{ padding: "28px" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Vote size={18} /> Propose Pool Expenditure
              </h2>
              <form onSubmit={handleCreateProposal} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <div>
                    <label htmlFor="propTo">Recipient Address</label>
                    <input id="propTo" type="text" placeholder="0x…" required value={propRecipient} onChange={e => setPropRecipient(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="propAmt">Amount (USDC)</label>
                    <input id="propAmt" type="number" min="0.01" step="0.01" placeholder="e.g. 200" required value={propAmount} onChange={e => setPropAmount(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label htmlFor="propDesc">Description / Reason</label>
                  <input id="propDesc" type="text" placeholder="e.g. Server hosting for Q3" required value={propDesc} onChange={e => setPropDesc(e.target.value)} />
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Creates a 3-day voting window. The payout executes automatically once a majority of members vote YES.
                </p>
                <button type="submit" className="btn-primary" disabled={!!txPending || !propAmount || !propRecipient || !propDesc} style={{ justifyContent: "center" }}>
                  Submit Proposal
                </button>
              </form>
            </div>
          )}

        </div>
      </div>

      {/* ── Admin Panel ───────────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="glass-card" style={{ padding: "28px", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Settings2 size={18} /> Admin Panel <span className="badge badge-info" style={{ marginLeft: "4px" }}>Admin Only</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>

            {/* Add Member */}
            <div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <UserPlus size={15} style={{ color: "#10b981" }} /> Add Member
              </h3>
              <form onSubmit={handleAddMember} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <input type="text" placeholder="0x wallet address" required value={newMemberAddr} onChange={e => setNewMemberAddr(e.target.value)} />
                <button type="submit" className="btn-secondary" disabled={!!txPending || !newMemberAddr}
                  style={{ border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", justifyContent: "center" }}>
                  <UserPlus size={14} /> Add to Group
                </button>
              </form>
            </div>

            {/* Remove Member */}
            <div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <UserMinus size={15} style={{ color: "#ef4444" }} /> Remove Member
              </h3>
              <form onSubmit={handleRemoveMember} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <input type="text" placeholder="0x wallet address" required value={removeMemberAddr} onChange={e => setRemoveMemberAddr(e.target.value)} />
                <button type="submit" className="btn-secondary" disabled={!!txPending || !removeMemberAddr}
                  style={{ border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444", justifyContent: "center" }}>
                  <UserMinus size={14} /> Remove from Group
                </button>
              </form>
            </div>

            {/* Set Spending Policy */}
            <div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                <Settings2 size={15} style={{ color: "#f59e0b" }} /> Set Daily Spend Limit
              </h3>
              <form onSubmit={handleSetPolicy} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <input type="text" placeholder="0x member address" required value={limitMemberAddr} onChange={e => setLimitMemberAddr(e.target.value)} />
                <input type="number" min="0.01" step="0.01" placeholder="Daily limit in USDC" required value={limitAmount} onChange={e => setLimitAmount(e.target.value)} />
                <button type="submit" className="btn-secondary" disabled={!!txPending || !limitMemberAddr || !limitAmount}
                  style={{ border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", justifyContent: "center" }}>
                  <Settings2 size={14} /> Set Limit
                </button>
              </form>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
