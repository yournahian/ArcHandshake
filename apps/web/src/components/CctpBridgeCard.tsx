"use client";

/**
 * CctpBridgeCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Full Circle CCTP V2 cross-chain USDC bridge UI.
 * Steps: Approve → Burn → Attest (poll) → Mint → Done
 *
 * Uses wagmi v2 for wallet interactions (already configured in the project).
 * Requires a MetaMask / injected EVM wallet to be connected.
 */

import React, { useState, useCallback, useEffect } from "react";
import { 
  decodeEventLog, keccak256, parseUnits, formatUnits,
  createWalletClient, createPublicClient, custom, http
} from "viem";
import { waitForReceipt } from "@/lib/utils";
import {
  CCTP_CHAINS, CCTP_CHAIN_KEYS,
  USDC_ABI, TOKEN_MESSENGER_ABI, MESSAGE_TRANSMITTER_ABI, MESSAGE_SENT_EVENT_ABI,
  addressToBytes32,
  type CctpChain,
} from "@/lib/cctp";
import {
  GitMerge, ArrowRight, CheckCircle, Loader2, AlertCircle,
  ExternalLink, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type BridgeStep = "idle" | "approving" | "burning" | "attesting" | "minting" | "done" | "error";

const STEP_LABELS: Record<BridgeStep, string> = {
  idle:      "Ready",
  approving: "Approving USDC…",
  burning:   "Burning on source chain…",
  attesting: "Waiting for Circle attestation…",
  minting:   "Minting on destination chain…",
  done:      "Bridge complete!",
  error:     "Error",
};

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { key: BridgeStep; label: string }[] = [
  { key: "approving", label: "Approve" },
  { key: "burning",   label: "Burn" },
  { key: "attesting", label: "Attest" },
  { key: "minting",   label: "Mint" },
];

function StepTracker({ current }: { current: BridgeStep }) {
  const activeIdx = STEPS.findIndex(s => s.key === current);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0", marginBottom: "20px" }}>
      {STEPS.map((s, i) => {
        const done    = activeIdx > i;
        const active  = activeIdx === i;
        const pending = activeIdx < i;
        return (
          <React.Fragment key={s.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", flex: 1 }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? "#10b981" : active ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "rgba(255,255,255,0.07)",
                border: `2px solid ${done ? "#10b981" : active ? "#f59e0b" : "rgba(255,255,255,0.12)"}`,
                fontSize: "0.7rem", fontWeight: 700, color: done || active ? "#fff" : "var(--text-muted,#666)",
                transition: "all 0.3s",
              }}>
                {done ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: "0.62rem", color: active ? "#f59e0b" : done ? "#10b981" : "var(--text-muted,#666)", fontWeight: active || done ? 600 : 400 }}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: "2px", background: done ? "#10b981" : "rgba(255,255,255,0.07)", transition: "background 0.3s", marginBottom: "18px" }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Chain Selector ───────────────────────────────────────────────────────────

export function ChainIcon({ chainKey, size = 16 }: { chainKey: string; size?: number }) {
  if (chainKey === "eth-sepolia") {
    return (
      <svg viewBox="0 0 784 1277" width={size} height={size} style={{ flexShrink: 0 }}>
        <path d="M392 0L383.5 28.5V870.5L392 879L784 648L392 0Z" fill="#a4b3f6"/>
        <path d="M392 0L0 648L392 879V470V0Z" fill="#758bfd"/>
        <path d="M392 956L387 962V1271.5L392 1277L784 726L392 956Z" fill="#a4b3f6"/>
        <path d="M392 1277V956L0 726L392 1277Z" fill="#758bfd"/>
        <path d="M392 879L784 648L392 531.5V879Z" fill="#3f5efb"/>
        <path d="M0 648L392 879V531.5L0 648Z" fill="#5c7aff"/>
      </svg>
    );
  }
  if (chainKey === "base-sepolia") {
    return (
      <svg viewBox="0 0 240 240" width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx="120" cy="120" r="110" fill="#0052FF"/>
        <circle cx="120" cy="120" r="70" stroke="#fff" strokeWidth="22" fill="none"/>
        <path d="M120 50h80" stroke="#fff" strokeWidth="22" strokeLinecap="round"/>
      </svg>
    );
  }
  if (chainKey === "avax-fuji") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }}>
        <path d="M12 2L1.5 20h21L12 2zm0 4L18.5 17h-13L12 6z" fill="#e84142" />
      </svg>
    );
  }
  if (chainKey === "arbitrum-sepolia") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }}>
        <path d="M12 2.5L2 19.5h20L12 2.5zm0 5.2l5.7 9.8H6.3L12 7.7z" fill="#28A0F0" />
      </svg>
    );
  }
  if (chainKey === "arc-testnet") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M3 20A9 9 0 0112 11A9 9 0 0121 20" />
        <circle cx="12" cy="7" r="1.5" fill="#f59e0b" />
      </svg>
    );
  }
  return null;
}

