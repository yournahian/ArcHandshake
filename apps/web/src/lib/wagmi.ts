// Arc Testnet requires minimum 20 Gwei gas price.
export const ARC_MIN_GAS_PRICE = BigInt(20000000000); // 20 Gwei in wei

export const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "USD Coin",
    symbol: "USDC",
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  fees: {
    defaultPriorityFee: ARC_MIN_GAS_PRICE,
    baseFeeMultiplier: 1.2,
  },
} as const;
