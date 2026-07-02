import { NextRequest, NextResponse } from "next/server";
import { SwapKit } from "@circle-fin/swap-kit";
import { createPublicClient, http, encodeFunctionData } from "viem";
import { arcTestnet } from "viem/chains";

// Ensure KIT_KEY has the correct "KIT_KEY:" prefix if omitted
let KIT_KEY = process.env.KIT_KEY || "";
if (KIT_KEY && !KIT_KEY.startsWith("KIT_KEY:")) {
  KIT_KEY = `KIT_KEY:${KIT_KEY}`;
}

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http()
});

const getDecimalsHelper = async (tokenAddress: string) => {
  const addr = tokenAddress.toLowerCase();
  if (addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") return 18;
  try {
    const decimals = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [{
        type: "function",
        name: "decimals",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint8" }]
      }],
      functionName: "decimals"
    });
    return Number(decimals);
  } catch (e) {
    console.warn("Failed to fetch decimals for", tokenAddress, "defaulting to 6");
    return 6;
  }
};

// USDC ERC20 ABI snippets needed
const ERC20_ABI = [
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

// Circle Adapter contract execute ABI
// IMPORTANT: Field order MUST match the on-chain struct exactly.
// Source: @circle-fin/swap-kit index.d.ts — ExecuteParams, Instruction, TokenRecipient interfaces
// ExecuteParams order: instructions → tokens → execId → deadline → metadata
const ADAPTER_EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      {
        name: "executeParams",
        type: "tuple",
        components: [
          // Order matches SDK: instructions[], tokens[], execId, deadline, metadata
          {
            name: "instructions",
            type: "tuple[]",
            components: [
              { name: "target", type: "address" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
              { name: "tokenIn", type: "address" },
              { name: "amountToApprove", type: "uint256" },
              { name: "tokenOut", type: "address" },
              { name: "minTokenOut", type: "uint256" }
            ]
          },
          {
            name: "tokens",
            type: "tuple[]",
            components: [
              { name: "token", type: "address" },
              { name: "beneficiary", type: "address" }
            ]
          },
          { name: "execId", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "metadata", type: "bytes" }
        ]
      },
      {
        name: "tokenInputs",
        type: "tuple[]",
        components: [
          { name: "permitType", type: "uint8" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "permitCalldata", type: "bytes" }
        ]
      },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  }
] as const;

