"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { parseUnits, keccak256, toHex, encodePacked, decodeEventLog, encodeFunctionData } from "viem";
import { Handshake, HelpCircle, ShieldCheck, QrCode } from "lucide-react";
import { DEPLOYED_ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts";
import { trackJobId, setJobType } from "@/lib/escrow-tracking";
import { supabase } from "@/lib/supabase";
import { waitForReceipt } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";
import { useCircleWallet } from "@/components/CircleWalletContext";
import { publicClient } from "@/lib/publicClient";

// Fallback USDC address on Arc Testnet
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
// AI Evaluator = Bot wallet address (confirmed from bot startup log: 🤖 Bot Wallet Address)
// Reads from env var first, falls back to the known deployed address.
const DEFAULT_EVALUATOR = process.env.NEXT_PUBLIC_BOT_WALLET_ADDRESS || "0x546c8C7A9d3Db29eb0c194Da0c72631F8a717b00";



function CreateEscrowContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isConnected, address } = useWallet();
  const { executeContractCall } = useCircleWallet();

  // Unified contract writer: uses Circle SDK for Circle wallet
  const writeContract = useCallback(async (
    functionName: string,
    args: any[],
    contractAddress: string = DEPLOYED_ESCROW_ADDRESS,
    abi: any = escrowAbi,
  ): Promise<`0x${string}`> => {
    // Encode the full calldata using viem, then submit as raw data to Circle
    const calldata = encodeFunctionData({ abi, functionName: functionName as any, args: args as any });
    const txHash = await executeContractCall({
      contractAddress,
      abiFunctionSignature: "execute(bytes)",  // dummy — callData overrides below
      abiParameters: [{ type: "callData", value: calldata }],
      amount: "0",
    });
    return (txHash || "0x") as `0x${string}`;
  }, [executeContractCall]);

  // Form State
  const [creatorRole, setCreatorRole] = useState<"buyer" | "seller">("buyer");
  const [provider, setProvider] = useState("");
  const [evaluator, setEvaluator] = useState(DEFAULT_EVALUATOR);
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("24");
  const [escrowType, setEscrowType] = useState<"digital" | "physical">("digital");
  const [qrCodeWord, setQrCodeWord] = useState("");
  const [proposalId, setProposalId] = useState<string | null>(null);

  // Features extensions: Templates & AI
  const [templates, setTemplates] = useState<any[]>([]);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("arc_escrow_templates");
      if (saved) setTemplates(JSON.parse(saved));
    } catch {}
  }, []);

  const saveTemplate = () => {
    const name = window.prompt("Enter a name for this template:");
    if (!name) return;
    const newTpl = { id: Date.now().toString(), name, provider, evaluator, budget, hours, escrowType, description, qrCodeWord };
    const list = [...templates, newTpl];
    setTemplates(list);
    localStorage.setItem("arc_escrow_templates", JSON.stringify(list));
    alert("Template saved!");
  };

  const applyTemplate = (tpl: any) => {
    if (tpl.provider) setProvider(tpl.provider);
    if (tpl.evaluator) setEvaluator(tpl.evaluator);
    if (tpl.budget) setBudget(tpl.budget);
    if (tpl.hours) setHours(tpl.hours);
    if (tpl.escrowType) setEscrowType(tpl.escrowType);
    if (tpl.description) setDescription(tpl.description);
    if (tpl.qrCodeWord) setQrCodeWord(tpl.qrCodeWord);
  };

  const deleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const list = templates.filter(t => t.id !== id);
    setTemplates(list);
    localStorage.setItem("arc_escrow_templates", JSON.stringify(list));
  };

  const analyzeDescription = async () => {
    if (!description.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, type: escrowType }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data);
        if (data.priceRange?.min && !budget) {
          setBudget(data.priceRange.min.toString());
        }
      }
    } catch {}
    finally { setAiLoading(false); }
  };

  // Loading & Transaction States
  // Steps: 1=Form, 2=Waiting for seller to setBudget, 3=Approve+Fund, 5=Complete
  const [step, setStep] = useState(1);
  const [jobId, setJobId] = useState<bigint | null>(null);
  const [isTxPending, setIsTxPending] = useState(false);
  const [isAlsoProvider, setIsAlsoProvider] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [isPollingBudget, setIsPollingBudget] = useState(false);
  const [budgetFound, setBudgetFound] = useState(false);



  // Pre-fill parameters from Telegram query params
  useEffect(() => {
    const providerParam = searchParams.get("provider");
    const amountParam = searchParams.get("amount");
    const descriptionParam = searchParams.get("description");
    const typeParam = searchParams.get("type");
    const proposalIdParam = searchParams.get("proposalId");

    if (providerParam) setProvider(providerParam);
    if (amountParam && amountParam !== "0") setBudget(amountParam);
    if (descriptionParam) setDescription(descriptionParam);
    if (typeParam === "physical") setEscrowType("physical");

    if (proposalIdParam) {
      setProposalId(proposalIdParam);
      // Fetch proposal details
      fetch(`/api/proposals?address=${address}`)
        .then(res => res.json())
        .then(data => {
          const prop = data.proposals?.find((p: any) => p.id === proposalIdParam);
          if (prop) {
            setProvider(prop.seller_address);
            setBudget(prop.budget.toString());
            setDescription(prop.description);
            setHours(prop.hours.toString());
            setEscrowType(prop.escrow_type);
            setQrCodeWord(prop.qr_code_word || "");
            setCreatorRole("buyer"); // Buyer resolves proposals
          }
        })
        .catch(console.error);
    }
  }, [searchParams, address]);

  // Poll on-chain budget when waiting for seller (Step 2)
  useEffect(() => {
    if (step !== 2 || !jobId || budgetFound) return;
    setIsPollingBudget(true);

    const pollInterval = setInterval(async () => {
      try {
        // We don't have publicClient here directly, use a simple RPC fetch
        // Route to the escrow detail page which handles funding
        const res = await fetch(`/api/submissions/${jobId.toString()}`);
        if (res.ok) {
          const data = await res.json();
          // If the budget changed from Negotiation to something else, seller acted
          if (data && data.status && data.status !== "Negotiation") {
            setBudgetFound(true);
            setIsPollingBudget(false);
            clearInterval(pollInterval);
            router.push(`/escrow/${jobId.toString()}`);
          }
        }
      } catch (e) {
        // API offline — ignore polling errors silently
      }
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      setIsPollingBudget(false);
    };
  }, [step, jobId, budgetFound, router]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      alert("Please connect your wallet first!");
      return;
    }

    // Validate wallet address
    if (!/^0x[a-fA-F0-9]{40}$/.test(provider)) {
      setProviderError(`${creatorRole === "seller" ? "Buyer" : "Provider"} must be a valid wallet address (0x...).`);
      return;
    }
    setProviderError(null);

    setIsTxPending(true);

    // If role is seller, save off-chain proposal instead of calling on-chain transaction
    if (creatorRole === "seller") {
      try {
        const res = await fetch("/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyerAddress: provider, // In seller mode, "provider" input is the Buyer
            sellerAddress: address,
            description,
            budget,
            hours,
            escrowType,
            qrCodeWord
          })
        });

        if (res.ok) {
          alert("Escrow Proposal sent to buyer successfully!");
          router.push("/escrow/board");
        } else {
          const err = await res.json();
          alert(err.error || "Failed to submit proposal");
        }
      } catch (err: any) {
        alert("Error sending proposal: " + err.message);
      } finally {
        setIsTxPending(false);
      }
      return;
    }

    try {
      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + parseInt(hours) * 3600);
      const budgetUSDC = parseUnits(budget, 6);

      // Pre-query the next job ID from the contract to know the exact ID that will be created
      const onchainJobId = await publicClient.readContract({
        address: DEPLOYED_ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "nextJobId",
      }) as bigint;

      // Step 2.1: Call createJob onchain
      const txHash = await writeContract("createJob", [
        provider as `0x${string}`,
        evaluator as `0x${string}`,
        expiredAt,
        description,
        "0x0000000000000000000000000000000000000000" as `0x${string}`
      ]);

      console.log("CreateJob Transaction Hash:", txHash);

      if (txHash && txHash !== "0x" && publicClient) {
        const receipt = await waitForReceipt(publicClient, txHash);
        if (receipt.status !== "success") throw new Error("Create escrow transaction reverted onchain!");
      }

      const createdJobId = onchainJobId;
      setJobId(createdJobId);
      // Track this job ID in localStorage so it shows on the escrow list
      trackJobId(Number(createdJobId));
      setJobType(Number(createdJobId), escrowType);

      // Mark the proposal as accepted if resolving a seller's proposal
      if (proposalId) {
        try {
          await fetch("/api/proposals", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ proposalId, status: "accepted" })
          });
        } catch (e) {}
      }

      // If physical escrow and QR word is set, upload the QR code hash
      if (escrowType === "physical" && qrCodeWord) {
        const qrHash = keccak256(toHex(qrCodeWord));
        const qrTxHash = await writeContract("setQrConfirmation", [createdJobId, qrHash]);
        if (qrTxHash && qrTxHash !== "0x" && publicClient) {
          const qrReceipt = await waitForReceipt(publicClient, qrTxHash);
          if (qrReceipt.status !== "success") throw new Error("Failed to set physical QR confirmation code onchain!");
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
        const setBudgetTxHash = await writeContract("setBudget", [createdJobId, budgetUSDC, "0x"]);
        if (setBudgetTxHash && setBudgetTxHash !== "0x" && publicClient) {
          const setBudgetReceipt = await waitForReceipt(publicClient, setBudgetTxHash);
          if (setBudgetReceipt.status !== "success") throw new Error("setBudget transaction reverted!");
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

            // Send notification to the provider (seller)
            await supabase.from("notifications").insert({
              recipient_address: provider.toLowerCase(),
              type: "COUNTER_OFFER",
              escrow_id: Number(createdJobId),
              message: `A new escrow contract (JOB #${createdJobId}) has been created for you by client ${address?.slice(0, 8)}...${address?.slice(-4)}. Please review the budget.`,
              read: false,
              metadata: { client: address, budget }
            });
            console.log("Creation notification sent to provider.");
          } catch (dbErr) {
            console.error("Failed to save proposed budget or send notification to Supabase:", dbErr);
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

      const approveTxHash = await writeContract(
        "approve",
        [DEPLOYED_ESCROW_ADDRESS, budgetUSDC],
        USDC_ADDRESS,
        approveAbi
      );
      
      const approveReceipt = await waitForReceipt(publicClient!, approveTxHash);
      if (approveReceipt.status !== "success") {
        throw new Error("USDC Approval transaction reverted onchain!");
      }

      // Step 3.2: Fund Escrow — pulls approved USDC from wallet into escrow
      // Note: setBudget() is restricted to the provider/seller role in the contract.
      // The fund() function reads the approved allowance amount directly.
      const fundTxHash = await writeContract(
        "fund",
        [jobId, "0x"],
        DEPLOYED_ESCROW_ADDRESS,
        escrowAbi
      );

      const fundReceipt = await waitForReceipt(publicClient!, fundTxHash);
      if (fundReceipt.status !== "success") {
        throw new Error("USDC Funding transaction reverted onchain!");
      }

      // Save escrow funding transaction to localStorage to show real amounts in profile transaction logs
      try {
        const savedRaw = localStorage.getItem("arc_saved_escrows") || "{}";
        const saved = JSON.parse(savedRaw);
        saved[fundTxHash.toLowerCase()] = {
          amount: budget,
          symbol: "USDC",
          jobId: Number(jobId),
          type: "fund"
        };
        localStorage.setItem("arc_saved_escrows", JSON.stringify(saved));
      } catch (e) {
        console.warn("Failed to cache funded escrow transaction:", e);
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
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px 16px" }}>
      <div className="glass-card responsive-card-padding" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
        
        {/* Header */}
        <div className="create-header">
          <div style={{
            background: "rgba(255, 255, 255, 0.08)",
            color: "var(--primary)",
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}>
            <Handshake size={20} />
          </div>
          <div>
            <h1>Initialize Arc Escrow</h1>
            <p style={{ color: "var(--text-secondary)" }}>Deploys a secure ERC-8183 escrow contract</p>
          </div>
        </div>

        {/* Form Wizard Progress */}
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          borderBottom: "1px solid var(--border-color)", 
          paddingBottom: "16px",
          fontSize: "0.8rem",
          gap: "4px"
        }}>
          <span style={{ fontWeight: step >= 1 ? 600 : 400, color: step >= 1 ? "var(--primary)" : "var(--text-muted)", whiteSpace: "nowrap" }}>1. Setup</span>
          <span style={{ color: "var(--text-muted)" }}>&rarr;</span>
          <span style={{ fontWeight: step >= 3 ? 600 : 400, color: step >= 3 ? "var(--primary)" : "var(--text-muted)", whiteSpace: "nowrap" }}>2. Deposit</span>
          <span style={{ color: "var(--text-muted)" }}>&rarr;</span>
          <span style={{ fontWeight: step === 5 ? 600 : 400, color: step === 5 ? "var(--success)" : "var(--text-muted)", whiteSpace: "nowrap" }}>3. Active</span>
        </div>

        {step === 1 && (
          <form onSubmit={handleCreateJob} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Role Selection Toggle */}
            <div>
              <label>I am the:</label>
              <div className="create-form-row" style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                <button
                  type="button"
                  className={creatorRole === "buyer" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setCreatorRole("buyer")}
                  style={{ flex: 1, padding: "8px", fontSize: "0.85rem" }}
                >
                  Buyer (Hiring / Funding)
                </button>
                <button
                  type="button"
                  className={creatorRole === "seller" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setCreatorRole("seller")}
                  style={{ flex: 1, padding: "8px", fontSize: "0.85rem" }}
                >
                  Seller (Service Provider)
                </button>
              </div>
            </div>

            {/* Templates Selector */}
            {templates.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "12px 14px" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, display: "block", marginBottom: "8px" }}>
                  📂 Quick Templates
                </span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {templates.map(t => (
                    <div
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "8px",
                        padding: "6px 12px",
                        fontSize: "0.76rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        color: "var(--text-primary)",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    >
                      <span>{t.name}</span>
                      <button
                        onClick={(e) => deleteTemplate(t.id, e)}
                        style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 0, fontSize: "0.8rem", display: "flex" }}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Escrow Type Selection */}
            <div>
              <label>Escrow Type</label>
              <div className="create-form-row">
                <button
                  type="button"
                  className={escrowType === "digital" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setEscrowType("digital")}
                  style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "8px 12px", fontSize: "0.85rem" }}
                >
                  <ShieldCheck size={16} /> Digital Work
                </button>
                <button
                  type="button"
                  className={escrowType === "physical" ? "btn-primary" : "btn-secondary"}
                  onClick={() => setEscrowType("physical")}
                  style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", padding: "8px 12px", fontSize: "0.85rem" }}
                >
                  <QrCode size={16} /> In-Person Meetup
                </button>
              </div>
            </div>

            {/* Inputs */}
            <div>
              <label htmlFor="provider">
                {creatorRole === "seller" ? "Buyer / client Address *" : "Seller / Provider Address *"}
              </label>
              <input
                id="provider"
                type="text"
                placeholder="0x..."
                required
                value={provider}
                onChange={(e) => { setProvider(e.target.value); setProviderError(null); }}
                style={providerError ? { borderColor: "var(--danger)" } : undefined}
              />
              {providerError && (
                <p style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: "6px", lineHeight: 1.4 }}>
                  ⚠️ {providerError}
                </p>
              )}
              {provider && provider.startsWith("@") && (
                <p style={{ color: "var(--warning)", fontSize: "0.8rem", marginTop: "6px", lineHeight: 1.4 }}>
                  ℹ️ Telegram usernames can't be used here — you need the seller's <b>wallet address</b> (e.g. <code>0xAbCd...</code>). Ask them to share it.
                </p>
              )}
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

            <div className="create-form-row">
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

            {escrowType === "physical" && creatorRole === "buyer" && (
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label htmlFor="description" style={{ margin: 0 }}>Task Details & Specifications</label>
                <button
                  type="button"
                  onClick={analyzeDescription}
                  disabled={aiLoading || !description.trim()}
                  style={{
                    background: "none", border: "none", color: "var(--primary)",
                    fontSize: "0.78rem", cursor: "pointer", display: "flex",
                    alignItems: "center", gap: "4px", padding: 0
                  }}
                >
                  {aiLoading ? "Analyzing..." : "✨ AI Analyze Description"}
                </button>
              </div>
              <textarea
                id="description"
                rows={3}
                placeholder="Describe deliverable properties (e.g., File format: SVG, color: blue rocket)"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              {/* AI summary preview */}
              {aiSummary && (
                <div style={{
                  marginTop: "12px",
                  background: "rgba(99,102,241,0.04)",
                  border: "1px solid rgba(99,102,241,0.15)",
                  borderRadius: "10px",
                  padding: "12px",
                }}>
                  <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "#818cf8", display: "block", marginBottom: "4px" }}>
                    ✨ AI Proposed Specifications
                  </span>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {aiSummary.plainSummary}
                  </p>
                  {aiSummary.priceRange && (aiSummary.priceRange.min || aiSummary.priceRange.max) && (
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "6px", display: "flex", gap: "10px" }}>
                      <span>💡 Suggested budget: {aiSummary.priceRange.min ?? "?"} - {aiSummary.priceRange.max ?? "?"} USDC</span>
                      {aiSummary.estimatedDuration && (
                        <span>⏱ Est. Time: {aiSummary.estimatedDuration}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isConnected ? (
              <div style={{ padding: "12px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "8px", color: "var(--danger)", textAlign: "center", fontWeight: 500 }}>
                Please connect your wallet at the top of the page.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <button type="submit" className="btn-primary" disabled={isTxPending} style={{ justifyContent: "center" }}>
                  {isTxPending 
                    ? (creatorRole === "seller" ? "Sending Proposal..." : "Deploying...") 
                    : (creatorRole === "seller" ? "Send Escrow Proposal" : "Lock Escrow Onchain")}
                </button>
                <button
                  type="button"
                  onClick={saveTemplate}
                  className="btn-secondary"
                  style={{ justifyContent: "center" }}
                >
                  Save as Template
                </button>
              </div>
            )}
          </form>
        )}

        {step === 2 && jobId !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "center" }}>
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "12px", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "8px" }}>✅ Job #{jobId.toString()} Created!</h3>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, fontSize: "0.9rem" }}>
                The escrow job is live onchain. The <b>seller must set the budget</b> before you can fund it.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", textAlign: "left" }}>
              <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Job ID (share with seller)</span>
                <div style={{ fontFamily: "Space Grotesk", fontSize: "1.4rem", fontWeight: 700, color: "var(--primary)", marginTop: "4px" }}>#{jobId.toString()}</div>
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Share this Job ID with the seller. Once they connect their wallet at the escrow page and confirm their price, you will be taken directly to fund it.
              </p>
              {isPollingBudget && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", animation: "pulse 1.5s infinite" }} />
                  Watching for seller's budget confirmation...
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <a href={`/escrow/${jobId.toString()}`} className="btn-primary" style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}>
                Open Escrow #{jobId.toString()} →
              </a>
            </div>
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

export default function CreateEscrow() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0b10", color: "#ffffff" }}>
        <div style={{ fontSize: "1.1rem", opacity: 0.8 }}>Loading Escrow Creator...</div>
      </div>
    }>
      <CreateEscrowContent />
    </Suspense>
  );
}
