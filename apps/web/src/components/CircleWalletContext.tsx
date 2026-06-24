"use client";

/**
 * CircleWalletContext
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides auto-provisioned, user-controlled wallets via Circle's Programmable
 * Wallet infrastructure. When a Telegram user opens the Mini App, we
 * transparently create a Circle user + EVM-TESTNET EOA wallet for them —
 * secured by a 6-digit PIN managed by Circle's MPC backend.
 *
 * Users can later withdraw funds to MetaMask or any external address.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletStatus = "idle" | "loading" | "setup_required" | "ready" | "error";

interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
  state: string;
}

interface CircleWalletContextValue {
  status: WalletStatus;
  wallet: CircleWallet | null;
  userToken: string | null;
  encryptionKey: string | null;
  userId: string | null;
  errorMessage: string | null;

  /** Call this to trigger the Circle PIN-setup challenge (opens modal) */
  setupWallet: () => Promise<void>;

  /** Prepare + execute a contract call via Circle; returns when challenge done */
  executeContractCall: (params: {
    contractAddress: string;
    abiFunctionSignature: string;
    abiParameters: { type: string; value: string }[];
    amount?: string;
  }) => Promise<void>;

  /** Prepare + execute a USDC transfer to an external address */
  transferOut: (params: {
    destinationAddress: string;
    amount: string;       // in base units (6 decimals), e.g. "1000000"
    tokenId?: string;     // Circle USDC token ID for the chain
  }) => Promise<void>;

  /** Refresh wallet info from Circle */
  refreshWallet: () => Promise<void>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const CircleWalletContext = createContext<CircleWalletContextValue | null>(null);

export function useCircleWallet() {
  const ctx = useContext(CircleWalletContext);
  if (!ctx) throw new Error("useCircleWallet must be used inside <CircleWalletProvider>");
  return ctx;
}

// ─── Helper: derive a stable userId from the Telegram user ID ────────────────

function deriveTelegramUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const tg = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    if (tg?.id) return `tg_${tg.id}`;
  } catch { /* not in Telegram */ }
  return null;
}

