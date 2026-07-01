---
name: use-smart-contract-platform
description: "Deploy, import, interact with, and monitor smart contracts using Circle Smart Contract Platform APIs. Supports bytecode deployment, template contracts (ERC-20/721/1155/Airdrop), ABI-based read/write calls, and webhook event monitoring. Keywords: contract deployment, smart contract, ABI interactions, template contracts, event monitoring, contract webhooks, bytecode, ERC-1155, ERC-20, ERC-721."
---

## Overview

Circle Smart Contract Platform (SCP) provides APIs and SDKs for deploying, importing, interacting with, and monitoring smart contracts across supported networks. Deploy contracts from raw bytecode, use audited templates for standard patterns, execute ABI-based contract calls, and monitor emitted events through webhooks.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/smart-contract-platform @circle-fin/developer-controlled-wallets
```

### Environment Variables

```
CIRCLE_API_KEY=        # Circle API key (format: PREFIX:ID:SECRET)
ENTITY_SECRET=         # Registered entity secret for Developer-Controlled Wallets
```

### SDK Initialization

```typescript
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const scpClient = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});

const walletsClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.ENTITY_SECRET!,
});
```

## Quick Reference

### Supported Blockchains

| Chain | Mainnet | Testnet |
|-------|---------|---------|
| Arbitrum | `ARB` | `ARB-SEPOLIA` |
| Arc | -- | `ARC-TESTNET` |
| Avalanche | `AVAX` | `AVAX-FUJI` |
| Base | `BASE` | `BASE-SEPOLIA` |
| Ethereum | `ETH` | `ETH-SEPOLIA` |
| Monad | `MONAD` | `MONAD-TESTNET` |
| OP Mainnet | `OP` | `OP-SEPOLIA` |
| Polygon PoS | `MATIC` | `MATIC-AMOY` |
| Unichain | `UNI` | `UNI-SEPOLIA` |

### Contract Templates

| Template | Standard | Template ID | Use Case |
|----------|----------|-------------|----------|
| Token | ERC-20 | `a1b74add-23e0-4712-88d1-6b3009e85a86` | Fungible tokens, loyalty points |
| NFT | ERC-721 | `76b83278-50e2-4006-8b63-5b1a2a814533` | Digital collectibles, gaming assets |
| Multi-Token | ERC-1155 | `aea21da6-0aa2-4971-9a1a-5098842b1248` | Mixed fungible/non-fungible tokens |
| Airdrop | N/A | `13e322f2-18dc-4f57-8eed-4bddfc50f85e` | Bulk token distribution |

### Key API Response Fields

- Contract functions: `getContract().data.contract.functions`
- Contract address: `contract.contractAddress` (fallback: `contract.address`)
- Transaction ID: `createContractExecutionTransaction().data.id`
- Deployment status: `getContract().data.contract.deploymentStatus`

## Core Concepts

### Dual-Client Architecture

SCP workflows pair two SDK clients:
- **Smart Contract Platform SDK** handles contract deployment, imports, read queries, and event monitoring
- **Developer-Controlled Wallets SDK** handles write transactions and provides deployment wallets

Write operations use `walletsClient.createContractExecutionTransaction()`, NOT the SCP client.

### Read vs Write Contract Calls

- **Read queries** (`view`/`pure` functions) use `scpClient.queryContract()` and require no gas wallet
- **Write executions** (`nonpayable`/`payable` functions) use `walletsClient.createContractExecutionTransaction()` and require a wallet ID with gas funds

### Signature Formatting

- Function signatures: `name(type1,type2,...)` with no spaces
- Event signatures: `EventName(type1,type2,...)` with no spaces
- Parameter order must exactly match ABI definitions

### Idempotency Keys

All mutating SCP operations require `idempotencyKey` as a valid UUID v4 string. Use `crypto.randomUUID()` in Node.js. Non-UUID keys fail with generic `API parameter invalid` errors.

### Deployment Async Model

Contract deployment is asynchronous. The response indicates initiation only. Poll `getContract()` for `deploymentStatus`.

### EVM Version Constraint

Compile Solidity with `evmVersion: "paris"` or earlier to avoid the `PUSH0` opcode. Solidity >= 0.8.20 defaults to Shanghai. Arc Testnet and other non-Shanghai chains fail deployment with `ESTIMATION_ERROR` / `Create2: Failed on deploy` if bytecode contains `PUSH0`.

### Transaction Lifecycle

Write operations (contract deployments, executions) follow the same asynchronous state machine as Developer-Controlled Wallets. Poll with `walletsClient.getTransaction({ id: txId })` until a terminal state is reached.
