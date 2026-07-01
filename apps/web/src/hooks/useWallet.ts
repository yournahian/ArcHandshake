/**
 * useWallet
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified wallet hook that treats both wagmi (MetaMask) and Circle Smart Wallet
 * as valid "connected" states. Use this instead of `useAccount()` directly so
 * that Circle wallet users are never gated with "please connect your wallet".
 */
"use client";

import { useCircleWallet } from "@/components/CircleWalletContext";

export function useWallet() {
  const { status: circleStatus, wallet: circleWallet } = useCircleWallet();

  const isConnected   = circleStatus === "ready" && !!circleWallet?.address;
  const address       = (circleWallet?.address ?? "") as `0x${string}`;
  const isCircle      = true; // Always true now as we removed wagmi

  return { isConnected, address, isCircle, circleWallet };
}
