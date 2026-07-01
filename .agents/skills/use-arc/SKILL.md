---
name: use-arc
description: "Provide instructions on how to build with Arc, Circle's blockchain where USDC is the native gas token. Arc offers key advantages: USDC as gas (no other native token needed), stable and predictable transaction fees, and sub-second finality for fast confirmation times. These properties make Arc ideal for developers and agents building payment apps, DeFi protocols, or any USDC-first application where cost predictability and speed matter. Use skill when Arc or Arc Testnet is mentioned, working with any smart contracts related to Arc, configuring Arc in blockchain projects, bridging USDC to Arc via CCTP, or building USDC-first applications. Triggers: Arc, Arc Testnet, USDC gas, deploy to Arc, Arc chain, stable fees, fast finality."
---

## Overview

Arc is Circle's blockchain where USDC is the native gas token. Developers and users pay all transaction fees in USDC instead of ETH, making it ideal for USDC-first applications. Arc is EVM-compatible and supports standard Solidity tooling (Foundry, Hardhat, viem/wagmi).

## Prerequisites / Setup

### Wallet Funding

Get testnet USDC from https://faucet.circle.com before sending any transactions.

### Environment Variables

```bash
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.network
PRIVATE_KEY=         # Deployer wallet private key
```

## Quick Reference

### Network Details

| Field | Value |
|-------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` (hex: `0x4CEF52`) |
| RPC | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com |
| CCTP Domain | `26` |

### Token Addresses for Arc

| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0x3600000000000000000000000000000000000000` | 6 (ERC-20) |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 |

## Core Concepts

- **Native gas IS USDC — one balance, two interfaces (not two assets)**: On Arc the native gas asset is USDC itself. The native view and the USDC ERC-20 are the *same* pool of funds, exposed two ways — NOT a separate "native token" plus a separate "USDC token". Drop the ETH-style mental model from other chains.
  - **Native view**: 18 decimals. Used only for gas and `msg.value`. wagmi `useBalance` returns this (its `symbol` is `USDC`).
  - **ERC-20 view**: 6 decimals, at `0x3600000000000000000000000000000000000000`. Use this for all balances, transfers, approvals, and display.
- **Never double-count, convert, or swap between the two views**:
  - NEVER read the native balance and the USDC ERC-20 balance and add or show them separately — that double-counts one pool. Show a single USDC balance (the 6-decimal ERC-20 view).
  - USDC ↔ native is NOT a swap or conversion — it is the same asset. Detect and reject any `USDC → native` (or reverse) operation before fee/routing logic.
  - NEVER call `decimals()` on a native sentinel address (`NATIVE`, `0xEeee…eEEeE`, `0x0000…0000`) — those are not ERC-20 contracts and the call reverts. The ERC-20 is 6 decimals; native is 18.
  - The two views differ by a factor of 10^12 (`1e18` native = `1e6` ERC-20). Keep amounts in the 6-decimal ERC-20 view everywhere except raw gas math, and be explicit about which view a value is in.
- **Testnet only**: Arc is currently in testnet. All addresses and configuration apply to testnet only.
- **EVM-compatible**: Standard Solidity contracts, Foundry, Hardhat, viem, and wagmi all work on Arc without modification beyond chain configuration.