// Fallback: generate and persist a random userId in localStorage
function getOrCreateAnonymousUserId(): string {
  const key = "arc_circle_user_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `anon_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CircleWalletProvider({ children }: { children: React.ReactNode }) {
  const [status,        setStatus]        = useState<WalletStatus>("idle");
  const [wallet,        setWallet]        = useState<CircleWallet | null>(null);
  const [userToken,     setUserToken]     = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [userId,        setUserId]        = useState<string | null>(null);
  const [errorMessage,  setErrorMessage]  = useState<string | null>(null);
  const sdkRef = useRef<any>(null);

  // ── Load Circle W3S Web SDK lazily (client-only) ─────────────────────────
  const loadSdk = useCallback(async () => {
    if (sdkRef.current) return sdkRef.current;
    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    const appId = process.env.NEXT_PUBLIC_CIRCLE_APP_ID;
    if (!appId) throw new Error("NEXT_PUBLIC_CIRCLE_APP_ID is not set");
    const sdk = new W3SSdk({ appSettings: { appId } });
    sdkRef.current = sdk;
    return sdk;
  }, []);

  // ── Execute a Circle challenge (PIN popup) ────────────────────────────────
  const executeChallenge = useCallback(async (challengeId: string): Promise<void> => {
    const sdk = await loadSdk();
    if (!userToken || !encryptionKey) throw new Error("Not authenticated with Circle");
    sdk.setAuthentication({ userToken, encryptionKey });

    return new Promise((resolve, reject) => {
      sdk.execute(challengeId, (error: any, result: any) => {
        if (error) {
          reject(new Error(`${error.code ?? "?"}: ${error.message ?? "Challenge failed"}`));
        } else {
          resolve(result);
        }
      });
    });
  }, [loadSdk, userToken, encryptionKey]);

  // ── Fetch wallets from Circle ────────────────────────────────────────────
  const fetchWallet = useCallback(async (token: string) => {
    const res = await fetch(`/api/circle/wallet?userToken=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (res.ok && data.wallets?.length > 0) {
      const w = data.wallets[0];
      setWallet({ id: w.id, address: w.address, blockchain: w.blockchain, state: w.state });
      return w;
    }
    return null;
  }, []);

  // ── Bootstrap: identify user → get Circle session → check wallet ─────────
  const bootstrap = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const uid = deriveTelegramUserId() ?? getOrCreateAnonymousUserId();
      setUserId(uid);

      // Get Circle session credentials
      const authRes = await fetch("/api/circle/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid }),
      });
      const authData = await authRes.json();
      if (!authRes.ok) throw new Error(authData.error || "Failed to authenticate with Circle");

      const { userToken: token, encryptionKey: key } = authData;
      setUserToken(token);
      setEncryptionKey(key);

      // Check if the user already has a wallet
      const existingWallet = await fetchWallet(token);
      if (existingWallet && existingWallet.state === "LIVE") {
        setStatus("ready");
      } else {
        setStatus("setup_required");
      }
    } catch (err: any) {
      console.error("[CircleWallet] Bootstrap error:", err);
      setErrorMessage(err.message || "Wallet initialization failed");
      setStatus("error");
    }
  }, [fetchWallet]);

  useEffect(() => {
    // Only auto-bootstrap when running in Telegram or when the user is on a page that opted in.
    // We check for the Telegram WebApp object as the trigger.
    const isTelegram = typeof window !== "undefined" && !!(window as any).Telegram?.WebApp?.initData;
    if (isTelegram) {
      bootstrap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Setup wallet: create wallet → execute PIN challenge ──────────────────
  const setupWallet = useCallback(async () => {
    if (!userToken) { await bootstrap(); return; }
    setStatus("loading");
    try {
      const res = await fetch("/api/circle/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start wallet setup");

      await executeChallenge(data.challengeId);
      // Wallet is now created — fetch the address
      await fetchWallet(userToken);
      setStatus("ready");
    } catch (err: any) {
      console.error("[CircleWallet] Setup error:", err);
      setErrorMessage(err.message || "Wallet setup failed");
      setStatus("error");
    }
  }, [userToken, bootstrap, executeChallenge, fetchWallet]);

  // ── Execute a contract call ──────────────────────────────────────────────
  const executeContractCall = useCallback(async ({
    contractAddress,
    abiFunctionSignature,
    abiParameters,
    amount = "0",
  }: {
    contractAddress: string;
    abiFunctionSignature: string;
    abiParameters: { type: string; value: string }[];
    amount?: string;
  }) => {
    if (!wallet || !userToken) throw new Error("Circle wallet not ready");

    const res = await fetch("/api/circle/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userToken,
        walletId: wallet.id,
        contractAddress,
        abiFunctionSignature,
        abiParameters,
        amount,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to prepare contract execution");

    await executeChallenge(data.challengeId);
  }, [wallet, userToken, executeChallenge]);

  // ── Transfer USDC out to an external wallet ──────────────────────────────
  const transferOut = useCallback(async ({
    destinationAddress,
    amount,
    tokenId,
  }: {
    destinationAddress: string;
    amount: string;
    tokenId?: string;
  }) => {
    if (!wallet || !userToken) throw new Error("Circle wallet not ready");

    const res = await fetch("/api/circle/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userToken, walletId: wallet.id, destinationAddress, amount, tokenId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to prepare transfer");

    await executeChallenge(data.challengeId);
  }, [wallet, userToken, executeChallenge]);

  // ── Refresh wallet data ─────────────────────────────────────────────────
  const refreshWallet = useCallback(async () => {
    if (!userToken) return;
    await fetchWallet(userToken);
  }, [userToken, fetchWallet]);

  return (
    <CircleWalletContext.Provider
      value={{
        status,
        wallet,
        userToken,
        encryptionKey,
        userId,
        errorMessage,
        setupWallet,
        executeContractCall,
        transferOut,
        refreshWallet,
      }}
    >
      {children}
    </CircleWalletContext.Provider>
  );
}