function ChainSelect({ label, value, onChange, exclude }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  exclude?: string;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "0.75rem", color: "var(--text-muted,#888)", fontWeight: 600 }}>{label}</label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: "12px", display: "flex", alignItems: "center", pointerEvents: "none" }}>
          <ChainIcon chainKey={value} size={16} />
        </div>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 24px 10px 36px",
            borderRadius: "10px",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0", fontSize: "0.85rem", cursor: "pointer", outline: "none",
            appearance: "none", WebkitAppearance: "none",
          }}
        >
          {CCTP_CHAIN_KEYS.filter(k => k !== exclude).map(key => (
            <option key={key} value={key} style={{ background: "#0d0d0d", color: "#fff" }}>
              {CCTP_CHAINS[key].emoji} {CCTP_CHAINS[key].shortName}
            </option>
          ))}
        </select>
        <div style={{ position: "absolute", right: "12px", pointerEvents: "none", fontSize: "0.7rem", color: "var(--text-muted,#888)" }}>
          ▼
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  onBack?: () => void;
  circleWalletAddress?: string;
  executeContractCall?: (params: {
    contractAddress: string;
    abiFunctionSignature: string;
    abiParameters: { type: string; value: string }[];
    amount?: string;
  }) => Promise<string>;
}

export function CctpBridgeCard({ onBack, circleWalletAddress, executeContractCall }: Props) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const [bridgeToCircleWallet, setBridgeToCircleWallet] = useState(!!circleWalletAddress);
  const [srcKey, setSrcKey]   = useState("eth-sepolia");
  const [dstKey, setDstKey]   = useState("base-sepolia");

  useEffect(() => {
    if (circleWalletAddress) {
      setBridgeToCircleWallet(true);
    }
  }, [circleWalletAddress]);

  const [amount, setAmount]   = useState("");
  const [step, setStep]       = useState<BridgeStep>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg]   = useState("");
  const [burnTxHash, setBurnTxHash] = useState<`0x${string}` | null>(null);
  const [dstTxHash, setDstTxHash]   = useState<`0x${string}` | null>(null);

  const [srcBalance, setSrcBalance] = useState<string>("0.00");
  const [dstBalance, setDstBalance] = useState<string>("0.00");
  const [loadingBalances, setLoadingBalances] = useState<boolean>(false);

  const srcChain = CCTP_CHAINS[srcKey];
  const dstChain = CCTP_CHAINS[bridgeToCircleWallet ? "arc-testnet" : dstKey];

  // Connect to MetaMask / injected wallet
  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setErrorMsg("MetaMask or compatible injected wallet not found.");
      return;
    }
    try {
      const provider = (window as any).ethereum;
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const currentChainId = await provider.request({ method: "eth_chainId" });
      setAddress(accounts[0] as `0x${string}`);
      setChainId(parseInt(currentChainId, 16));
      setErrorMsg("");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to connect wallet.");
    }
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const provider = (window as any).ethereum;

    const handleAccounts = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0] as `0x${string}`);
      } else {
        setAddress(null);
      }
    };

    const handleChain = (hexId: string) => {
      setChainId(parseInt(hexId, 16));
    };

    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);

    // Initial check
    provider.request({ method: "eth_accounts" }).then((accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0] as `0x${string}`);
      }
    });
    provider.request({ method: "eth_chainId" }).then((hexId: string) => {
      setChainId(parseInt(hexId, 16));
    });

    return () => {
      if (provider.removeListener) {
        provider.removeListener("accountsChanged", handleAccounts);
        provider.removeListener("chainChanged", handleChain);
      }
    };
  }, []);

  // ── Fetch USDC balances for each chain ──────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!address) return;
    setLoadingBalances(true);
    try {
      // 1. Fetch Source Balance
      const publicClientSrc = createPublicClient({
        chain: {
          id: srcChain.id,
          name: srcChain.name,
          nativeCurrency: srcChain.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [srcChain.rpcUrl] } },
        } as any,
        transport: http(srcChain.rpcUrl),
      });
      const balSrc = await publicClientSrc.readContract({
        address: srcChain.usdc,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [address],
      });
      setSrcBalance(parseFloat(formatUnits(balSrc as bigint, 6)).toFixed(2));

      // 2. Fetch Destination Balance
      const targetDestAddress = bridgeToCircleWallet ? circleWalletAddress : address;
      if (targetDestAddress) {
        const publicClientDst = createPublicClient({
          chain: {
            id: dstChain.id,
            name: dstChain.name,
            nativeCurrency: dstChain.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [dstChain.rpcUrl] } },
          } as any,
          transport: http(dstChain.rpcUrl),
        });
        const balDst = await publicClientDst.readContract({
          address: dstChain.usdc,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [targetDestAddress as `0x${string}`],
        });
        setDstBalance(parseFloat(formatUnits(balDst as bigint, 6)).toFixed(2));
      }
    } catch (e) {
      console.warn("Error fetching bridge balances:", e);
    } finally {
      setLoadingBalances(false);
    }
  }, [address, srcChain, dstChain, bridgeToCircleWallet, circleWalletAddress]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Helper to switch chains
  const switchChain = useCallback(async (targetChainId: number) => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const provider = (window as any).ethereum;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
      setChainId(targetChainId);
    } catch (err: any) {
      if (err.code === 4902) {
        const targetChain = Object.values(CCTP_CHAINS).find(c => c.id === targetChainId);
        if (targetChain) {
          const nativeCurrency = targetChain.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 };
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${targetChainId.toString(16)}`,
                chainName: targetChain.name,
                nativeCurrency,
                rpcUrls: [targetChain.rpcUrl],
                blockExplorerUrls: [targetChain.explorerUrl],
              },
            ],
          });
          setChainId(targetChainId);
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }, []);

  // ── Poll IRIS until attestation is complete ──────────────────────────────
  const pollAttestation = useCallback(async (txHash: `0x${string}`, customSourceDomain?: number): Promise<{ attestation: string, messageBytes: string, sourceDomain?: number }> => {
    const queryDomain = customSourceDomain !== undefined ? customSourceDomain : srcChain.domainId;
    const MAX_POLLS = 240; // 20 min max to accommodate high Sandbox indexing traffic
    for (let i = 0; i < MAX_POLLS; i++) {
      const displayStatus = i === 0 ? "Checking…" : "Polling…";
      setStatusMsg(`Waiting for Circle attestation... (Attempt ${i + 1}/${MAX_POLLS}). Status: ${displayStatus} (Note: Sandbox indexing can take 3-15 minutes depending on network traffic)`);
      
      try {
        const res = await fetch(`/api/circle/cctp/attestation?sourceDomain=${queryDomain}&txHash=${txHash}`);
        const data = await res.json();
        
        console.log("[CCTP pollAttestation]", data);
        
        if (data?.error) {
          setStatusMsg(`Waiting for Circle attestation... (Attempt ${i + 1}/${MAX_POLLS}). Error: ${data.error}`);
        } else if (data?.status) {
          setStatusMsg(`Waiting for Circle attestation... (Attempt ${i + 1}/${MAX_POLLS}). Status: ${data.status} (Note: Sandbox indexing can take 3-15 minutes depending on network traffic)`);
          if (data.status === "complete" && data.attestation && data.messageBytes) {
            return {
              attestation: data.attestation as string,
              messageBytes: data.messageBytes as string,
              sourceDomain: data.sourceDomain as number | undefined
            };
          }
        } else {
          setStatusMsg(`Waiting for Circle attestation... (Attempt ${i + 1}/${MAX_POLLS}). Status: Unknown response`);
        }
      } catch (err: any) {
        console.warn("Error calling attestation endpoint:", err);
        setStatusMsg(`Waiting for Circle attestation... (Attempt ${i + 1}/${MAX_POLLS}). Request failed`);
      }
      
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error("Attestation timed out after 20 minutes.");
  }, [srcChain.domainId]);

  // ── Main bridge flow ─────────────────────────────────────────────────────
  const handleBridge = useCallback(async () => {
    if (!address || !amount || typeof window === "undefined" || !(window as any).ethereum) return;
    setErrorMsg("");
    const amountUnits = parseUnits(amount, 6); // USDC has 6 decimals
    const provider = (window as any).ethereum;

    try {
      // ── Step 1: Approve ────────────────────────────────────────────────
      setStep("approving");
      setStatusMsg("Switching to source chain and approving USDC spend…");

      if (chainId !== srcChain.id) {
        await switchChain(srcChain.id);
      }

      const walletClientSrc = createWalletClient({
        account: address,
        chain: {
          id: srcChain.id,
          name: srcChain.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [srcChain.rpcUrl] } },
        } as any,
        transport: custom(provider),
      });

      const publicClientSrc = createPublicClient({
        chain: {
          id: srcChain.id,
          name: srcChain.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [srcChain.rpcUrl] } },
        } as any,
        transport: custom(provider),
      });

      const approveHash = await (walletClientSrc as any).writeContract({
        address: srcChain.usdc,
        abi: USDC_ABI,
        functionName: "approve",
        args: [srcChain.tokenMessenger, amountUnits],
        gas: BigInt(80000), // Prevent RPC gas limit inflation
      });

      setStatusMsg("Waiting for approval transaction to be confirmed…");
      const approveReceipt = await waitForReceipt(publicClientSrc, approveHash);
      if (approveReceipt.status !== "success") {
        throw new Error("USDC approval transaction failed.");
      }

      // ── Step 2: Burn ───────────────────────────────────────────────────
      setStep("burning");
      setStatusMsg("Burning USDC on source chain via Circle CCTP…");

      const targetRecipient = (bridgeToCircleWallet && circleWalletAddress) ? circleWalletAddress : address;
      const mintRecipient = addressToBytes32(targetRecipient as `0x${string}`) as `0x${string}`;
      const ZERO_BYTES32  = `0x${"0".repeat(64)}` as `0x${string}`;

      // Diagnostics check
      try {
        const bal = await publicClientSrc.readContract({
          address: srcChain.usdc,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [address],
        }) as bigint;
        
        const allowance = await publicClientSrc.readContract({
          address: srcChain.usdc,
          abi: USDC_ABI,
          functionName: "allowance",
          args: [address, srcChain.tokenMessenger],
        }) as bigint;

        const isSupported = await publicClientSrc.readContract({
          address: srcChain.tokenMessenger,
          abi: TOKEN_MESSENGER_ABI,
          functionName: "isSupportedDestinationDomain",
          args: [dstChain.domainId],
        }) as boolean;

        console.log("[CCTP Bridge Diagnostics]", {
          userAddress: address,
          amountNeeded: amountUnits.toString(),
          userBalance: bal.toString(),
          userAllowance: allowance.toString(),
          tokenMessenger: srcChain.tokenMessenger,
          usdcAddress: srcChain.usdc,
          destinationDomain: dstChain.domainId,
          isDestinationDomainSupported: isSupported,
        });

        if (bal < amountUnits) {
          throw new Error(`Insufficient USDC balance on source chain. You have ${formatUnits(bal, 6)} USDC, but need ${amount} USDC.`);
        }
        if (allowance < amountUnits) {
          throw new Error(`Allowance too low. Approved only ${formatUnits(allowance, 6)} USDC, but need ${amount} USDC.`);
        }
        if (!isSupported) {
          throw new Error(`Destination domain ${dstChain.domainId} (Arc Testnet) is not supported by the CCTP TokenMessenger on ${srcChain.name}.`);
        }
      } catch (diagErr: any) {
        if (
          diagErr.message.includes("Insufficient") || 
          diagErr.message.includes("Allowance too low") ||
          diagErr.message.includes("not supported by the CCTP TokenMessenger")
        ) {
          throw diagErr;
        }
        console.warn("Diagnostics check failed, continuing anyway:", diagErr);
      }

      // Contract Call Simulation
      try {
        await publicClientSrc.simulateContract({
          account: address,
          address: srcChain.tokenMessenger,
          abi: TOKEN_MESSENGER_ABI,
          functionName: "depositForBurn",
          args: [amountUnits, dstChain.domainId, mintRecipient, srcChain.usdc, ZERO_BYTES32, 0n, 1000],
        });
      } catch (simErr: any) {
        console.error("[CCTP Bridge Simulation Failed]", simErr);
        throw new Error(`Simulation failed: ${simErr.shortMessage || simErr.message}. Params: Amount=${amountUnits.toString()}, Domain=${dstChain.domainId}, Recipient=${mintRecipient}, USDC=${srcChain.usdc}, Messenger=${srcChain.tokenMessenger}`);
      }

      const burnHash = await (walletClientSrc as any).writeContract({
        address: srcChain.tokenMessenger,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurn",
        args: [amountUnits, dstChain.domainId, mintRecipient, srcChain.usdc, ZERO_BYTES32, 0n, 1000],
        gas: BigInt(250000), // Explicit override to bypass buggy RPC gas limit estimation
      });
      setBurnTxHash(burnHash);

      // Wait for burn tx to be mined
      setStatusMsg("Waiting for burn transaction to be confirmed…");
      const receipt = await waitForReceipt(publicClientSrc, burnHash);
      if (receipt.status !== "success") {
        const bal = await publicClientSrc.readContract({
          address: srcChain.usdc,
          abi: USDC_ABI,
          functionName: "balanceOf",
          args: [address],
        }) as bigint;
        const allowance = await publicClientSrc.readContract({
          address: srcChain.usdc,
          abi: USDC_ABI,
          functionName: "allowance",
          args: [address, srcChain.tokenMessenger],
        }) as bigint;
        throw new Error(`Burn transaction reverted on-chain. Diagnostics: Balance=${formatUnits(bal, 6)} USDC, Allowance=${formatUnits(allowance, 6)} USDC, Messenger=${srcChain.tokenMessenger}, Token=${srcChain.usdc}, Amount=${amount} USDC.`);
      }

      // ── Step 3: Attest ─────────────────────────────────────────────────
      setStep("attesting");
      setStatusMsg("Circle is attesting the burn message (~30s). Please wait…");
      const { attestation, messageBytes } = await pollAttestation(burnHash);

      // ── Step 4: Mint ───────────────────────────────────────────────────
      setStep("minting");

      if (bridgeToCircleWallet && dstChain.id === 5042002 && executeContractCall) {
        setStatusMsg("Minting USDC directly to your Circle Wallet on Arc Testnet. Please approve the PIN prompt…");
        const mintHash = await executeContractCall({
          contractAddress: dstChain.messageTransmitter,
          abiFunctionSignature: "receiveMessage(bytes,bytes)",
          abiParameters: [
            { type: "bytes", value: messageBytes },
            { type: "bytes", value: attestation },
          ],
        });
        setDstTxHash(mintHash as `0x${string}`);
      } else {
        setStatusMsg("Switching to destination chain to mint USDC…");
        // We must switch to the destination chain before creating the wallet client for the destination
        await switchChain(dstChain.id);

        const walletClientDst = createWalletClient({
          account: address,
          chain: {
            id: dstChain.id,
            name: dstChain.name,
            nativeCurrency: dstChain.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [dstChain.rpcUrl] } },
          } as any,
          transport: custom(provider),
        });

        const publicClientDst = createPublicClient({
          chain: {
            id: dstChain.id,
            name: dstChain.name,
            nativeCurrency: dstChain.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [dstChain.rpcUrl] } },
          } as any,
          transport: http(dstChain.rpcUrl),
        });

        setStatusMsg("Minting USDC on destination chain…");
        const mintHash = await (walletClientDst as any).writeContract({
          address: dstChain.messageTransmitter,
          abi: MESSAGE_TRANSMITTER_ABI,
          functionName: "receiveMessage",
          args: [messageBytes, attestation as `0x${string}`],
          gas: BigInt(350000), // Prevent RPC gas limit inflation during CCTP minting
        });
        setDstTxHash(mintHash);

        await waitForReceipt(publicClientDst, mintHash);
      }

      setStep("done");
      setStatusMsg("");
      fetchBalances();
    } catch (err: any) {
      console.error("[CCTP Bridge]", err);
      setStep("error");
      setErrorMsg(err.shortMessage || err.message || "Bridge failed. Please try again.");
    }
  }, [
    address,
    amount,
    chainId,
    srcChain,
    dstChain,
    pollAttestation,
    switchChain,
    bridgeToCircleWallet,
    circleWalletAddress,
    executeContractCall,
    fetchBalances,
    pollAttestation,
    switchChain,
    bridgeToCircleWallet,
    circleWalletAddress,
    executeContractCall,
    fetchBalances,
  ]);

  const handleResume = useCallback(async (hashToResume: `0x${string}`) => {
    if (!address || typeof window === "undefined" || !(window as any).ethereum) return;
    setErrorMsg("");
    setStep("burning");
    setStatusMsg("Resuming bridge transaction from burn hash…");
    const provider = (window as any).ethereum;

    try {
      setBurnTxHash(hashToResume);

      // Detect source domain from wallet's active chain
      let detectedDomain = srcChain.domainId;
      if (chainId) {
        const foundChain = Object.values(CCTP_CHAINS).find(c => c.id === chainId);
        if (foundChain) detectedDomain = foundChain.domainId;
      }

      // ── Step 3: Attest ─────────────────────────────────────────────────
      setStep("attesting");
      setStatusMsg("Circle is attesting the burn message (~30s). Please wait…");
      const { attestation, messageBytes, sourceDomain } = await pollAttestation(hashToResume, detectedDomain);

      // Automatically update source chain selection in UI if API returned the auto-detected source domain
      if (sourceDomain !== undefined) {
        const foundKey = Object.keys(CCTP_CHAINS).find(
          key => CCTP_CHAINS[key].domainId === sourceDomain
        );
        if (foundKey) {
          setSrcKey(foundKey);
        }
      }

      // ── Step 4: Mint ───────────────────────────────────────────────────
      setStep("minting");

      const publicClientDst = createPublicClient({
        chain: {
          id: dstChain.id,
          name: dstChain.name,
          nativeCurrency: dstChain.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [dstChain.rpcUrl] } },
        } as any,
        transport: http(dstChain.rpcUrl),
      });

      if (bridgeToCircleWallet && dstChain.id === 5042002 && executeContractCall) {
        setStatusMsg("Minting USDC directly to your Circle Wallet on Arc Testnet. Please approve the PIN prompt…");
        const mintHash = await executeContractCall({
          contractAddress: dstChain.messageTransmitter,
          abiFunctionSignature: "receiveMessage(bytes,bytes)",
          abiParameters: [
            { type: "bytes", value: messageBytes },
            { type: "bytes", value: attestation },
          ],
        });
        setDstTxHash(mintHash as `0x${string}`);
      } else {
        setStatusMsg("Switching to destination chain to mint USDC…");
        await switchChain(dstChain.id);

        const walletClientDst = createWalletClient({
          account: address,
          chain: {
            id: dstChain.id,
            name: dstChain.name,
            nativeCurrency: dstChain.nativeCurrency || { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [dstChain.rpcUrl] } },
          } as any,
          transport: custom(provider),
        });

        setStatusMsg("Minting USDC on destination chain…");
        const mintHash = await (walletClientDst as any).writeContract({
          address: dstChain.messageTransmitter,
          abi: MESSAGE_TRANSMITTER_ABI,
          functionName: "receiveMessage",
          args: [messageBytes, attestation as `0x${string}`],
          gas: BigInt(350000),
        });
        setDstTxHash(mintHash);

        await waitForReceipt(publicClientDst, mintHash);
      }

      setStep("done");
      setStatusMsg("");
      fetchBalances();
    } catch (err: any) {
      console.error("[CCTP Bridge]", err);
      setStep("error");
      setErrorMsg(err.shortMessage || err.message || "Bridge failed. Please try again.");
    }
  }, [
    address,
    srcChain,
    dstChain,
    pollAttestation,
    switchChain,
    bridgeToCircleWallet,
    circleWalletAddress,
    executeContractCall,
    fetchBalances,
  ]);

  const reset = () => {
    setStep("idle"); setStatusMsg(""); setErrorMsg(""); setBurnTxHash(null); setDstTxHash(null); setAmount("");
  };

  const isRunning = ["approving","burning","attesting","minting"].includes(step);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.2))",
            border: "1px solid rgba(245,158,11,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <GitMerge size={18} style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>CCTP Bridge</h3>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted,#888)" }}>Powered by Circle</span>
          </div>
        </div>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-muted,#888)", cursor: "pointer", fontSize: "0.8rem" }}>
            ← Back
          </button>
        )}
      </div>

      {address && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.75rem", color: "var(--text-muted,#888)"
        }}>
          <span>MetaMask Connected:</span>
          <strong style={{ color: "#e2e8f0" }}>{address.slice(0, 6)}...{address.slice(-4)}</strong>
        </div>
      )}

      {/* Wallet not connected */}
      {!address && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", fontSize: "0.85rem", color: "#f59e0b" }}>
            ⚠️ Please connect a MetaMask wallet to use the CCTP bridge.
          </div>
          <button
            onClick={connectWallet}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "12px 20px", borderRadius: "12px", border: "none",
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              color: "#fff", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer"
            }}
          >
            Connect MetaMask
          </button>
        </div>
      )}

      {/* Step tracker — only show once started */}
      {step !== "idle" && <StepTracker current={step} />}

      {step === "idle" && address && (
        <>
          {circleWalletAddress && (
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "12px",
              background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.15)",
              borderRadius: "10px",
              marginBottom: "8px"
            }}>
              <div 
                onClick={() => {
                  const nextVal = !bridgeToCircleWallet;
                  setBridgeToCircleWallet(nextVal);
                  if (nextVal) {
                    setDstKey("arc-testnet");
                  } else {
                    setDstKey("base-sepolia");
                  }
                }}
                style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
              >
                <div style={{
                  width: "18px", height: "18px", borderRadius: "4px",
                  border: "2px solid rgba(255,255,255,0.2)",
                  background: bridgeToCircleWallet ? "#818cf8" : "rgba(255,255,255,0.04)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s", flexShrink: 0
                }}>
                  {bridgeToCircleWallet && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Deposit directly to my Circle Wallet</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted, #888)", marginLeft: "28px", wordBreak: "break-all" }}>
                Recipient: <strong style={{ color: "#818cf8" }}>{circleWalletAddress}</strong> (Arc Testnet)
              </div>
            </div>
          )}

          {/* Chain selectors */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
              <ChainSelect label="FROM" value={srcKey} onChange={setSrcKey} exclude={bridgeToCircleWallet ? "arc-testnet" : dstKey} />
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted,#888)", marginLeft: "4px" }}>
                {loadingBalances ? "Loading balance..." : `Balance: ${srcBalance} USDC`}
              </span>
            </div>

            <div style={{ paddingBottom: "36px", color: "var(--text-muted,#888)" }}>
              <ArrowRight size={18} />
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
              {bridgeToCircleWallet ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label style={{ fontSize: "0.75rem", color: "var(--text-muted,#888)", fontWeight: 600 }}>TO</label>
                  <div style={{
                    padding: "10px 12px", borderRadius: "10px",
                    background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
                    color: "#f59e0b", fontSize: "0.85rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px"
                  }}>
                    <ChainIcon chainKey="arc-testnet" size={16} /> Arc Testnet
                  </div>
                </div>
              ) : (
                <ChainSelect label="TO" value={dstKey} onChange={setDstKey} exclude={srcKey} />
              )}
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted,#888)", marginLeft: "4px" }}>
                {loadingBalances ? "Loading balance..." : `Balance: ${dstBalance} USDC`}
              </span>
            </div>
          </div>

          {/* Amount input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "0.75rem", color: "var(--text-muted,#888)", fontWeight: 600 }}>USDC AMOUNT</label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0" step="0.01"
                style={{
                  width: "100%", padding: "12px 60px 12px 14px", borderRadius: "10px",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#e2e8f0", fontSize: "1rem", outline: "none", boxSizing: "border-box",
                }}
              />
              <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "0.82rem", color: "var(--text-muted,#888)", fontWeight: 600 }}>
                USDC
              </span>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted,#666)" }}>
              Get testnet USDC at{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{ color: "#818cf8" }}>faucet.circle.com ↗</a>
            </span>
          </div>

          {/* Bridge button */}
          <button
            onClick={handleBridge}
            disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(srcBalance)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              padding: "12px 20px", borderRadius: "12px", border: "none",
              background: (!amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(srcBalance))
                ? "rgba(255,255,255,0.06)"
                : "linear-gradient(135deg, #f59e0b, #ef4444)",
              color: (!amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(srcBalance)) ? "var(--text-muted,#888)" : "#fff",
              fontWeight: 700, fontSize: "0.95rem",
              cursor: (!amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(srcBalance)) ? "not-allowed" : "pointer",
            }}
          >
            <GitMerge size={18} />
            {parseFloat(amount) > parseFloat(srcBalance) ? "Insufficient USDC Balance" : "Start Bridge"}
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted,#888)" }}>Already burned? Resume bridge by pasting the transaction hash:</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <input 
                type="text" 
                placeholder="Paste burn transaction hash (0x...)" 
                id="idle-resume-hash-input"
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff", fontSize: "0.8rem", outline: "none"
                }}
              />
              <button 
                onClick={() => {
                  const input = document.getElementById("idle-resume-hash-input") as HTMLInputElement;
                  if (input && input.value.trim().startsWith("0x") && input.value.trim().length > 10) {
                    handleResume(input.value.trim() as `0x${string}`);
                  }
                }}
                style={{
                  padding: "8px 14px", borderRadius: "8px", border: "none",
                  background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "#fff", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600
                }}
              >
                Resume
              </button>
            </div>
          </div>
        </>
      )}

      {/* Running status */}
      {isRunning && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", padding: "8px 0" }}>
          <Loader2 size={32} style={{ color: "#f59e0b", animation: "spin 1s linear infinite" }} />
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-secondary,#aaa)", textAlign: "center", lineHeight: 1.6 }}>
            {STEP_LABELS[step]}
            {statusMsg && <><br /><span style={{ fontSize: "0.8rem", color: "var(--text-muted,#888)" }}>{statusMsg}</span></>}
          </p>
        </div>
      )}

      {/* Done */}
      {step === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center", padding: "8px 0", textAlign: "center" }}>
          <CheckCircle size={40} style={{ color: "#10b981" }} />
          <div>
            <h3 style={{ margin: "0 0 6px", color: "#10b981" }}>Bridge Complete! 🎉</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted,#888)" }}>
              {amount} USDC arrived on <strong>{dstChain.shortName}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            {burnTxHash && (
              <a href={`${srcChain.explorerUrl}/tx/${burnTxHash}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "#818cf8" }}>
                <ExternalLink size={12} /> Burn tx
              </a>
            )}
            {dstTxHash && (
              <a href={`${dstChain.explorerUrl}/tx/${dstTxHash}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.78rem", color: "#10b981" }}>
                <ExternalLink size={12} /> Mint tx
              </a>
            )}
          </div>
          <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 20px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted,#888)", cursor: "pointer", fontSize: "0.85rem" }}>
            <RefreshCw size={14} /> Bridge Again
          </button>
        </div>
      )}

      {/* Error */}
      {step === "error" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px" }}>
            <AlertCircle size={16} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#ef4444", lineHeight: 1.5 }}>{errorMsg}</p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={reset} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px 20px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--text-muted,#888)", cursor: "pointer" }}>
              <RefreshCw size={14} /> Reset / Start Over
            </button>
            {burnTxHash && (
              <button 
                onClick={() => handleResume(burnTxHash)} 
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  padding: "10px 20px", borderRadius: "10px", border: "none",
                  background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff",
                  fontWeight: 700, cursor: "pointer"
                }}
              >
                <RefreshCw size={14} /> Resume Bridge
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted,#888)" }}>Already burned? Paste transaction hash to resume:</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <input 
                type="text" 
                placeholder="0x..." 
                id="resume-hash-input"
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff", fontSize: "0.8rem", outline: "none"
                }}
              />
              <button 
                onClick={() => {
                  const input = document.getElementById("resume-hash-input") as HTMLInputElement;
                  if (input && input.value.trim().startsWith("0x") && input.value.trim().length > 10) {
                    handleResume(input.value.trim() as `0x${string}`);
                  }
                }}
                style={{
                  padding: "8px 14px", borderRadius: "8px", border: "none",
                  background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: "0.8rem", cursor: "pointer"
                }}
              >
                Go
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
