import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Load env from the root directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const BOT_PRIVATE_KEY = process.env.BOT_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    arcTestnet: {
      url: process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network",
      chainId: Number(process.env.ARC_CHAIN_ID) || 5042002,
      accounts: [BOT_PRIVATE_KEY],
      gasPrice: 20000000000, // 20 Gwei minimum for Arc Testnet
    },
  },
};

export default config;
