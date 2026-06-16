import { createPublicClient, createWalletClient, http, custom, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const RPC_URL = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const PRIVATE_KEY = process.env.BOT_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Define the custom Arc Testnet chain matching viem standards
export const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  network: "arc-testnet",
  nativeCurrency: {
    decimals: 18, // 18 native decimals internally for gas accounting (which is USDC)
    name: "USD Coin",
    symbol: "USDC",
  },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
} as const;

// Create Viem Clients
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

export const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

export const walletClient = createWalletClient({
  chain: arcTestnet,
  transport: http(),
  account,
});

// Simplified ABIs for internal use without needing hardhat file structure
export const escrowAbi = [
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverable", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "complete",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reject",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "description", type: "string" },
      { name: "budget", type: "uint256" },
      { name: "expiredAt", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "hook", type: "address" },
    ],
  },
] as const;

export const treasuryAbi = [
  {
    type: "function",
    name: "getBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getMembersCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Deployed Addresses placeholders (to be updated after deployment)
export const DEPLOYED_ESCROW_ADDRESS = (process.env.ESCROW_ADDRESS || "0x0747EEf0706327138c69792bF28Cd525089e4583") as `0x${string}`;
export const DEPLOYED_TREASURY_ADDRESS = (process.env.TREASURY_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;

/**
 * Gets the status and description of an onchain job
 */
export async function getJobDetails(jobId: bigint) {
  try {
    const data = await publicClient.readContract({
      address: DEPLOYED_ESCROW_ADDRESS,
      abi: escrowAbi,
      //@ts-ignore
      functionName: "getJob",
      args: [jobId],
    });
    return data;
  } catch (error) {
    console.error(`Error reading job ${jobId}:`, error);
    return null;
  }
}

/**
 * Executes a 'complete' transaction to release funds from escrow
 */
export async function releaseEscrow(jobId: bigint, reasonHash: `0x${string}`) {
  try {
    const { request } = await publicClient.simulateContract({
      address: DEPLOYED_ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "complete",
      args: [jobId, reasonHash, "0x"],
      account,
    });

    const hash = await walletClient.writeContract(request);
    console.log(`Released escrow for job ${jobId}. Tx Hash: ${hash}`);
    return hash;
  } catch (error) {
    console.error(`Failed to release escrow for job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Executes a 'reject' transaction to revert job state to Funded
 */
export async function rejectSubmission(jobId: bigint, reasonHash: `0x${string}`) {
  try {
    const { request } = await publicClient.simulateContract({
      address: DEPLOYED_ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "reject",
      args: [jobId, reasonHash],
      account,
    });

    const hash = await walletClient.writeContract(request);
    console.log(`Rejected submission for job ${jobId}. Tx Hash: ${hash}`);
    return hash;
  } catch (error) {
    console.error(`Failed to reject submission for job ${jobId}:`, error);
    throw error;
  }
}
