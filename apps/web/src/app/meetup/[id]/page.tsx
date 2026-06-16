"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatUnits, keccak256, toHex } from "viem";
import { escrowAbi, DEPLOYED_ESCROW_ADDRESS } from "@/lib/contracts";
import { ARC_MIN_GAS_PRICE } from "@/lib/wagmi";
import { QrCode, Camera, ShieldCheck, AlertCircle, Copy, Check } from "lucide-react";
import confetti from "canvas-confetti";
import { supabase } from "@/lib/supabase";

export default function MeetupDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const jobId = BigInt(id as string);

  const [copied, setCopied] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [isTxPending, setIsTxPending] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [secretConfirmationCode, setSecretConfirmationCode] = useState("laptop-received");
  const [submission, setSubmission] = useState<{ fileUrl: string; fileName: string; status: string; result: string } | null>(null);

  const { writeContractAsync } = useWriteContract();

  // Read Job Details from contract
  const { data: jobRaw, refetch } = useReadContract({
    address: DEPLOYED_ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "jobs",
    args: [jobId],
  });

  // Redirect back to escrow detail page if this is a digital escrow OR it's not funded yet
  useEffect(() => {
    if (jobRaw) {
      const qrHash = jobRaw[10];
      const isPhysical = qrHash && qrHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";
      const status = jobRaw[7];
      if (!isPhysical || status === 0) {
        router.replace(`/escrow/${id}`);
      }
    }
  }, [jobRaw, id, router]);

  const fetchSubmission = async () => {
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
          if (data.file_name === "meetup_code" && data.file_url) {
            setSecretConfirmationCode(data.file_url);
          }
          return;
        }
      } catch (err) {
        console.error("Failed to fetch submission from Supabase:", err);
      }
    }

    // LocalStorage Fallback for code
    try {
      const localCode = localStorage.getItem(`arc_physical_code_${jobId}`);
      if (localCode) {
        setSecretConfirmationCode(localCode);
      }
    } catch (err) {
      console.warn("Failed to read local physical code cache:", err);
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
          .channel(`meetup_submission_${jobId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "escrow_submissions",
              filter: `job_id=eq.${jobId}`,
            },
            (payload) => {
              if (payload.new) {
                const newRow = payload.new as any;
                setSubmission({
                  fileUrl: newRow.file_url,
                  fileName: newRow.file_name,
                  status: newRow.status,
                  result: newRow.result,
                });
                if (newRow.file_name === "meetup_code" && newRow.file_url) {
                   setSecretConfirmationCode(newRow.file_url);
                }
                refetch();
              }
            }
          )
          .subscribe();
      } catch (err) {}
    }

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
  }, [jobRaw, jobId]);

  if (!jobRaw) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-secondary)" }}>
        Loading meetup contract details...
      </div>
    );
  }

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
  ] = jobRaw;

  const budget = formatUnits(budgetRaw, 6);
  const isClient = address?.toLowerCase() === client.toLowerCase();
  const isProvider = address?.toLowerCase() === provider.toLowerCase();

  const handleCopyCode = () => {
    navigator.clipboard.writeText(secretConfirmationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQrRelease = async (codeToSubmit: string) => {
    setIsTxPending(true);
    try {
      const txHash = await writeContractAsync({
        address: DEPLOYED_ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "qrRelease",
        args: [jobId, codeToSubmit],
        gasPrice: ARC_MIN_GAS_PRICE,
      });

      try {
        localStorage.setItem(`arc_completed_tx_${jobId}`, txHash);
      } catch (e) {}

      confetti({
        particleCount: 100,
        spread: 60,
        origin: { y: 0.6 }
      });
      refetch();
      alert(`Payment released successfully!\nTransaction Hash: ${txHash}`);
    } catch (err) {
      alert("Invalid verification code or transaction failed!");
    } finally {
      setIsTxPending(false);
    }
  };

  const simulateCameraScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      handleQrRelease(secretConfirmationCode);
    }, 2500); // Simulate scanning duration
  };

  const handleComplete = async () => {
    setIsReleasing(true);
    try {
      const hasSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Check if buyer IS the arbitrator/evaluator onchain (e.g. self-testing / custom arbitrator)
      if (evaluator.toLowerCase() === address?.toLowerCase()) {
        const reasonHash = keccak256(toHex("buyer_manual_approved"));
        const txHash = await writeContractAsync({
          address: DEPLOYED_ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "complete",
          args: [jobId, reasonHash, "0x"],
          gasPrice: ARC_MIN_GAS_PRICE,
        });
        
        const publicClient = (await import("viem")).createPublicClient({
          chain: {
            id: 5042002,
            name: "Arc Testnet",
            nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
            rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } }
          } as any,
          transport: (await import("viem")).http()
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });

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

        try {
          localStorage.setItem(`arc_completed_tx_${jobId}`, txHash);
        } catch (e) {}

        refetch();
        alert(`Payment released successfully!\nTransaction Hash: ${txHash}`);
      } else {
        // Delegate to bot backend (since evaluator is the bot address)
        let releasedViaDb = false;

        // Try writing directly to Supabase to trigger bot realtime payout
        if (hasSupabase) {
          try {
            const { error: dbErr } = await supabase.from("escrow_submissions").upsert({
              job_id: Number(jobId),
              buyer_authorized: true,
              status: "Approved",
              result: "Escrow payment released manually by buyer.",
              file_url: secretConfirmationCode || "",
              file_name: "meetup_code",
              source: "web"
            });
            if (!dbErr) {
              releasedViaDb = true;
              console.log("Manual release authorization saved to Supabase.");
            }
          } catch (err) {
            console.error("Failed to save manual release authorization to Supabase:", err);
          }
        }

        if (!releasedViaDb) {
          // Fall back to Express API endpoint Proxy
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
        } else {
          alert("Payment release authorized! Payout transaction is being broadcasted by the AI Agent.");
        }
        refetch();
      }
    } catch (err: any) {
      alert(`Payout failed: ${err.message || err}`);
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "20px 0" }}>
      <div className="glass-card" style={{ padding: "40px", display: "flex", flexDirection: "column", gap: "32px", textAlign: "center" }}>
        
        {/* Title */}
        <div>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "Space Grotesk" }}>PHYSICAL MEETUP ESCROW: #{id}</span>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: "4px" }}>{description}</h1>
          <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)", marginTop: "8px", fontFamily: "Space Grotesk" }}>{budget} USDC</p>
        </div>

        {status === 3 ? (
          /* Completed State */
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", alignItems: "center" }}>
            <div style={{
              background: "rgba(16, 185, 129, 0.1)",
              color: "var(--success)",
              width: "70px",
              height: "70px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <ShieldCheck size={38} />
            </div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Meetup Successfully Settle!</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.4 }}>
              Funds have been transferred to the seller on the Arc network. You are safe to part ways.
            </p>
            
            {/* Transaction Hash */}
            {(() => {
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

              const txHash = getTransactionHash();
              if (!txHash) return null;

              return (
                <div style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "12px 16px",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: "8px"
                }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Transaction Hash</span>
                  <div style={{ fontFamily: "Space Grotesk", fontSize: "0.85rem", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", textDecoration: "underline" }}>
                      {txHash}
                    </a>
                  </div>
                </div>
              );
            })()}

            <button onClick={() => router.push("/")} className="btn-secondary" style={{ width: "100%" }}>
              Back to Dashboard
            </button>
          </div>
        ) : (
          /* Active Escrow State */
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            
            {/* Buyer View (Displays QR Code) */}
            {isClient && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
                <div style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--border-color)", padding: "16px", borderRadius: "12px", display: "inline-block" }}>
                  {/* Google Charts QR API generating a code for the confirmation value */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(secretConfirmationCode)}`}
                    alt="Release QR Code"
                    style={{ background: "white", padding: "8px", borderRadius: "8px" }}
                  />
                </div>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Show this QR Code to Seller</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px", maxWidth: "340px", margin: "4px auto 0" }}>
                    Once you inspect the item in person and are fully satisfied, let the seller scan this code to release the USDC instantly.
                  </p>
                </div>
                
                {/* Manual Code Fallback */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "8px 16px" }}>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Backup Code:</span>
                  <code style={{ fontFamily: "Space Grotesk", color: "var(--primary)" }}>{secretConfirmationCode}</code>
                  <button onClick={handleCopyCode} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}>
                    {copied ? <Check size={14} style={{ color: "var(--success)" }} /> : <Copy size={14} />}
                  </button>
                </div>

                {/* Direct Release Button */}
                <button
                  onClick={handleComplete}
                  className="btn-primary"
                  disabled={isReleasing}
                  style={{ width: "100%", justifyContent: "center", marginTop: "12px", background: "linear-gradient(135deg, #10B981 0%, #059669 100%)", borderColor: "#10B981" }}
                >
                  {isReleasing ? "Releasing Payout..." : "Approve & Release Funds Directly"}
                </button>
              </div>
            )}

            {/* Seller View (Scans QR Code) */}
            {isProvider && (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                
                {isScanning ? (
                  <div style={{ border: "2px dashed var(--secondary)", borderRadius: "16px", padding: "60px 20px", background: "rgba(168, 85, 247, 0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
                    <Camera className="animate-pulse" size={32} style={{ color: "var(--secondary)" }} />
                    <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--secondary)" }}>Initializing Camera Scan...</span>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", maxWidth: "240px" }}>Simulating optical QR alignment. Keep screen facing the camera.</p>
                  </div>
                ) : (
                  <button onClick={simulateCameraScan} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "16px" }}>
                    <Camera size={20} /> Scan Buyer's QR Code
                  </button>
                )}

                <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", margin: "10px 0" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, height: "1px", background: "var(--border-color)" }}></div>
                  <span style={{ position: "relative", background: "var(--bg-card)", padding: "0 12px", color: "var(--text-muted)", fontSize: "0.85rem" }}>OR ENTER BACKUP CODE</span>
                </div>

                {/* Manual input form */}
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="text"
                    placeholder="Enter backup confirmation code"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => handleQrRelease(manualCode)}
                    className="btn-secondary"
                    disabled={isTxPending || !manualCode}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Release USDC
                  </button>
                </div>

                <div style={{ display: "flex", gap: "10px", background: "rgba(245, 158, 11, 0.05)", border: "1px solid rgba(245, 158, 11, 0.15)", borderRadius: "8px", padding: "12px", textAlign: "left" }}>
                  <AlertCircle size={18} style={{ color: "var(--warning)", flexShrink: 0, marginTop: "2px" }} />
                  <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Do not hand over the physical item until this page shows <b>Settle!</b>. Payout is processed instantly using Arc's deterministic finality.
                  </p>
                </div>

              </div>
            )}

            {/* Non-participants view */}
            {!isClient && !isProvider && (
              <div style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                Connect your wallet as either the Buyer or Seller to access the meetup QR code controls.
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}
