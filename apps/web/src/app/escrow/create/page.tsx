"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, keccak256, toHex, encodePacked, decodeEventLog } from "viem";
import { Handshake, HelpCircle, ShieldCheck, QrCode } from "lucide-react";
import { DEPLOYED_ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts";
import { ARC_MIN_GAS_PRICE } from "@/lib/wagmi";
import { trackJobId, setJobType } from "../page";
import { supabase } from "@/lib/supabase";

// Fallback USDC address on Arc Testnet
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
// AI Evaluator = Bot wallet address (confirmed from bot startup log: 🤖 Bot Wallet Address)
// Reads from env var first, falls back to the known deployed address.
const DEFAULT_EVALUATOR = process.env.NEXT_PUBLIC_BOT_WALLET_ADDRESS || "0x546c8C7A9d3Db29eb0c194Da0c72631F8a717b00";



export default function CreateEscrow() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();

  // Form State
  const [provider, setProvider] = useState("");
  const [evaluator, setEvaluator] = useState(DEFAULT_EVALUATOR);
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("24");
  const [escrowType, setEscrowType] = useState<"digital" | "physical">("digital");
  const [qrCodeWord, setQrCodeWord] = useState("");

  // Loading & Transaction States
  // Steps: 1=Form, 2=Waiting for seller to setBudget, 3=Approve+Fund, 5=Complete
  const [step, setStep] = useState(1);
  const [jobId, setJobId] = useState<bigint | null>(null);
  const [isTxPending, setIsTxPending] = useState(false);
  const [isAlsoProvider, setIsAlsoProvider] = useState(false);

  const { writeContractAsync } = useWriteContract();

  // Pre-fill parameters from Telegram query params
  useEffect(() => {
    const providerParam = searchParams.get("provider");
    const amountParam = searchParams.get("amount");
    const descriptionParam = searchParams.get("description");
    const typeParam = searchParams.get("type");

    if (providerParam) setProvider(providerParam);
    if (amountParam && amountParam !== "0") setBudget(amountParam);
    if (descriptionParam) setDescription(descriptionParam);
    if (typeParam === "physical") setEscrowType("physical");
  }, [searchParams]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      alert("Please connect your wallet first!");
      return;
    }

    setIsTxPending(true);
    try {
      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + parseInt(hours) * 3600);
      const budgetUSDC = parseUnits(budget, 6);

      // Step 2.1: Call createJob onchain
      const txHash = await writeContractAsync({
        address: DEPLOYED_ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "createJob",
        args: [
          provider as `0x${string}`,
          evaluator as `0x${string}`,
          expiredAt,
          description,
          "0x0000000000000000000000000000000000000000" as `0x${string}`
        ],
        gasPrice: ARC_MIN_GAS_PRICE,
      });

      console.log("CreateJob Transaction Hash:", txHash);
      
      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new Error("Create escrow transaction reverted onchain!");
      }

      // Parse the actual Job ID from the transaction logs
      let createdJobId = 1n; // Default fallback
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: escrowAbi,
            eventName: "JobCreated",
            topics: log.topics,
            data: log.data,
          });
          if (decoded && decoded.args) {
            //@ts-ignore
            createdJobId = decoded.args.jobId;
            break;
          }
        } catch (e) {
          // Skip logs that do not match the event signature
        }
      }
      setJobId(createdJobId);
      // Track this job ID in localStorage so it shows on the escrow list
      trackJobId(Number(createdJobId));
      setJobType(Number(createdJobId), escrowType);

      // If physical escrow and QR word is set, upload the QR code hash
      if (escrowType === "physical" && qrCodeWord) {
        const qrHash = keccak256(toHex(qrCodeWord));
        const qrTxHash = await writeContractAsync({
          address: DEPLOYED_ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "setQrConfirmation",
          args: [createdJobId, qrHash],
          gasPrice: ARC_MIN_GAS_PRICE,
        });
        const qrReceipt = await publicClient.waitForTransactionReceipt({ hash: qrTxHash });
        if (qrReceipt.status !== "success") {
          throw new Error("Failed to set physical QR confirmation code onchain!");
        }

        // Save to Supabase Cloud Database
        const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (hasSupabase) {
          try {
            await supabase.from("escrow_submissions").upsert({
              job_id: Number(createdJobId),
              file_url: qrCodeWord,
              file_name: "meetup_code",
              status: "Funded",
              result: "Physical meetup escrow initialized. Scan QR code to complete.",
              source: "web"
            });
            console.log("Physical meetup release word saved to Supabase.");
          } catch (dbErr) {
            console.error("Failed to save meetup release word to Supabase:", dbErr);
          }
        }

        // Save to localStorage fallback
        try {
          localStorage.setItem(`arc_physical_code_${createdJobId}`, qrCodeWord);
        } catch (err) {
          console.warn("Failed to write physical code to localStorage:", err);
        }
      }

      // Check if connected wallet IS the provider (same person — enables self-testing)
      const walletIsProvider = address?.toLowerCase() === (provider as string).toLowerCase();
      setIsAlsoProvider(walletIsProvider);

      if (walletIsProvider) {
        // setBudget is only callable by the provider — do it now while we have their wallet
        const setBudgetTxHash = await writeContractAsync({
          address: DEPLOYED_ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "setBudget",
          args: [createdJobId, budgetUSDC, "0x"],
          gasPrice: ARC_MIN_GAS_PRICE,
        });
        const setBudgetReceipt = await publicClient.waitForTransactionReceipt({ hash: setBudgetTxHash });
        if (setBudgetReceipt.status !== "success") {
          throw new Error("setBudget transaction reverted!");
        }
        setStep(3); // Budget set — proceed to approve + fund
      } else {
        // Save the buyer's proposed budget to Supabase so the seller can see it
        const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (hasSupabase) {
          try {
            await supabase.from("escrow_submissions").upsert({
              job_id: Number(createdJobId),
              file_url: "",
              file_name: "",
              status: "Negotiation",
              result: `Proposed budget: ${budget} USDC`,
              source: "web"
            });
            console.log("Proposed budget saved to Supabase.");
          } catch (dbErr) {
            console.error("Failed to save proposed budget to Supabase:", dbErr);
          }
        }
        
        try {
          localStorage.setItem(`arc_proposed_budget_${createdJobId}`, budget);
        } catch (err) {}

        setStep(2); // Seller must set budget first — show waiting state with job ID
      }
    } catch (err: any) {
      console.error(err);
      alert(`Transaction failed: ${err.message || err}`);
    } finally {
      setIsTxPending(false);
    }
  };

  const handleApproveAndFund = async () => {
    if (!jobId) return;
    setIsTxPending(true);
    try {
      const budgetUSDC = parseUnits(budget, 6);

      // Step 3.1: Approve USDC spending
      const approveAbi = [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" }
          ],
          outputs: [{ type: "bool" }]
        }
      ] as const;

      const approveTxHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: approveAbi,
        functionName: "approve",
        args: [DEPLOYED_ESCROW_ADDRESS, budgetUSDC],
        gasPrice: ARC_MIN_GAS_PRICE,
      });
      
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
      if (approveReceipt.status !== "success") {
        throw new Error("USDC Approval transaction reverted onchain!");
      }

      // Step 3.2: Fund Escrow — pulls approved USDC from wallet into escrow
      // Note: setBudget() is restricted to the provider/seller role in the contract.
      // The fund() function reads the approved allowance amount directly.
      const fundTxHash = await writeContractAsync({
        address: DEPLOYED_ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "fund",
        args: [jobId, "0x"],
        gasPrice: ARC_MIN_GAS_PRICE,
      });

      const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundTxHash });
      if (fundReceipt.status !== "success") {
        throw new Error("USDC Funding transaction reverted onchain!");
      }

      setStep(5); // Complete!


    } catch (err: any) {
      console.error(err);
      alert(`USDC Approval or Funding failed: ${err.message || err}`);
    } finally {
      setIsTxPending(false);
    }
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px 0" }}>
      <div className="glass-card" style={{ padding: "40px", display: "flex", flexDirection: "column", gap: "28px" }}>
        
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            background: "rgba(255, 255, 255, 0.08)",
            color: "var(--primary)",
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Handshake size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700 }}>Initialize Arc Escrow</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Deploys a secure ERC-8183 escrow contract</p>
          </div>
        </div>

        {/* Form Wizard Progress */}
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
          <span style={{ fontWeight: step >= 1 ? 600 : 400, color: step >= 1 ? "var(--primary)" : "var(--text-muted)" }}>1. Configure</span>
          <span style={{ color: "var(--text-muted)" }}>&rarr;</span>
          <span style={{ fontWeight: step >= 3 ? 600 : 400, color: step >= 3 ? "var(--primary)" : "var(--text-muted)" }}>2. Deploy & Approve</span>
          <span style={{ color: "var(--text-muted)" }}>&rarr;</span>
          <span style={{ fontWeight: step === 5 ? 600 : 400, color: step === 5 ? "var(--success)" : "var(--text-muted)" }}>3. Funded</span>
        </div>

        {step === 1 && (
          <form onSubmit={handleCreateJob} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Escrow Type Selection */}
            <div>
              <label>Escrow Type</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <button
                  type="button"
                  className={escrowType === "digital" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setEscrowType("digital")}
                  style={{ display: "flex", justifyContent: "center", gap: "8px" }}
                >
                  <ShieldCheck size={18} /> Digital Work
                </button>
                <button
                  type="button"
                  className={escrowType === "physical" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setEscrowType("physical")}
                  style={{ display: "flex", justifyContent: "center", gap: "8px" }}
                >
                  <QrCode size={18} /> In-Person Meetup
                </button>
              </div>
            </div>

            {/* Inputs */}
            <div>
              <label htmlFor="provider">Seller / Provider Address</label>
              <input
                id="provider"
                type="text"
                placeholder="0x..."
                required
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="evaluator" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>AI Evaluator / Arbitrator Address</span>
                {address && (
                  <button 
                    type="button" 
                    onClick={() => setEvaluator(address)}
                    style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "0.8rem", cursor: "pointer", padding: 0 }}
                  >
                    Set to My Wallet (Web-only approval)
                  </button>
                )}
              </label>
              <input
                id="evaluator"
                type="text"
                value={evaluator}
                required
                onChange={(e) => setEvaluator(e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label htmlFor="budget">USDC Budget</label>
                <input
                  id="budget"
                  type="number"
                  placeholder="USDC"
                  required
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="duration">Contract Expiration (Hours)</label>
                <select id="duration" value={hours} onChange={(e) => setHours(e.target.value)}>
                  <option value="2">2 Hours</option>
                  <option value="24">24 Hours</option>
                  <option value="72">72 Hours</option>
                  <option value="168">7 Days</option>
                </select>
              </div>
            </div>

            {escrowType === "physical" && (
              <div>
                <label htmlFor="qrCodeWord">Physical Meetup Release Word (e.g. "laptop-received")</label>
                <input
                  id="qrCodeWord"
                  type="text"
                  placeholder="Secret word for QR confirmation"
                  value={qrCodeWord}
                  onChange={(e) => setQrCodeWord(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="description">Task Details & Specifications</label>
              <textarea
                id="description"
                rows={3}
                placeholder="Describe deliverable properties (e.g., File format: SVG, color: blue rocket)"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {!isConnected ? (
              <div style={{ padding: "12px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "8px", color: "var(--danger)", textAlign: "center", fontWeight: 500 }}>
                Please connect your wallet at the top of the page.
              </div>
            ) : (
              <button type="submit" className="btn-primary" disabled={isTxPending} style={{ width: "100%", justifyContent: "center" }}>
                {isTxPending ? "Deploying contract..." : "Lock Escrow Onchain"}
              </button>
            )}
          </form>
        )}

        {step === 2 && jobId !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "center" }}>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "12px", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "8px" }}>✅ Job #{jobId.toString()} Created!</h3>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, fontSize: "0.9rem" }}>
                The escrow job is live onchain. However, the <b>seller must set the budget</b> before you can fund it.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "left" }}>
              <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Job ID (share with seller)</span>
                <div style={{ fontFamily: "Space Grotesk", fontSize: "1.4rem", fontWeight: 700, color: "var(--primary)", marginTop: "4px" }}>#{jobId.toString()}</div>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Ask the seller to visit the escrow page, connect their wallet, and confirm the budget. Once they do, return here to fund it.
              </p>
            </div>
            <a href={`/escrow/${jobId.toString()}`} className="btn-secondary" style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}>
              View Escrow #{jobId.toString()} →
            </a>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "center" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600 }}>✅ Job Created & Budget Set!</h3>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Now lock <b>{budget} USDC</b> into escrow. This triggers <b>2 wallet confirmations</b>:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", textAlign: "left" }}>
              {[
                { n: 1, label: "Approve USDC — allow the escrow contract to spend your USDC" },
                { n: 2, label: "Fund Escrow — transfer USDC into the locked escrow" },
              ].map(({ n, label }) => (
                <div key={n} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "10px 14px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                  <span style={{ background: "rgba(255, 255, 255, 0.08)", color: "var(--primary)", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0, fontSize: "0.85rem" }}>{n}</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{label}</span>
                </div>
              ))}
            </div>
            <button onClick={handleApproveAndFund} className="btn-primary" disabled={isTxPending} style={{ width: "100%", justifyContent: "center" }}>
              {isTxPending ? "Processing — check your wallet for confirmations..." : "Approve & Deposit USDC"}
            </button>
          </div>
        )}




        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", textAlign: "center", alignItems: "center" }}>
            <div style={{
              background: "rgba(16, 185, 129, 0.1)",
              color: "var(--success)",
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <ShieldCheck size={36} />
            </div>
            <div>
              <h3 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Escrow Created & Funded!</h3>
              <p style={{ color: "var(--text-secondary)", marginTop: "8px", lineHeight: 1.4 }}>
                The USDC is now securely locked. The seller has been notified on Telegram and can now upload deliverables for AI check or generate the meetup QR release code.
              </p>
            </div>
            <button onClick={() => router.push("/")} className="btn-secondary" style={{ width: "100%" }}>
              Back to Home
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
