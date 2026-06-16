"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { treasuryAbi, DEPLOYED_TREASURY_ADDRESS } from "@/lib/contracts";
import { ARC_MIN_GAS_PRICE } from "@/lib/wagmi";
import { Landmark, ArrowUpRight, Vote, Check, X, ShieldAlert, Coins } from "lucide-react";
import confetti from "canvas-confetti";

export default function TreasuryDashboard() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  // Local Form States
  const [depositAmount, setDepositAmount] = useState("");
  const [directSpendAmount, setDirectSpendAmount] = useState("");
  const [directSpendRecipient, setDirectSpendRecipient] = useState("");
  
  const [proposalAmount, setProposalAmount] = useState("");
  const [proposalRecipient, setProposalRecipient] = useState("");
  const [proposalDescription, setProposalDescription] = useState("");

  const [isTxPending, setIsTxPending] = useState(false);

  // Read Pool Balance
  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: DEPLOYED_TREASURY_ADDRESS,
    abi: treasuryAbi,
    functionName: "getBalance",
  });

  // Read Members Count
  const { data: membersCountRaw } = useReadContract({
    address: DEPLOYED_TREASURY_ADDRESS,
    abi: treasuryAbi,
    functionName: "getMembersCount",
  });

  const balance = balanceRaw ? formatUnits(balanceRaw as bigint, 6) : "0";
  const membersCount = membersCountRaw ? (membersCountRaw as bigint).toString() : "1";

  // Mock proposal lists for visual tracking (in production, read from contract dynamically)
  const [proposals, setProposals] = useState([
    {
      id: 1,
      proposer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "50",
      description: "Approve payment for logo designer @designer",
      votesFor: 2,
      votesAgainst: 0,
      executed: false,
      deadline: "24h remaining"
    }
  ]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTxPending(true);
    try {
      const amountRaw = parseUnits(depositAmount, 6);
      
      // Standard ERC20 Approve then deposit
      // (Simplified: we directly trigger write contract to simulate success)
      await writeContractAsync({
        address: DEPLOYED_TREASURY_ADDRESS,
        abi: [
          {
            type: "function",
            name: "deposit",
            stateMutability: "nonpayable",
            inputs: [{ name: "amount", type: "uint256" }],
            outputs: []
          }
        ] as const,
        functionName: "deposit",
        args: [amountRaw],
        gasPrice: ARC_MIN_GAS_PRICE,
      });

      confetti({ particleCount: 50, spread: 40 });
      setDepositAmount("");
      refetchBalance();
    } catch (err) {
      alert("Deposit failed!");
    } finally {
      setIsTxPending(false);
    }
  };

  const handleDirectSpend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTxPending(true);
    try {
      const amountRaw = parseUnits(directSpendAmount, 6);
      await writeContractAsync({
        address: DEPLOYED_TREASURY_ADDRESS,
        abi: [
          {
            type: "function",
            name: "directSpend",
            stateMutability: "nonpayable",
            inputs: [
              { name: "recipient", type: "address" },
              { name: "amount", type: "uint256" }
            ],
            outputs: []
          }
        ] as const,
        functionName: "directSpend",
        args: [directSpendRecipient as `0x${string}`, amountRaw],
        gasPrice: ARC_MIN_GAS_PRICE,
      });

      alert("Direct spend executed successfully under daily limit!");
      setDirectSpendAmount("");
      setDirectSpendRecipient("");
      refetchBalance();
    } catch (err) {
      alert("Direct spend rejected! Ensure your allowance limits aren't exceeded.");
    } finally {
      setIsTxPending(false);
    }
  };

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTxPending(true);
    try {
      const amountRaw = parseUnits(proposalAmount, 6);
      await writeContractAsync({
        address: DEPLOYED_TREASURY_ADDRESS,
        abi: [
          {
            type: "function",
            name: "proposeSpend",
            stateMutability: "nonpayable",
            inputs: [
              { name: "recipient", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "description", type: "string" }
            ],
            outputs: [{ type: "uint256" }]
          }
        ] as const,
        functionName: "proposeSpend",
        args: [proposalRecipient as `0x${string}`, amountRaw, proposalDescription],
        gasPrice: ARC_MIN_GAS_PRICE,
      });

      // Add to local state list
      setProposals([
        ...proposals,
        {
          id: proposals.length + 1,
          proposer: address || "0x...",
          recipient: proposalRecipient,
          amount: proposalAmount,
          description: proposalDescription,
          votesFor: 1,
          votesAgainst: 0,
          executed: false,
          deadline: "3 days remaining"
        }
      ]);

      setProposalAmount("");
      setProposalRecipient("");
      setProposalDescription("");
    } catch (err) {
      alert("Proposal creation failed!");
    } finally {
      setIsTxPending(false);
    }
  };

  const handleVote = (proposalId: number, support: boolean) => {
    setProposals(
      proposals.map((p) => {
        if (p.id === proposalId) {
          return {
            ...p,
            votesFor: support ? p.votesFor + 1 : p.votesFor,
            votesAgainst: !support ? p.votesAgainst + 1 : p.votesAgainst
          };
        }
        return p;
      })
    );
    alert(`Vote cast successfully: ${support ? "YES" : "NO"}`);
  };

  const handleExecute = (proposalId: number) => {
    setProposals(
      proposals.map((p) => {
        if (p.id === proposalId) {
          return { ...p, executed: true };
        }
        return p;
      })
    );
    confetti({ particleCount: 80, spread: 60 });
    alert("Expenditure proposal executed!");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "40px", padding: "20px 0" }}>
      
      {/* Header Cards (Treasury Stats) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
        
        {/* Pool Balance Card */}
        <div className="glass-card" style={{ padding: "28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Total Pool Balance</span>
            <div style={{ fontSize: "2.2rem", fontWeight: 800, marginTop: "6px", fontFamily: "Space Grotesk" }}>
              {balance} <span style={{ fontSize: "1.2rem", color: "var(--primary)" }}>USDC</span>
            </div>
          </div>
          <div style={{
            background: "rgba(255, 255, 255, 0.08)",
            color: "var(--primary)",
            width: "54px",
            height: "54px",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Landmark size={24} />
          </div>
        </div>

        {/* Members count */}
        <div className="glass-card" style={{ padding: "28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Active Members</span>
            <div style={{ fontSize: "2.2rem", fontWeight: 800, marginTop: "6px", fontFamily: "Space Grotesk" }}>
              {membersCount} <span style={{ fontSize: "1.2rem", color: "var(--primary)" }}>Users</span>
            </div>
          </div>
          <div style={{
            background: "rgba(255, 255, 255, 0.08)",
            color: "var(--primary)",
            width: "54px",
            height: "54px",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Coins size={24} />
          </div>
        </div>
      </div>

      {/* Main Controls Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "32px", alignItems: "start" }}>
        
        {/* Left Column: Deposits and Limits */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          
          {/* Deposit box */}
          <div className="glass-card" style={{ padding: "32px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "20px" }}>Deposit to Pool</h2>
            <form onSubmit={handleDeposit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label htmlFor="deposit">Amount</label>
                <input
                  id="deposit"
                  type="number"
                  placeholder="USDC"
                  required
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={isTxPending || !depositAmount} style={{ justifyContent: "center" }}>
                Deposit USDC
              </button>
            </form>
          </div>

          {/* Daily Limit spend box */}
          <div className="glass-card" style={{ padding: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Direct Spend (Daily Limit)</h2>
              <span className="badge badge-info">10 USDC limit</span>
            </div>
            <form onSubmit={handleDirectSpend} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label htmlFor="recipient">Recipient Address</label>
                <input
                  id="recipient"
                  type="text"
                  placeholder="0x..."
                  required
                  value={directSpendRecipient}
                  onChange={(e) => setDirectSpendRecipient(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="limitAmount">Amount</label>
                <input
                  id="limitAmount"
                  type="number"
                  placeholder="USDC"
                  required
                  value={directSpendAmount}
                  onChange={(e) => setDirectSpendAmount(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-secondary" disabled={isTxPending || !directSpendAmount || !directSpendRecipient} style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
                Send Instantly <ArrowUpRight size={18} />
              </button>
            </form>
          </div>

        </div>

        {/* Right Column: Proposals and Voting */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          
          {/* Active Proposals list */}
          <div className="glass-card" style={{ padding: "32px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "20px" }}>Active Expenditure Proposals</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              
              {proposals.map((proposal) => {
                const totalVotes = proposal.votesFor + proposal.votesAgainst;
                const isExecutable = proposal.votesFor >= 2 && !proposal.executed; // Mock condition
                
                return (
                  <div key={proposal.id} style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "Space Grotesk" }}>PROPOSAL #{proposal.id}</span>
                        <h4 style={{ fontSize: "1.05rem", fontWeight: 600, marginTop: "2px" }}>{proposal.description}</h4>
                      </div>
                      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)", fontFamily: "Space Grotesk" }}>{proposal.amount} USDC</div>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      <span>Recipient: {proposal.recipient.slice(0, 6)}...{proposal.recipient.slice(-4)}</span>
                      <span>{proposal.deadline}</span>
                    </div>

                    <div style={{ borderBottom: "1px solid var(--border-color)", margin: "4px 0" }}></div>

                    {proposal.executed ? (
                      <span className="badge badge-success" style={{ width: "100%", justifyContent: "center" }}>Executed</span>
                    ) : (
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: "8px", flex: 1 }}>
                          <button onClick={() => handleVote(proposal.id, true)} className="btn-secondary" style={{ display: "flex", gap: "4px", padding: "8px 16px", flex: 1, justifyContent: "center", border: "1px solid rgba(16, 185, 129, 0.2)", color: "var(--success)" }}>
                            <Check size={14} /> YES ({proposal.votesFor})
                          </button>
                          <button onClick={() => handleVote(proposal.id, false)} className="btn-secondary" style={{ display: "flex", gap: "4px", padding: "8px 16px", flex: 1, justifyContent: "center", border: "1px solid rgba(239, 68, 68, 0.2)", color: "var(--danger)" }}>
                            <X size={14} /> NO ({proposal.votesAgainst})
                          </button>
                        </div>
                        {isExecutable && (
                          <button onClick={() => handleExecute(proposal.id)} className="btn-primary" style={{ padding: "8px 16px" }}>
                            Execute Payout
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          </div>

          {/* New Proposal form */}
          <div className="glass-card" style={{ padding: "32px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "20px" }}>Propose Pool Expenditure</h2>
            <form onSubmit={handleCreateProposal} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label htmlFor="propRecipient">Recipient Address</label>
                  <input
                    id="propRecipient"
                    type="text"
                    placeholder="0x..."
                    required
                    value={proposalRecipient}
                    onChange={(e) => setProposalRecipient(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="propAmount">Amount (USDC)</label>
                  <input
                    id="propAmount"
                    type="number"
                    placeholder="USDC"
                    required
                    value={proposalAmount}
                    onChange={(e) => setProposalAmount(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="propDesc">Reason / Description</label>
                <input
                  id="propDesc"
                  type="text"
                  placeholder="e.g. server hosting costs"
                  required
                  value={proposalDescription}
                  onChange={(e) => setProposalDescription(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={isTxPending || !proposalAmount || !proposalRecipient || !proposalDescription} style={{ justifyContent: "center" }}>
                Submit Proposal
              </button>
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
