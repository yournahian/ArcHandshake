"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatUnits, parseUnits, keccak256, toHex, encodeFunctionData } from "viem";
import { escrowAbi, DEPLOYED_ESCROW_ADDRESS } from "@/lib/contracts";
import { ShieldAlert, ShieldCheck, Download, Upload, AlertCircle, RefreshCw, DollarSign, Wallet, Clock } from "lucide-react";
import confetti from "canvas-confetti";
import { trackJobId } from "@/lib/escrow-tracking";
import { supabase } from "@/lib/supabase";
import { waitForReceipt } from "@/lib/utils";
import { useWallet } from "@/hooks/useWallet";
import { useCircleWallet } from "@/components/CircleWalletContext";
import { publicClient } from "@/lib/publicClient";

const DEFAULT_EVALUATOR = process.env.NEXT_PUBLIC_BOT_WALLET_ADDRESS || "0x546c8C7A9d3Db29eb0c194Da0c72631F8a717b00";

export default function EscrowDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const { executeContractCall } = useCircleWallet();
  const jobId = BigInt(id as string);

  // Local file upload state (for demo and watermarking)
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Seller: set budget state
  const [budgetInput, setBudgetInput] = useState("");
  const [isSettingBudget, setIsSettingBudget] = useState(false);

  // Negotiation state
  const [counterOfferInput, setCounterOfferInput] = useState("");
  const [isCounterOffering, setIsCounterOffering] = useState(false);
  const [localCounterOffer, setLocalCounterOffer] = useState<string | null>(null);
  const [proposedBudget, setProposedBudget] = useState<string | null>(null);

  // Buyer: fund state
  const [isFunding, setIsFunding] = useState(false);

  // Custom toast notification state and alert helper to replace native browser popups
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const alert = useCallback((message: string) => {
    const lower = message.toLowerCase();
    const isError = lower.includes("failed") || 
                    lower.includes("error") || 
                    lower.includes("offline") || 
                    lower.includes("invalid") || 
                    lower.includes("incorrect") || 
                    lower.includes("wrong") || 
                    lower.includes("not set");
    setToast({ message: message.replace(/\n/g, " "), type: isError ? "error" : "success" });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  }, []);

  // Read Job details from Arc Testnet contract manually using publicClient
  const [jobRaw, setJobRaw] = useState<any>(null);
  const [isPending, setIsPending] = useState(true);

  const refetch = useCallback(async () => {
    // Only show loading spinner on initial load when jobRaw is not yet fetched
    if (!jobRaw) {
      setIsPending(true);
    }
    try {
      const data = await publicClient.readContract({
        address: DEPLOYED_ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "jobs",
        args: [jobId],
      });
      setJobRaw(data);
    } catch (err) {
      console.error("Error reading job:", err);
    } finally {
      setIsPending(false);
    }
  }, [jobId, jobRaw]);

  useEffect(() => {
    refetch();
  }, [refetch]);

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

  // Confetti trigger on completed + track this job ID in localStorage
  useEffect(() => {
    if (jobRaw) {
      trackJobId(Number(jobId)); // add to known list for any visitor
    }
  }, [jobRaw, jobId]);

  // Load physical code and negotiation state from localStorage on load
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`arc_negotiation_${jobId}`);
      if (saved) {
        setLocalCounterOffer(saved);
      }
    } catch (e) {}
  }, [jobId]);


  // Submissions & release state
  const [submission, setSubmission] = useState<{ fileUrl: string; fileName: string; status: string; result: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);

  // Live countdown timer
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  // Load proposed budget from Supabase or localStorage
  useEffect(() => {
    const loadProposed = async () => {
      if (jobRaw && jobRaw[5] > BigInt(0)) {
        setProposedBudget(null);
        try {
          localStorage.removeItem(`arc_proposed_budget_${jobId}`);
        } catch (e) {}
        return;
      }
      if (submission && submission.status === "Negotiation" && submission.result.startsWith("Proposed budget: ")) {
        const amt = submission.result.replace("Proposed budget: ", "").replace(" USDC", "");
        setProposedBudget(amt);
        return;
      }
      try {
        const saved = localStorage.getItem(`arc_proposed_budget_${jobId}`);
        if (saved) {
          setProposedBudget(saved);
        }
      } catch (err) {}
    };
    loadProposed();
  }, [submission, jobId, jobRaw]);

  // Pre-fill budget input for the seller
  useEffect(() => {
    if (proposedBudget && !budgetInput) {
      setBudgetInput(proposedBudget);
    }
  }, [proposedBudget]);

  const fetchSubmission = async () => {
    // 1. Try to fetch from Supabase directly first if available
    const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (hasSupabase) {
      try {
        const { data, error } = await supabase
          .from("escrow_submissions")
          .select("*")
          .eq("job_id", Number(jobId))
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setSubmission({
            fileUrl: data.file_url,
            fileName: data.file_name,
            status: data.status,
            result: data.result,
          });
          if (data.file_url && !fileUrl) {
            setFileUrl(data.file_url);
            setFileName(data.file_name);
          }
          return;
        } else {
          // If Supabase is active but no record was found, reset submission state
          setSubmission(null);
          return;
        }
      } catch (err) {
        // Supabase offline/empty
      }
    }

    // 2. Fall back to API Proxy (which talks to the local Express bot server)
    try {
      const res = await fetch(`/api/submissions/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setSubmission(data);
        if (data.fileUrl && !fileUrl) {
          setFileUrl(data.fileUrl);
          setFileName(data.fileName);
        }
        return;
      } else if (res.status === 404) {
        setSubmission(null);
      }
    } catch (e) {
      // API offline, fall back to localStorage
    }

    // 3. Fallback to LocalStorage (Web-only botless testing)
    try {
      const localSubStr = localStorage.getItem(`arc_web_submission_${jobId}`);
      if (localSubStr) {
        const localSub = JSON.parse(localSubStr);
        setSubmission(localSub);
        if (localSub.fileUrl && !fileUrl) {
          setFileUrl(localSub.fileUrl);
          setFileName(localSub.fileName);
        }
      } else {
        setSubmission(null);
      }
    } catch (err) {
      console.error("Failed to read local submission cache:", err);
      setSubmission(null);
    }
  };

  // Subscribe to real-time changes or fall back to polling
  useEffect(() => {
    if (!jobRaw) return;

    fetchSubmission();

    const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let channel: any = null;

    if (hasSupabase) {
      try {
        channel = supabase
          .channel(`escrow_submission_${jobId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "escrow_submissions",
              filter: `job_id=eq.${jobId}`,
            },
            (payload) => {
              console.log("⚡ Realtime notification received:", payload);
              if (payload.eventType === "DELETE") {
                setSubmission(null);
                try {
                  localStorage.removeItem(`arc_negotiation_${jobId}`);
                  setLocalCounterOffer(null);
                } catch (err) {}
                refetch();
              } else if (payload.new) {
                const newRow = payload.new as any;
                setSubmission({
                  fileUrl: newRow.file_url,
                  fileName: newRow.file_name,
                  status: newRow.status,
                  result: newRow.result,
                });
                if (newRow.file_url && !fileUrl) {
                  setFileUrl(newRow.file_url);
                  setFileName(newRow.file_name);
                }
                refetch(); // Update onchain state
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error("Failed to start Supabase realtime channel:", err);
      }
    }

    // Set up a fallback polling interval for blockchain refetching and in case realtime/Supabase is offline
    const status = jobRaw[7];
    if (status <= 2) {
      const interval = setInterval(async () => {
        await fetchSubmission();
        refetch();
      }, 5000);
      return () => {
        clearInterval(interval);
        if (channel) {
          supabase.removeChannel(channel);
        }
      };
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [jobRaw, jobId]);

  // Redirect physical escrows to meetup page if status >= 1 (Funded)
  useEffect(() => {
    if (jobRaw) {
      const qrHash = jobRaw[10];
      const isPhysical = qrHash && qrHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";
      const status = jobRaw[7];
      if (isPhysical && status >= 1) {
        router.replace(`/meetup/${id}`);
      }
      if (status === 3) { // Status === Completed
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      }
    }
  }, [jobRaw, id, router]);

  // Map tuple results from contract safely
  const [
    _,
    client,
    provider,
    evaluator,
    description,
    budgetRaw,
    expiredAtRaw,
    status,
    hook,
    deliverableHash,
    qrConfirmationHash
  ] = jobRaw || [
    undefined,
    "",
    "",
    "",
    "",
    BigInt(0),
    BigInt(0),
    0,
    "",
    "0x",
    "0x"
  ];

  // ─── Live countdown (runs after jobRaw is available) ─────────────────────
  useEffect(() => {
    if (!expiredAtRaw) return;
    const expiry = Number(expiredAtRaw) * 1000;
    const tick = () => {
      const diff = expiry - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hrs  = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000)  / 60000);
      const secs = Math.floor((diff % 60000)    / 1000);
      setTimeLeft(
        days > 0
          ? `${days}d ${hrs}h ${mins}m`
          : hrs > 0
          ? `${hrs}h ${mins}m ${secs}s`
          : `${mins}m ${secs}s`
      );
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiredAtRaw]);

  const budget = formatUnits(budgetRaw, 6);
  const isClient = address?.toLowerCase() === client.toLowerCase();
  const isProvider = address?.toLowerCase() === provider.toLowerCase();
  const isEvaluator = address?.toLowerCase() === evaluator.toLowerCase();

  const counterOfferAmount = (localCounterOffer && localCounterOffer !== "rejected")
    ? localCounterOffer
    : (submission && submission.status === "Negotiation" && submission.result.startsWith("Counter-offer: "))
    ? submission.result.replace("Counter-offer: ", "").replace(" USDC", "")
    : (submission && submission.status === "Negotiation" && submission.result.includes("rejected"))
    ? "rejected"
    : localCounterOffer;

  const isNegotiationActive = !!(
    counterOfferAmount &&
    counterOfferAmount !== "rejected" &&
    parseFloat(budget) !== parseFloat(counterOfferAmount)
  );

  // Clear local counter-offer if the on-chain budget has been updated to match it,
  // or if the escrow status is Funded or above, or if it was rejected/declined.
  useEffect(() => {
    // If the database has no Negotiation record, then any local counter-offer is no longer active
    const isDbNegotiating = submission && submission.status === "Negotiation";
    if (!isDbNegotiating && !isCounterOffering && localCounterOffer && localCounterOffer !== "rejected") {
      try {
        localStorage.removeItem(`arc_negotiation_${jobId}`);
      } catch (err) {}
      setLocalCounterOffer(null);
      return;
    }

    if (counterOfferAmount === "rejected" && localCounterOffer !== "rejected") {
      try {
        localStorage.setItem(`arc_negotiation_${jobId}`, "rejected");
      } catch (err) {}
      setLocalCounterOffer("rejected");
      return;
    }

    if (!jobRaw) return;
    const onChainBudget = formatUnits(jobRaw[5], 6);
    const onChainStatus = jobRaw[7];

    if (onChainStatus >= 1 || (localCounterOffer && localCounterOffer !== "rejected" && parseFloat(onChainBudget) === parseFloat(localCounterOffer))) {
      try {
        localStorage.removeItem(`arc_negotiation_${jobId}`);
      } catch (err) {}
      setLocalCounterOffer(null);
    }
  }, [jobRaw, localCounterOffer, jobId, counterOfferAmount, submission, isCounterOffering]);

  if (isPending || !jobRaw) {
    return (
      <div style={{ textAlign: "center", padding: "100px 0", color: "var(--text-secondary)" }}>
        <RefreshCw className="animate-spin" size={32} style={{ margin: "0 auto 16px" }} />
        Loading escrow details from Arc Network...
      </div>
    );
  }

  const isPhysical = qrConfirmationHash && qrConfirmationHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";


  const statuses = [
    "Open",       // 0
    "Funded",     // 1
    "Submitted",  // 2
    "Completed",  // 3
    "Rejected",   // 4
    "Expired",    // 5
    "Disputed"    // 6
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFileName(file.name);
    setSelectedFile(file); // Save the file object
    
    // Simulate watermarking overlay generator
    const reader = new FileReader();
    reader.onload = (event) => {
      setFileUrl(event.target?.result as string);
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  // SELLER: Set Budget handler
  const handleSetBudget = async (amountToSet?: string) => {
    const targetAmount = amountToSet || budgetInput;
    if (!targetAmount || parseFloat(targetAmount) <= 0) return;
    setIsSettingBudget(true);
    try {
      const amount = parseUnits(targetAmount, 6);
      const txHash = await writeContract(
        DEPLOYED_ESCROW_ADDRESS,
        escrowAbi,
        "setBudget",
        [jobId, amount, "0x"]
      );
      await waitForReceipt(publicClient, txHash);
      setBudgetInput("");

      // Clear negotiation state
      const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (hasSupabase) {
        try {
          await supabase.from("escrow_submissions").delete().eq("job_id", Number(jobId));
          // Overwrite the database record with empty details to clear negotiation status if delete is restricted
          await supabase.from("escrow_submissions").upsert({
            job_id: Number(jobId),
            status: "Open",
            result: "",
            file_url: "",
            file_name: "",
            source: "web"
          });
        } catch (dbErr) {}
      }
      try {
        localStorage.removeItem(`arc_negotiation_${jobId}`);
        setLocalCounterOffer(null);
      } catch (err) {}

      refetch();
      await fetchSubmission();
    } catch (err: any) {
      alert(`Set budget failed: ${err.message || err}`);
    } finally {
      setIsSettingBudget(false);
    }
  };

  // BUYER: Propose counter offer
  const handleProposeCounterOffer = async () => {
    if (!counterOfferInput || parseFloat(counterOfferInput) <= 0) return;
    setIsCounterOffering(true);
    try {
      const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (hasSupabase) {
        await supabase.from("escrow_submissions").upsert({
          job_id: Number(jobId),
          file_url: "",
          file_name: "",
          status: "Negotiation",
          result: `Counter-offer: ${counterOfferInput} USDC`,
          source: "web"
        });
      }

      try {
        localStorage.setItem(`arc_negotiation_${jobId}`, counterOfferInput);
        setLocalCounterOffer(counterOfferInput);
      } catch (err) {}

      alert(`Counter-offer of ${counterOfferInput} USDC proposed successfully!`);
      setCounterOfferInput("");
      await fetchSubmission();
    } catch (err: any) {
      alert(`Failed to propose counter-offer: ${err.message || err}`);
    } finally {
      setIsCounterOffering(false);
    }
  };

  // BUYER: Reject budget
  const handleRejectBudget = async () => {
    try {
      const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (hasSupabase) {
        await supabase.from("escrow_submissions").upsert({
          job_id: Number(jobId),
          file_url: "",
          file_name: "",
          status: "Negotiation",
          result: "Buyer rejected proposed budget.",
          source: "web"
        });
      }

      try {
        localStorage.setItem(`arc_negotiation_${jobId}`, "rejected");
        setLocalCounterOffer("rejected");
      } catch (err) {}

      alert("Budget quote rejected.");
      await fetchSubmission();
    } catch (err: any) {
      alert(`Failed to reject budget: ${err.message || err}`);
    }
  };

  // BUYER: Approve USDC + Fund handler (called after seller has set budget)
  const handleApproveAndFund = async () => {
    if (budgetRaw === BigInt(0)) {
      alert("Seller has not set the budget yet!");
      return;
    }
    setIsFunding(true);
    try {
      const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as `0x${string}`;
      const approveAbi = [{
        type: "function", name: "approve", stateMutability: "nonpayable",
        inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
        outputs: [{ type: "bool" }]
      }] as const;

      const approveTxHash = await writeContract(
        USDC_ADDRESS, approveAbi, "approve",
        [DEPLOYED_ESCROW_ADDRESS, budgetRaw]
      );
      const approveReceipt = await waitForReceipt(publicClient, approveTxHash);
      if (approveReceipt.status !== "success") throw new Error("USDC approval reverted!");

      const fundTxHash = await writeContract(
        DEPLOYED_ESCROW_ADDRESS, escrowAbi, "fund",
        [jobId, "0x"]
      );
      const fundReceipt = await waitForReceipt(publicClient, fundTxHash);
      if (fundReceipt.status !== "success") throw new Error("Funding transaction reverted!");

      refetch();
    } catch (err: any) {
      alert(`Funding failed: ${err.message || err}`);
    } finally {
      setIsFunding(false);
    }
  };

  const handleWebSubmit = async () => {
    if (!fileUrl || !fileName) return;
    setIsSubmitting(true);
    try {
      // 1. Submit onchain first to update status to Submitted (status === 2)
      const deliverableHash = keccak256(toHex(fileName));
      const txHash = await writeContract(
        DEPLOYED_ESCROW_ADDRESS,
        escrowAbi,
        "submit",
        [jobId, deliverableHash, "0x"]
      );
      await waitForReceipt(publicClient, txHash);

      let finalFileUrl = fileUrl;
      const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Upload to Supabase Storage if available
      if (hasSupabase && selectedFile) {
        try {
          const fileExt = fileName.split(".").pop();
          const filePath = `job_${jobId}_${Date.now()}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("escrow-deliverables")
            .upload(filePath, selectedFile, {
              cacheControl: "3600",
              upsert: true
            });
            
          if (uploadError) throw uploadError;
          
          const { data } = supabase.storage.from("escrow-deliverables").getPublicUrl(filePath);
          finalFileUrl = data.publicUrl;
          setFileUrl(finalFileUrl); // Update local fileUrl state to point to cloud file
        } catch (err: any) {
          console.error("Supabase Storage upload failed:", err);
          alert("Warning: Failed to upload file to Cloud Storage. Submitting local fallback URL.");
        }
      }

      const isCustomEvaluator = evaluator.toLowerCase() !== DEFAULT_EVALUATOR.toLowerCase();
      const initialStatus = isCustomEvaluator ? "Awaiting Buyer Approval" : "Pending Verification";
      const initialResult = isCustomEvaluator 
        ? "Deliverable uploaded. Awaiting manual review and approval by the buyer." 
        : "AI verification agent analyzing the uploaded deliverable...";

      // Save to Supabase DB if available
      let dbSaved = false;
      if (hasSupabase) {
        try {
          const { error: dbErr } = await supabase.from("escrow_submissions").upsert({
            job_id: Number(jobId),
            file_url: finalFileUrl,
            file_name: fileName,
            status: initialStatus,
            result: initialResult,
            source: "web"
          });
          if (!dbErr) {
            dbSaved = true;
            console.log("Submission details saved to Supabase.");
          } else {
            console.error("Supabase DB upsert error:", dbErr);
          }
        } catch (err) {
          console.error("Failed to insert submission into Supabase:", err);
        }
      }

      // Save to localStorage immediately as a client-side cache fallback
      const localSub = {
        fileUrl: finalFileUrl,
        fileName,
        status: initialStatus,
        result: initialResult
      };
      try {
        localStorage.setItem(`arc_web_submission_${jobId}`, JSON.stringify(localSub));
      } catch (err) {
        console.warn("Failed to write to localStorage:", err);
      }

      // If we didn't save directly to the DB (e.g. Supabase credentials missing), or if we need to notify
      // the bot API as a fallback, run this:
      if (!dbSaved && !isCustomEvaluator) {
        try {
          const res = await fetch("/api/submissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId: Number(jobId),
              fileUrl: finalFileUrl,
              fileName
            })
          });

          const data = await res.json();
          if (res.ok) {
            alert("Deliverable submitted successfully! AI Agent verification in progress.");
          } else {
            alert(`Deliverable submitted onchain, but bot returned: ${data.error}`);
          }
        } catch (postErr) {
          alert("Deliverable submitted onchain! Note: Verification backend is offline, please notify the buyer to approve manually.");
        }
      } else {
        if (isCustomEvaluator) {
          alert("Deliverable submitted onchain! Awaiting buyer approval.");
        } else {
          alert("Deliverable submitted successfully! AI Agent verification triggered in the cloud.");
        }
      }

      await fetchSubmission();
      refetch();
    } catch (err: any) {
      alert(`Submission failed: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setIsReleasing(true);
    try {
      const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Check if buyer IS the evaluator onchain (e.g. self-testing / custom arbitrator)
      if (evaluator.toLowerCase() === address?.toLowerCase()) {
        const reasonHash = keccak256(toHex("buyer_manual_approved"));
        const txHash = await writeContract(
          DEPLOYED_ESCROW_ADDRESS,
          escrowAbi,
          "complete",
          [jobId, reasonHash, "0x"]
        );
        await waitForReceipt(publicClient, txHash);

        // Update Supabase if available
        if (hasSupabase) {
          try {
            await supabase.from("escrow_submissions").update({
              status: "Approved",
              result: `Escrow payment released manually by buyer. Tx Hash: ${txHash}`
            }).eq("job_id", Number(jobId));
          } catch (dbErr) {
            console.error("Failed to update Supabase status to Approved:", dbErr);
          }
        }

        // Update local storage status & completed tx hash
        try {
          localStorage.setItem(`arc_completed_tx_${jobId}`, txHash);
          const localSub = {
            fileUrl,
            fileName,
            status: "Approved",
            result: `Escrow payment released manually by buyer. Tx Hash: ${txHash}`
          };
          localStorage.setItem(`arc_web_submission_${jobId}`, JSON.stringify(localSub));
        } catch (err) {}

        refetch();
        alert(`Payment released successfully!\nTransaction Hash: ${txHash}`);
      } else {
        // Delegate to bot backend (since evaluator is the bot address)
        // Try writing directly to Supabase first to keep records in sync
        if (hasSupabase) {
          try {
            await supabase.from("escrow_submissions").upsert({
              job_id: Number(jobId),
              buyer_authorized: true,
              status: "Approved",
              result: "Escrow payment released manually by buyer.",
              file_url: fileUrl || "",
              file_name: fileName || "",
              source: "web"
            });
            console.log("Manual release authorization saved to Supabase.");
          } catch (err) {
            console.error("Failed to save manual release authorization to Supabase:", err);
          }
        }

        // Call the bot gateway API route to execute the transaction on-chain
        const res = await fetch("/api/escrow-release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: Number(jobId),
            buyerAddress: address
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to release escrow payment.");
        }
        
        if (data.txHash) {
          try {
            localStorage.setItem(`arc_completed_tx_${jobId}`, data.txHash);
          } catch (err) {}
        }
        alert(`Payment released successfully via bot gateway!\nTransaction Hash: ${data.txHash}`);

        // Update local storage status
        try {
          const localSub = {
            fileUrl,
            fileName,
            status: "Approved",
            result: "Escrow payment released manually by buyer."
          };
          localStorage.setItem(`arc_web_submission_${jobId}`, JSON.stringify(localSub));
        } catch (err) {}

        refetch();
      }
    } catch (err: any) {
      alert(`Payout failed: ${err.message || err}`);
    } finally {
      setIsReleasing(false);
    }
  };

  const handleDispute = async () => {
    try {
      const txHash = await writeContract(
        DEPLOYED_ESCROW_ADDRESS,
        escrowAbi,
        "dispute",
        [jobId]
      );
      console.log("Dispute registered:", txHash);
      refetch();
    } catch (err) {
      alert("Dispute registration failed!");
    }
  };

  const handleRefundExpired = async () => {
    setIsRefunding(true);
    try {
      const txHash = await writeContract(
        DEPLOYED_ESCROW_ADDRESS,
        escrowAbi,
        "refundExpired",
        [jobId]
      );
      await waitForReceipt(publicClient, txHash);
      alert(`Refund successful! Your USDC has been returned.\nTx: ${txHash}`);
      refetch();
    } catch (err: any) {
      alert(`Refund failed: ${err.message || err}`);
    } finally {
      setIsRefunding(false);
    }
  };

  const handleResolveDispute = async (resolution: number) => {
    try {
      await writeContract(
        DEPLOYED_ESCROW_ADDRESS,
        escrowAbi,
        "resolveDispute",
        [jobId, resolution]
      );
      refetch();
    } catch (err) {
      alert("Dispute resolution failed!");
    }
  };


  // Try to find a transaction hash in submission logs, API responses, or local storage
  const getTransactionHash = () => {
    try {
      const savedTx = localStorage.getItem(`arc_completed_tx_${jobId}`);
      if (savedTx) return savedTx;
    } catch (e) {}

    if (submission && submission.result) {
      const match = submission.result.match(/0x[a-fA-F0-9]{64}/);
      if (match) return match[0];
    }
    return null;
  };

  const txHashResolved = getTransactionHash();

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px 0" }}>
      <div className="glass-card" style={{ padding: "40px", display: "flex", flexDirection: "column", gap: "32px" }}>
        
        {/* Header Block */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "24px" }}>
          <div>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "Space Grotesk" }}>JOB ESCROW ID: #{id}</span>
            <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{description}</h1>
            {/* Expiry countdown */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
              <Clock size={13} style={{ color: status === 5 ? "var(--danger)" : "var(--text-muted)" }} />
              {status === 5 ? (
                <span style={{ fontSize: "0.8rem", color: "var(--danger)", fontWeight: 500 }}>Contract Expired</span>
              ) : timeLeft ? (
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Expires in {timeLeft}</span>
              ) : (
                <span style={{ fontSize: "0.8rem", color: "var(--danger)", fontWeight: 500 }}>Expired</span>
              )}
            </div>
          </div>
          <div className={`badge ${
            status === 3 ? "badge-success" : 
            status === 6 ? "badge-danger" : 
            status === 1 ? "badge-info" : "badge-warning"
          }`}>
            {status === 3 && <ShieldCheck size={14} />}
            {status === 6 && <ShieldAlert size={14} />}
            {statuses[status]}
          </div>
        </div>

        {/* Roles Dashboard */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Client / Buyer</span>
            <div style={{ fontFamily: "Space Grotesk", fontSize: "0.95rem", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>
              {client} {isClient && <span style={{ color: "var(--primary)" }}>(You)</span>}
            </div>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Seller / Provider</span>
            <div style={{ fontFamily: "Space Grotesk", fontSize: "0.95rem", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis" }}>
              {provider} {isProvider && <span style={{ color: "var(--secondary)" }}>(You)</span>}
            </div>
          </div>
        </div>

        {/* Budget detail */}
        <div style={{ textAlign: "center", padding: "24px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "16px" }}>
          <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            {budgetRaw === BigInt(0) && proposedBudget ? "Proposed Budget (Pending Confirmation)" : "Escrow Balance"}
          </span>
          <div style={{ fontSize: "2.8rem", fontWeight: 800, color: budgetRaw === BigInt(0) && proposedBudget ? "var(--warning)" : "var(--text-primary)", fontFamily: "Space Grotesk", marginTop: "4px" }}>
            {budgetRaw === BigInt(0) && proposedBudget ? proposedBudget : budget} <span style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--primary)" }}>USDC</span>
          </div>
        </div>

        {/* Transaction Hash */}
        {txHashResolved && (
          <div style={{
            background: "rgba(16, 185, 129, 0.03)",
            border: "1px solid rgba(16, 185, 129, 0.12)",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginTop: "-16px",
            textAlign: "left"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--success)", fontWeight: 600, fontSize: "0.95rem" }}>
              <ShieldCheck size={18} />
              <span>Escrow Transaction Confirmed</span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontFamily: "Space Grotesk", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Tx Hash: <a href={`https://testnet.arcscan.app/tx/${txHashResolved}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", textDecoration: "underline" }}>{txHashResolved}</a>
            </div>
          </div>
        )}

        {/* Deliverable Section & AI Watermark */}
        {status >= 1 && (
          <div className="glass-card" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 600 }}>Deliverable File & Preview</h3>
            
            {status === 1 && isProvider && (
              <div style={{ border: "2px dashed var(--border-color)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
                <input type="file" id="file" onChange={handleFileUpload} style={{ display: "none" }} />
                <label htmlFor="file" style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                  <Upload size={32} style={{ color: "var(--text-secondary)" }} />
                  <span>{isUploading ? "Uploading..." : "Click to select deliverable file"}</span>
                </label>
                {fileName && <p style={{ marginTop: "12px", fontSize: "0.9rem", color: "var(--primary)" }}>Selected: {fileName}</p>}
                
                {fileUrl && (
                  <div style={{ marginTop: "24px", padding: "12px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0px" }}>
                      File watermarked locally for preview. Send this file directly inside your Telegram chat captioning it with <code>#submit {id}</code> or trigger the verification scan directly below.
                    </p>
                    <button onClick={handleWebSubmit} className="btn-primary" disabled={isSubmitting} style={{ alignSelf: "center", minWidth: "160px", justifyContent: "center" }}>
                      {isSubmitting ? "Submitting..." : "Submit Deliverable"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Display Deliverable Image Preview with Watermark based on status */}
            {(fileUrl || status >= 2) && (
              <div style={{ position: "relative", width: "100%", height: "240px", background: "#161722", borderRadius: "12px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Simulated mockup image */}
                <img 
                  src={fileUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600"} 
                  alt="Deliverable" 
                  style={{ width: "100%", height: "100%", objectFit: "contain", filter: (status === 3 || submission?.status === "Approved") ? "none" : "blur(2px)" }}
                />

                {/* Watermark Overlay (removed when completed) */}
                {status !== 3 && submission?.status !== "Approved" && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(10, 11, 16, 0.7)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "20px",
                    textAlign: "center"
                  }}>
                    <span style={{
                      fontSize: "1.4rem",
                      fontWeight: 700,
                      color: "var(--accent)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      border: "2px solid var(--accent)",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      transform: "rotate(-10deg)",
                      boxShadow: "0 4px 12px rgba(239,68,68,0.2)"
                    }}>Arc Escrow Preview</span>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "16px", maxWidth: "300px" }}>
                      Locked in Escrow. Complete payment onchain to download the high-resolution vector original.
                    </p>
                  </div>
                )}
              </div>
            )}

            {submission && (
              <div style={{ marginTop: "16px", padding: "16px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "8px", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Verification Status:</span>
                  <span className={`badge ${
                    submission.status === "Approved" ? "badge-success" :
                    submission.status === "Rejected" ? "badge-danger" : "badge-warning"
                  }`}>
                    {submission.status}
                  </span>
                </div>
                {submission.fileName && (
                  <p style={{ fontSize: "0.9rem", margin: 0 }}>
                    📁 Submitted File: <b>{submission.fileName}</b>
                  </p>
                )}
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0, fontStyle: "italic" }}>
                  🤖 AI Agent Logs: {submission.result}
                </p>
              </div>
            )}
            {(status === 3 || submission?.status === "Approved") && isClient && (
              <a href={fileUrl || "#"} download={fileName || "deliverable.svg"} className="btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "16px" }}>
                <Download size={18} /> Download Original Deliverable
              </a>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* SELLER negotiation counter-offer view */}
          {isProvider && status === 0 && isNegotiationActive && (
            <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <DollarSign size={20} style={{ color: "var(--warning)" }} />
                <span style={{ fontWeight: 600, fontSize: "1.05rem", color: "var(--warning)" }}>Buyer Proposed Counter-Offer</span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                The buyer proposed a counter-offer of <b style={{ color: "var(--warning)" }}>{counterOfferAmount} USDC</b> instead of your quoted price.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <button
                  onClick={() => handleSetBudget(counterOfferAmount)}
                  className="btn-primary"
                  disabled={isSettingBudget}
                  style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)", borderColor: "#10B981", justifyContent: "center" }}
                >
                  {isSettingBudget ? "Accepting..." : `Accept & Set Price to ${counterOfferAmount} USDC`}
                </button>
                <button
                  onClick={async () => {
                    const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                    if (hasSupabase) {
                      try {
                        await supabase.from("escrow_submissions").upsert({
                          job_id: Number(jobId),
                          status: "Negotiation",
                          result: "rejected",
                          file_url: "",
                          file_name: "",
                          source: "web"
                        });
                      } catch (err) {}
                    }
                    try {
                      localStorage.setItem(`arc_negotiation_${jobId}`, "rejected");
                      setLocalCounterOffer("rejected");
                    } catch (err) {}
                    await fetchSubmission();
                  }}
                  className="btn-secondary"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)", justifyContent: "center" }}
                >
                  Decline Counter-Offer
                </button>
              </div>
            </div>
          )}

          {/* SELLER: Set / Update Budget — shown whenever job is Open */}
          {isProvider && status === 0 && !isNegotiationActive && (
            <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <DollarSign size={20} style={{ color: "var(--primary)" }} />
                <span style={{ fontWeight: 600, fontSize: "1.05rem" }}>
                  {budgetRaw === BigInt(0) ? "Set Your Budget (Seller Action)" : "Update Budget"}
                </span>
                {budgetRaw > BigInt(0) && (
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                    Currently: <b style={{ color: "var(--primary)" }}>{budget} USDC</b>
                  </span>
                )}
              </div>
              
              {counterOfferAmount === "rejected" && (
                <p style={{ color: "var(--danger)", fontSize: "0.85rem", fontWeight: 500, margin: 0 }}>
                  ⚠️ The buyer has rejected your previous budget quote. Propose a renegotiated price below:
                </p>
              )}

              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                {budgetRaw === BigInt(0)
                  ? "The buyer is waiting for you to confirm your price. Enter the USDC amount you want to charge."
                  : "You can update your quoted price as long as the buyer has not funded the escrow yet."}
              </p>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="number"
                  placeholder={budgetRaw > BigInt(0) ? `New amount (currently ${budget})` : "Amount in USDC"}
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => handleSetBudget()}
                  className="btn-primary"
                  disabled={isSettingBudget || !budgetInput}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {isSettingBudget ? "Confirming..." : budgetRaw === BigInt(0) ? "Confirm Budget" : "Update Budget"}
                </button>
              </div>
            </div>
          )}


          {/* BUYER waiting for counter-offer review */}
          {isClient && status === 0 && isNegotiationActive && (
            <div style={{ background: "rgba(245, 158, 11, 0.05)", border: "1px solid rgba(245, 158, 11, 0.15)", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, color: "var(--warning)" }}>
                <RefreshCw className="animate-spin" size={16} />
                <span>Counter-Offer Proposed</span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0, lineHeight: 1.4 }}>
                You have proposed a counter-offer of <b>{counterOfferAmount} USDC</b>. Waiting for the seller to accept or update their budget.
              </p>
              <button
                onClick={async () => {
                  const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
                  if (hasSupabase) {
                    try {
                      await supabase.from("escrow_submissions").delete().eq("job_id", Number(jobId));
                    } catch (err) {}
                  }
                  try {
                    localStorage.removeItem(`arc_negotiation_${jobId}`);
                    setLocalCounterOffer(null);
                  } catch (err) {}
                  await fetchSubmission();
                }}
                className="btn-secondary"
                style={{ fontSize: "0.8rem", padding: "6px 12px", alignSelf: "flex-start" }}
              >
                Cancel Counter-Offer
              </button>
            </div>
          )}

          {/* BUYER waiting for budget setup */}
          {isClient && status === 0 && budgetRaw === BigInt(0) && !isNegotiationActive && (
            <div style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "var(--text-secondary)", fontSize: "0.9rem", textAlign: "center" }}>
              {proposedBudget 
                ? `Waiting for the seller to confirm or adjust your proposed budget of ${proposedBudget} USDC.`
                : "Waiting for the seller to propose and set the budget."
              }
            </div>
          )}

          {isClient && status === 0 && budgetRaw > BigInt(0) && !isNegotiationActive && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              
              {counterOfferAmount === "rejected" && (
                <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "12px", padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
                  <AlertCircle size={20} style={{ color: "var(--danger)" }} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--danger)", display: "block" }}>Counter-Offer Declined</span>
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "2px", display: "block" }}>
                      The seller has declined your previous counter-offer. You can deposit at the seller's price or propose a new counter-offer below.
                    </span>
                  </div>
                </div>
              )}

              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Wallet size={20} style={{ color: "var(--primary)" }} />
                  <span style={{ fontWeight: 600, fontSize: "1.05rem" }}>Fund Escrow (Buyer Action)</span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                  The seller has set the budget at <b>{budget} USDC</b>. Approve and deposit to activate the escrow.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
                  <button
                    onClick={handleApproveAndFund}
                    className="btn-primary"
                    disabled={isFunding}
                    style={{ justifyContent: "center" }}
                  >
                    {isFunding ? "Processing..." : `Approve & Deposit ${budget} USDC`}
                  </button>
                  <button
                    onClick={handleRejectBudget}
                    className="btn-secondary"
                    style={{ borderColor: "var(--danger)", color: "var(--danger)", justifyContent: "center" }}
                  >
                    Reject Price
                  </button>
                </div>
              </div>

              {/* Counter-Offer Negotiation Input Box */}
              <div style={{ background: "rgba(245, 158, 11, 0.03)", border: "1px solid rgba(245, 158, 11, 0.12)", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--warning)" }}>Propose a Counter-Offer</span>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>
                  If the budget is too high, propose a counter-offer below. The seller will be notified to accept or adjust their budget.
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="number"
                    placeholder="Proposed budget in USDC"
                    value={counterOfferInput}
                    onChange={(e) => setCounterOfferInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={handleProposeCounterOffer}
                    className="btn-primary"
                    disabled={isCounterOffering || !counterOfferInput}
                    style={{ whiteSpace: "nowrap", background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)", borderColor: "#F59E0B" }}
                  >
                    {isCounterOffering ? "Proposing..." : "Propose Price"}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* Waiting state — budget not set, viewer is neither client nor provider */}
          {!isProvider && !isClient && status === 0 && budgetRaw === BigInt(0) && (
            <div style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "var(--text-secondary)", fontSize: "0.9rem", textAlign: "center" }}>
              Waiting for the seller to set their budget before the buyer can fund this escrow.
            </div>
          )}

          {/* Waiting state — budget set but viewer is client and not yet funded */}
          {isProvider && status === 0 && budgetRaw > BigInt(0) && !isNegotiationActive && (
            <div style={{ padding: "14px 16px", background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "8px", color: "var(--success)", fontSize: "0.9rem" }}>
              ✅ Budget set to <b>{budget} USDC</b>. Waiting for the buyer to approve and fund the escrow.
            </div>
          )}


          
          {submission?.status === "Approved" && status !== 3 ? (
            <div style={{ 
              padding: "16px", 
              background: "rgba(16, 185, 129, 0.08)", 
              border: "1px solid rgba(16, 185, 129, 0.2)", 
              borderRadius: "12px", 
              color: "var(--success)", 
              fontSize: "0.95rem",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}>
              <div style={{ fontWeight: 600 }}>⏳ Payout Release Authorized!</div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                The AI Agent evaluator / arbitrator is broadcasting the transaction to release funds on the Arc network.
              </div>
            </div>
          ) : (status === 1 || status === 2) && isClient && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button onClick={handleComplete} className="btn-primary" disabled={isReleasing} style={{ justifyContent: "center" }}>
                {isReleasing ? "Releasing Payout..." : "Approve & Release Payment"}
              </button>
              <button onClick={handleDispute} className="btn-secondary" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                File Dispute
              </button>
            </div>
          )}

          {/* Expired state — buyer can claim refund */}
          {status === 5 && isClient && (
            <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "12px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--danger)", fontWeight: 600 }}>
                <Clock size={20} />
                <span>Escrow Expired</span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.4 }}>
                This escrow has expired without completion. You can claim back your <b>{budget} USDC</b>.
              </p>
              <button
                onClick={handleRefundExpired}
                className="btn-primary"
                disabled={isRefunding}
                style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", borderColor: "#ef4444", justifyContent: "center" }}
              >
                {isRefunding ? "Processing Refund..." : `💸 Claim ${budget} USDC Refund`}
              </button>
            </div>
          )}

          {status === 6 && (
            <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "12px", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--danger)", fontWeight: 600 }}>
                <AlertCircle size={20} />
                <span>Job Disputed</span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "8px", lineHeight: 1.4 }}>
                This transaction has been frozen. The designated AI Agent arbitrator (@evaluator) is analyzing the chat logs and submission file to resolve the payout.
              </p>

              {isEvaluator && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 500 }}>Arbitrator Verdict Options:</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                    <button onClick={() => handleResolveDispute(0)} className="btn-secondary" style={{ color: "var(--danger)" }}>Refund Buyer</button>
                    <button onClick={() => handleResolveDispute(1)} className="btn-secondary" style={{ color: "var(--success)" }}>Pay Seller</button>
                    <button onClick={() => handleResolveDispute(2)} className="btn-secondary">50/50 Split</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {toast && (
          <div style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: toast.type === "error" ? "rgba(220, 38, 38, 0.95)" : "rgba(5, 150, 105, 0.95)",
            color: "#fff",
            padding: "16px 24px",
            borderRadius: "12px",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.3)",
            fontSize: "0.95rem",
            fontWeight: 500,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            maxWidth: "380px",
            backdropFilter: "blur(8px)",
            border: toast.type === "error" ? "1px solid rgba(220, 38, 38, 0.2)" : "1px solid rgba(5, 150, 105, 0.2)",
            transition: "all 0.2s ease"
          }}>
            {toast.type === "error" ? <AlertCircle size={20} /> : <ShieldCheck size={20} />}
            <span>{toast.message}</span>
          </div>
        )}

      </div>
    </div>
  );
}