export async function POST(req: NextRequest) {
  try {
    const { action, fromToken, toToken, amount, walletAddress, chain } = await req.json();

    if (!KIT_KEY) {
      return NextResponse.json({ error: "Circle KIT_KEY not configured on server" }, { status: 500 });
    }

    const swapKit = new SwapKit();

    // ── 1. Estimate Swap Rate ──
    if (action === "estimate") {
      if (!fromToken || !toToken || !amount || !chain) {
        return NextResponse.json({ error: "Missing parameters for estimation" }, { status: 400 });
      }

      const mockAdapter = {
        chainType: 'evm',
        capabilities: {
          addressContext: 'user-controlled',
          supportedChains: [chain]
        },
        validateChainSupport: () => {},
        getAddress: async () => walletAddress || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        calculateTransactionFee: async () => ({ fee: 0n }),
        getTokenDecimals: getDecimalsHelper,
        prepare: async () => ({
          type: 'noop',
          estimate: async () => ({ gasLimit: 0n, gasPrice: 0n, totalFee: 0n }),
          execute: async () => '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
        } as any),
        waitForTransaction: async () => ({}) as any
      };

      const quote = await swapKit.estimate({
        from: {
          adapter: mockAdapter as any,
          chain: chain as any,
        },
        tokenIn: fromToken,
        tokenOut: toToken,
        amountIn: amount,
        config: {
          kitKey: KIT_KEY,
          slippageBps: 300,
        }
      });

      return NextResponse.json({ quote });
    }

    // ── 2. Build Swap Transaction ──
    if (action === "build") {
      if (!fromToken || !toToken || !amount || !walletAddress || !chain) {
        return NextResponse.json({ error: "Missing parameters to build swap" }, { status: 400 });
      }

      // Capture prepareAction calls — these contain the exact contract calls needed
      const capturedActions: { action: string; params: any }[] = [];
      let capturedServiceResponse: any = null;
      let buildError: any = null;

      // Intercept global fetch to capture Circle's service response
      const originalFetch = global.fetch;
      const patchedFetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const response = await originalFetch(input, init);
        try {
          const cloned = response.clone();
          const body = await cloned.json();
          if (body && typeof body === 'object' && 'transaction' in body) {
            capturedServiceResponse = body;
          }
        } catch { /* not JSON */ }
        return response;
      } as typeof fetch;

      global.fetch = patchedFetch;

      const buildAdapter = {
        chainType: 'evm',
        capabilities: {
          addressContext: 'user-controlled',
          supportedChains: [chain]
        },
        validateChainSupport: () => {},
        getAddress: async () => walletAddress,
        calculateTransactionFee: async () => ({ fee: 0n }),
        getTokenDecimals: getDecimalsHelper,
        prepareAction: async (actionName: string, params: any, context: any) => {
          console.log(`[SwapKit prepareAction] ${actionName}`, JSON.stringify(params, (_, v) =>
            typeof v === 'bigint' ? v.toString() : v, 2));
          capturedActions.push({ action: actionName, params });
          // Return a mock result so SDK doesn't throw
          return {
            execute: async () => '0x0000000000000000000000000000000000000000000000000000000000000001'
          };
        },
        prepare: async (params: any) => {
          console.log("[SwapKit prepare]", params);
          capturedActions.push({ action: 'prepare', params });
          return {
            type: 'evm',
            estimate: async () => ({ gasLimit: 0n, gasPrice: 0n, totalFee: 0n }),
            execute: async () => '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
          } as any;
        },
        waitForTransaction: async () => ({}) as any
      };

      try {
        await swapKit.swap({
          from: {
            adapter: buildAdapter as any,
            chain: chain as any,
          },
          tokenIn: fromToken,
          tokenOut: toToken,
          amountIn: amount,
          config: {
            kitKey: KIT_KEY,
            slippageBps: 300,
          }
        });
      } catch (err) {
        buildError = err;
        console.log("[SwapKit] build error:", (err as any)?.message);
      } finally {
        global.fetch = originalFetch;
      }

      // Extract the approval action (usdc.increaseAllowance)
      const approvalAction = capturedActions.find(a => a.action === 'usdc.increaseAllowance');
      // Extract the swap execute action
      const swapAction = capturedActions.find(a => a.action === 'swap.execute');

      if (!swapAction && !capturedServiceResponse?.transaction) {
        const errMsg = buildError?.message || "Failed to build swap — no transaction data captured";
        console.error("[Build] No actions captured:", capturedActions.map(a => a.action));
        return NextResponse.json({ error: errMsg }, { status: 500 });
      }

      // Build the approval transaction (if needed)
      let approvalTx = null;
      if (approvalAction) {
        const { amount: approvalAmount, delegate } = approvalAction.params;
        // USDC token address — from the swap action or service response
        const usdcAddress = capturedServiceResponse?.tokenInAddress
          || swapAction?.params?.tokenInAddress
          || fromToken;

        const approvalCalldata = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [delegate as `0x${string}`, BigInt(approvalAmount)]
        });

        approvalTx = {
          to: usdcAddress,
          data: approvalCalldata
        };
      }

      // Build the swap execute transaction
      let swapTx = null;
      if (swapAction) {
        const { executeParams, tokenInputs, signature } = swapAction.params;
        // Adapter contract address — from usdc.increaseAllowance delegate
        const adapterAddress = approvalAction?.params?.delegate
          || capturedServiceResponse?.transaction?.executionParams?.instructions?.[0]?.target;

        if (adapterAddress) {
          try {
            const calldata = encodeFunctionData({
              abi: ADAPTER_EXECUTE_ABI,
              functionName: 'execute',
              args: [
                {
                  execId: executeParams.execId,
                  deadline: executeParams.deadline,
                  metadata: executeParams.metadata,
                  tokens: executeParams.tokens.map((t: any) => ({
                    token: t.token as `0x${string}`,
                    beneficiary: t.beneficiary as `0x${string}`
                  })),
                  instructions: executeParams.instructions.map((i: any) => ({
                    target: i.target as `0x${string}`,
                    data: i.data as `0x${string}`,
                    value: BigInt(i.value || 0),
                    tokenIn: i.tokenIn as `0x${string}`,
                    amountToApprove: BigInt(i.amountToApprove || 0),
                    tokenOut: i.tokenOut as `0x${string}`,
                    minTokenOut: BigInt(i.minTokenOut || 0)
                  }))
                },
                tokenInputs.map((ti: any) => ({
                  permitType: ti.permitType,
                  token: ti.token as `0x${string}`,
                  amount: BigInt(ti.amount),
                  permitCalldata: ti.permitCalldata as `0x${string}`
                })),
                signature as `0x${string}`
              ]
            });

            swapTx = {
              to: adapterAddress,
              data: calldata,
              gasLimit: capturedServiceResponse?.transaction?.gasLimit || "0xf57a0"
            };
          } catch (encodeErr: any) {
            console.error("[Build] Failed to encode execute calldata:", encodeErr.message);
            // Fallback: use raw instruction data from service response
          }
        }
      }

      // Fallback: extract direct instruction calldata from service response
      if (!swapTx && capturedServiceResponse?.transaction?.executionParams?.instructions) {
        const instructions = capturedServiceResponse.transaction.executionParams.instructions;
        const mainInstruction = instructions[instructions.length - 1]; // last instruction is the swap
        if (mainInstruction) {
          swapTx = {
            to: mainInstruction.target,
            data: mainInstruction.data,
            value: mainInstruction.value || "0",
            gasLimit: capturedServiceResponse.transaction.gasLimit || "0xf57a0"
          };
        }
      }

      if (!swapTx) {
        return NextResponse.json({ error: "Failed to construct swap transaction" }, { status: 500 });
      }

      return NextResponse.json({
        approvalTx,
        swapTx,
        // Also include service response for debugging
        debug: {
          capturedActions: capturedActions.map(a => a.action),
          hasServiceResponse: !!capturedServiceResponse
        }
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("[Swap Route Error]", err);
    return NextResponse.json({ error: err.message || "Swap operation failed" }, { status: 500 });
  }
}
