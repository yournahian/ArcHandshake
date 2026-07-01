---
name: use-user-controlled-wallets
description: "Build non-custodial wallets where end users retain control of their private keys via Circle's user-controlled wallets SDK. Supports Google, Apple, Facebook social login, email OTP, and PIN authentication with MPC-based key management. Covers wallet creation, token transfers, message signing, smart contract execution, and wallet management. Triggers on: user-controlled wallets, social login wallet, email OTP wallet, PIN wallet, w3s-pw-web-sdk, executeChallenge, MPC wallet, userToken, deviceToken, contract execution."
---

## Overview

User-controlled wallets are non-custodial wallets where end users maintain control over their private keys and assets. Users authorize all sensitive operations (transactions, signing, wallet creation) through a challenge-response model that ensures user consent before execution. Multi-chain support includes EVM chains, Solana, and Aptos.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/user-controlled-wallets@latest @circle-fin/w3s-pw-web-sdk@latest vite-plugin-node-polyfills
```

### Vite Configuration

The SDKs depends on Node.js built-ins (`buffer`, `crypto`, etc.) that are not available in the browser. Add `vite-plugin-node-polyfills` to your Vite config:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills()],
});
```

### Environment Variables

```bash
# Backend
CIRCLE_API_KEY=          # Circle API key

# Frontend
CIRCLE_APP_ID=           # App ID from Wallets > User Controlled > Configurator
```

### Backend SDK Initialization

Uses `@circle-fin/user-controlled-wallets` for all server-side operations (user creation, challenge creation, transaction queries).

```typescript
import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";

const circleClient = initiateUserControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
});
```

### Frontend SDK Initialization

Uses `@circle-fin/w3s-pw-web-sdk` for user-facing operations (challenge execution, auth flows, PIN/OTP/OAuth UI).

```typescript
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

const sdk = new W3SSdk({ appSettings: { appId: circleAppId } });
```

IMPORTANT: You must call `sdk.getDeviceId()` after SDK initialization. This establishes a session with Circle's service via an iframe. Without this call, `sdk.execute()` will silently fail.

For email OTP and social login, the SDK must be initialized with a login callback as the second argument. See the corresponding reference files for details.

## Core Concepts

### Account Types

User-controlled wallets support **EOA** and **SCA** account types, chosen at wallet creation.

**EOA (Externally Owned Account)**: No creation fees, higher TPS, broadest chain support (EVM, Solana, Aptos). Requires native tokens for gas on EVM chains (on Arc, that gas asset is USDC — there is no separate native token). Gas sponsorship only available on Solana via `feePayer`.

**SCA (Smart Contract Account)**: ERC-4337 account abstraction. Gas sponsorship via Circle Gas Station paymaster, batch operations, flexible key management. EVM-only (no Solana/Aptos). First outbound transaction incurs gas for lazy deployment. Avoid on Ethereum mainnet due to high gas -- use on L2s (Arbitrum, Base, Polygon, Optimism).

For supported blockchains by account type: https://developers.circle.com/wallets/account-types

### Architecture

User-controlled wallets involve three parties:

1. **End User (Client)** -- The person using a web app or mobile app. They interact with the developer's frontend, authenticate (PIN, email OTP, or social login), and approve all sensitive operations (wallet creation, transactions, signing) through Circle's hosted UI via `@circle-fin/w3s-pw-web-sdk`. Users retain full control of their private keys -- neither the developer nor Circle can act on their behalf.

2. **Developer Service (Backend)** -- The developer's own server. It holds the Circle API key, manages user sessions, tracks usage, and enforces application-level guardrail rules (e.g., spending limits, allowlisted addresses, rate limiting). It submits requests to Circle's API using `@circle-fin/user-controlled-wallets`. Developers register a developer account through the [Circle Developer Console](https://developers.circle.com/w3s/circle-developer-account) to get access to Circle Wallet services. For developer-specific account setup, see the `use-developer-controlled-wallets` skill.

3. **Circle Wallet Service (API)** -- Circle's infrastructure that manages wallet creation, transaction submission, key management (MPC-based), and blockchain interactions. It provides the non-custodial guarantee: developers get read access for security monitoring and auditing, while users keep full control of their wallets and assets. Circle enforces platform-level compliance screening (e.g., OFAC sanctions checks) on transactions.

**Request flow:**

```
End User (browser/mobile)
    |  authenticates & approves challenges
    v
Developer Service (backend server)
    |  adds API key, enforces app-level guardrails, tracks usage
    v
Circle Wallet Service (API)
    |  manages wallets, enforces compliance screening, submits transactions
    v
Blockchain
```

### Challenge-Response Model

All sensitive operations (wallet creation, transactions, signing) follow this pattern.
