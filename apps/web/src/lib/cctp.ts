/**
 * cctp.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Circle CCTP (Cross-Chain Transfer Protocol) V2 configuration.
 * Contains chain configs, contract addresses, domain IDs, and ABI fragments
 * for the burn-attest-mint USDC bridging flow across supported EVM testnets.
 */

export interface CctpChain {
  id: number;
  name: string;
  shortName: string;
  domainId: number;
  rpcUrl: string;
  explorerUrl: string;
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  usdc: `0x${string}`;
  color: string;
  emoji: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// ─── Supported CCTP Testnet Chains ───────────────────────────────────────────

export const CCTP_CHAINS: Record<string, CctpChain> = {
  "eth-sepolia": {
    id: 11155111,
    name: "Ethereum Sepolia",
    shortName: "Eth Sepolia",
    domainId: 0,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io",
    tokenMessenger:    "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter:"0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc:              "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    color: "#627EEA",
    emoji: "⟠",
  },
  "base-sepolia": {
    id: 84532,
    name: "Base Sepolia",
    shortName: "Base Sepolia",
    domainId: 6,
    rpcUrl: "https://base-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.basescan.org",
    tokenMessenger:    "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter:"0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc:              "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    color: "#0052FF",
    emoji: "🔵",
  },
  "avax-fuji": {
    id: 43113,
    name: "Avalanche Fuji",
    shortName: "Avax Fuji",
    domainId: 1,
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://testnet.snowtrace.io",
    tokenMessenger:    "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter:"0xa9fB1b3009DCb79E2fe346c16a604b8Fa8aE0a79",
    usdc:              "0x5425890298aed601595a70AB815c96711a31Bc65",
    color: "#E84142",
    emoji: "🔺",
  },
  "arbitrum-sepolia": {
    id: 421614,
    name: "Arbitrum Sepolia",
    shortName: "Arb Sepolia",
    domainId: 3,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    explorerUrl: "https://sepolia.arbiscan.io",
    tokenMessenger:    "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter:"0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872",
    usdc:              "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    color: "#28A0F0",
    emoji: "🌀",
  },
  "arc-testnet": {
    id: 5042002,
    name: "Arc Testnet",
    shortName: "Arc Testnet",
    domainId: 26,
    rpcUrl: "https://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app",
    tokenMessenger:    "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter:"0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    usdc:              "0x3600000000000000000000000000000000000000",
    color: "#f59e0b",
    emoji: "🏹",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  },
};

export const CCTP_CHAIN_KEYS = Object.keys(CCTP_CHAINS) as (keyof typeof CCTP_CHAINS)[];

// ─── Circle IRIS Attestation API ──────────────────────────────────────────────

export const CCTP_IRIS_API_BASE = "https://iris-api-sandbox.circle.com";

// ─── ABI Fragments ────────────────────────────────────────────────────────────

export const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const TOKEN_MESSENGER_ABI = [
  {
    name: "depositForBurn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount",             type: "uint256" },
      { name: "destinationDomain",  type: "uint32"  },
      { name: "mintRecipient",      type: "bytes32" },
      { name: "burnToken",          type: "address" },
      { name: "destinationCaller",  type: "bytes32" }, // bytes32(0) = anyone can relay
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
  },
] as const;

export const MESSAGE_TRANSMITTER_ABI = [
  {
    name: "receiveMessage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message",     type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

// The MessageTransmitter emits this event with raw message bytes when depositForBurn is called
export const MESSAGE_SENT_EVENT_ABI = [
  {
    name: "MessageSent",
    type: "event",
    inputs: [{ name: "message", type: "bytes", indexed: false }],
  },
] as const;

// ─── Helper: pad address to bytes32 for mintRecipient ─────────────────────────

export function addressToBytes32(address: `0x${string}`): `0x${string}` {
  // Remove 0x, left-pad to 64 hex chars (32 bytes), re-add 0x
  const hex = address.slice(2).toLowerCase();
  return `0x${hex.padStart(64, "0")}`;
}
