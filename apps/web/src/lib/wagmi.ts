import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

// Arc Testnet requires minimum 20 Gwei gas price.
const ARC_MIN_GAS_PRICE = 20_000_000_000n; // 20 Gwei in wei

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
  // Enforce minimum gas price for all transactions on this chain
  fees: {
    defaultPriorityFee: ARC_MIN_GAS_PRICE,
    baseFeeMultiplier: 1.2,
  },
} as const;

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected(),
  ],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network", {
      fetchOptions: {},
    }),
  },
});

// Gas price constant for use in explicit transaction overrides
export { ARC_MIN_GAS_PRICE };
