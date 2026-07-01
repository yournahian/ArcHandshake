---
name: use-developer-controlled-wallets
description: "Create and manage Circle developer-controlled wallets where the application retains full custody of wallet keys on behalf of end-users. Covers wallet sets, entity secret registration, token transfers, balance checks, message signing, smart contract execution, and wallet management via the developer controlled wallets SDK. Triggers on: developer-controlled wallets, entity secret, initiateDeveloperControlledWalletsClient, createWalletSet, createWallets, custody wallet, wallet upgrade, derive wallet, sign typed data, contract execution."
---

## Overview

Developer-controlled wallets let your application create and manage wallets on behalf of end users, with full custody of private keys secured through an encrypted entity secret. Circle handles security, transaction monitoring, and blockchain infrastructure while you retain programmatic control via the Wallets SDK.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/developer-controlled-wallets
```

### Environment Variables

```
CIRCLE_API_KEY=      # Circle API key (format: PREFIX:ID:SECRET)
ENTITY_SECRET=       # 32-byte hex entity secret
```

### Entity Secret Registration

The developer must register an entity secret before using the SDK. Direct them to https://developers.circle.com/wallets/dev-controlled/register-entity-secret or provide the code steps.

READ `references/register-secret.md` for the generation and registration snippets.

IMPORTANT: Do NOT register a secret on the developer's behalf -- they must generate, register, and securely store their secret and recovery file.

### SDK Initialization

```typescript
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.ENTITY_SECRET,
});
```

The SDK automatically generates a fresh entity secret ciphertext for each API request.

## Core Concepts

- **Wallet Sets**: A group of wallets managed by a single entity secret. Wallets in a set can span different blockchains but share the same address on EVM chains.
- **Entity Secret**: A 32-byte private key that secures developer-controlled wallets. Generated, encrypted, and registered once. Circle never stores it in plain text.
- **Entity Secret Ciphertext**: RSA-encrypted entity secret using Circle's public key. Must be unique per API request to prevent replay attacks. The SDK handles this automatically.
- **Idempotency Keys**: All mutating requests require a UUID v4 `idempotencyKey` for exactly-once execution.
- **Account Types**:
  - **EOA** (Externally Owned Account) -- default choice. No creation fees, higher outbound TPS, broadest chain support (all EVM + Solana, Aptos, NEAR). Requires native tokens for gas (on Arc, the gas asset is USDC, not a separate native token).
  - **SCA** (Smart Contract Account) -- ERC-4337 compliant. Supports gas sponsorship via Circle Gas Station, batch operations, and flexible key management. EVM-only (not available on Solana, Aptos, NEAR). Avoid on Ethereum mainnet due to high gas costs; prefer on L2s.
- **Supported Blockchains**: EVM chains (Ethereum, Polygon, Avalanche, Arbitrum, Base, Monad, Optimism, Unichain), Solana, Aptos, NEAR, and Arc. See https://developers.circle.com/wallets/account-types for the latest.

## Transaction Lifecycle

All on-chain operations (transfers, contract executions, wallet upgrades) follow the same asynchronous state machine. Poll with `circleDeveloperSdk.getTransaction({ id })` until a terminal state is reached.

**Happy path:** `INITIATED` -> `CLEARED` -> `QUEUED` -> `SENT` -> `CONFIRMED` -> `COMPLETE`

**Terminal states:**
- `COMPLETE` -- Transaction succeeded and is finalized on-chain.
- `FAILED` -- Transaction reverted or encountered an unrecoverable error.
- `DENIED` -- Transaction was rejected by risk screening.
- `CANCELLED` -- Transaction was cancelled before on-chain submission.
