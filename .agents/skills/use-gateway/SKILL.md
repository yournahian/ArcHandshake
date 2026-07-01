---
name: use-gateway
description: "Integrate Circle Gateway to hold a unified USDC balance across multiple blockchains and transfer USDC instantly (<500ms) via permissionless deposit, burn, and mint workflows. Available on 11 EVM chains + Solana (mainnet and testnet), plus Arc testnet. Use when: enabling chain-agnostic user experiences, low-latency or instant next-block finality is required, capital needs to be pooled across chains for greater capital efficiency, or building apps with consolidated crosschain balances. Triggers on: Gateway, Gateway Wallet, Gateway Minter, gatewayMint, burn intent, unified balance, instant crosschain transfer."
---

## Overview

Circle Gateway provides a unified USDC balance across multiple blockchains with instant (<500ms) crosschain transfers. Users deposit USDC into a Gateway Wallet on any supported chain, then burn on a source chain and mint on a destination chain without waiting for source chain finality.

## Prerequisites / Setup

Gateway is a contract-level integration -- there is no SDK to install. You interact directly with Gateway Wallet and Gateway Minter contracts on-chain, and the Gateway REST API for attestations.

### Chain Configuration

Do not load a separate config file by default. Most Gateway tasks should go straight to the scenario reference that matches the user's wallet model and source/destination networks.

Use the scenario reference first and only do additional verification when you need to confirm:

- Gateway REST base URL
  - testnet: `https://gateway-api-testnet.circle.com/v1/`
  - mainnet: `https://gateway-api.circle.com/v1/`
- chain-specific USDC addresses: `https://developers.circle.com/stablecoins/usdc-contract-addresses.md`
- Circle Wallet blockchain identifiers: `https://developers.circle.com/wallets/supported-blockchains.md`

Canonical source docs for verification:

- Gateway how-tos:
  - `https://developers.circle.com/gateway/howtos/create-unified-usdc-balance.md`
  - `https://developers.circle.com/gateway/howtos/manage-delegates.md`
  - `https://developers.circle.com/gateway/howtos/transfer-unified-usdc-balance.md`
- Gateway quickstarts:
  - `https://developers.circle.com/gateway/quickstarts/unified-balance-evm.md`
  - `https://developers.circle.com/gateway/quickstarts/unified-balance-solana.md`
- Arc tutorial: `https://docs.arc.network/arc/tutorials/access-usdc-crosschain.md`

## Quick Reference

### Key Addresses

**EVM Mainnet (All Chains)**
- Gateway Wallet: `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE`
- Gateway Minter: `0x2222222d7164433c4C09B0b0D809a9b52C04C205`

**EVM Testnet (All Chains)**
- Gateway Wallet: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
- Gateway Minter: `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`

**Solana Mainnet**
- Gateway Wallet: `GATEwy4YxeiEbRJLwB6dXgg7q61e6zBPrMzYj5h1pRXQ`
- Gateway Minter: `GATEm5SoBJiSw1v2Pz1iPBgUYkXzCUJ27XSXhDfSyzVZ`

**Solana Devnet**
- Gateway Wallet: `GATEwdfmYNELfp5wDmmR6noSr2vHnAfBPMm2PvCzX5vu`
- Gateway Minter: `GATEmKK2ECL1brEngQZWCgMWPbvrEYqsV6u29dAaHavr`
- USDC Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

### Domain IDs (Mainnet)

| Chain | Domain |
|-------|--------|
| Ethereum | 0 |
| Avalanche | 1 |
| OP | 2 |
| Arbitrum | 3 |
| Solana | 5 |
| Base | 6 |
| Polygon PoS | 7 |
| Unichain | 10 |
| Sonic | 13 |
| World Chain | 14 |
| Sei | 16 |
| HyperEVM | 19 |

### Domain IDs (Testnet)

| Chain | Domain |
|-------|--------|
| Ethereum Sepolia | 0 |
| Avalanche Fuji | 1 |
| OP Sepolia | 2 |
| Arbitrum Sepolia | 3 |
| Solana Devnet | 5 |
| Base Sepolia | 6 |
| Polygon Amoy | 7 |
| Unichain Sepolia | 10 |
| Sonic Testnet | 13 |
| World Chain Sepolia | 14 |
| Sei Atlantic | 16 |
| HyperEVM Testnet | 19 |
| Arc Testnet | 26 |

## Core Concepts

### Unified Balance

Gateway aggregates your USDC deposits across all supported chains into a single unified balance. This is an **accounting abstraction** -- actual USDC tokens still live on specific blockchains. Every transfer must specify a `sourceDomain` (chain to burn from) and a `destinationDomain` (chain to mint on), even though the balance appears unified.

Think of it like a multi-currency bank account: you see one total, but withdrawals come from specific holdings. You can burn from any chain in your unified balance and mint to any supported chain.

**Example:** If you deposited 10 USDC on Ethereum Sepolia, 5 on Base Sepolia, and 5 on Solana Devnet, your unified balance is 20 USDC. To transfer 10 USDC to Arc Testnet, you specify a source domain to burn from (e.g. Base Sepolia) and the destination domain (Arc Testnet).
