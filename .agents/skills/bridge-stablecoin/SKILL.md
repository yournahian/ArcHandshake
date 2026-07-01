---
name: bridge-stablecoin
description: "Build USDC bridging with Circle App Kit or standalone Bridge Kit SDK and Crosschain Transfer Protocol (CCTP). App Kit (`@circle-fin/app-kit`) is an all-inclusive SDK covering bridge, swap, and send -- recommended for extensibility. Bridge Kit (`@circle-fin/bridge-kit`) is a standalone package for bridge-only use cases. Neither requires a kit key for bridge operations. Supports bridging USDC between EVM chains, between EVM chains and Solana, and between any two chains on Circle Wallets (i.e Developer-Controlled Wallets or Programmable wallets). Use when: bridge USDC, setting up Bridge Kit adapters (Viem, Ethers, Solana Kit, Circle Wallets), handling bridge events, collecting custom fees, configuring transfer speed, or using the Forwarding Service. Triggers on: bridge USDC, CCTP, move USDC between chains, @circle-fin/bridge-kit, @circle-fin/app-kit, forwarding service."
---

## Overview

Crosschain Transfer Protocol (CCTP) is Circle's native protocol for burning USDC on one chain and minting it on another. App Kit (`@circle-fin/app-kit`) is Circle's all-inclusive SDK covering bridge, swap, and send in one package; standalone Bridge Kit (`@circle-fin/bridge-kit`) ships the same bridge API in a lighter package. Both orchestrate the full CCTP lifecycle -- approve, burn, attestation fetch, mint -- in a single `kit.bridge()` call across EVM and Solana. **Recommend App Kit** unless the user wants bridge-only functionality. **Bridge operations need no kit key** (only swap/send in App Kit do).

## Prerequisites / Setup

### Installation

App Kit with Viem adapter (recommended):

```bash
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2
```

Bridge Kit standalone with Viem adapter:

```bash
npm install @circle-fin/bridge-kit @circle-fin/adapter-viem-v2
```

For Solana support, also install:

```bash
npm install @circle-fin/adapter-solana-kit
```

For Circle Wallets (developer-controlled) support:

```bash
npm install @circle-fin/adapter-circle-wallets
```

### Environment Variables

```
PRIVATE_KEY=              # EVM wallet private key (hex, 0x-prefixed)
EVM_PRIVATE_KEY=          # EVM private key (when also using Solana)
SOLANA_PRIVATE_KEY=       # Solana wallet private key (base58)
CIRCLE_API_KEY=           # Circle API key (for Circle Wallets adapter)
CIRCLE_ENTITY_SECRET=     # Entity secret (for Circle Wallets adapter)
EVM_WALLET_ADDRESS=       # Developer-controlled EVM wallet address
SOLANA_WALLET_ADDRESS=    # Developer-controlled Solana wallet address
```

No `KIT_KEY` is needed for bridge operations. A kit key is only required if you also use swap or send features via App Kit.

### SDK Initialization

**App Kit** (recommended):

```ts
import { AppKit } from "@circle-fin/app-kit";

const kit = new AppKit();
```

**Bridge Kit** (standalone):

```ts
import { BridgeKit } from "@circle-fin/bridge-kit";

const kit = new BridgeKit();
```

## Decision Guide

ALWAYS walk through these questions with the user before writing any code. Do not skip steps or assume answers.

### SDK Choice

**Question 1 -- Will you need swap or send functionality in the future?**
- Yes, or unsure -> **App Kit** (recommended) -- single SDK covers bridge + swap + send, easier to extend later
- No, bridge-only and will never need swap or send -> **Bridge Kit** -- standalone, lighter package for bridge-only use cases

### Wallet / Adapter Choice

**Question 2 -- How do you manage your wallet/keys?**
- Managing your own private key (self-custodied, stored in env var or secrets manager) -> Question 3
- Using Circle developer-controlled wallets (Circle manages key storage and signing) -> Use Circle Wallets adapter. READ `references/adapter-circle-wallets.md`
- Using browser wallets (wagmi, ConnectKit, RainbowKit) -> Use wagmi adapter. READ `references/adapter-wagmi.md`

**Question 3 -- Which chains are you bridging between?**
- EVM-to-EVM or EVM-to-Solana -> Use Viem and/or Solana Kit adapters. READ `references/adapter-private-key.md`

## Core Concepts

- **CCTP steps**: Every bridge transfer executes four sequential steps -- `approve` (ERC-20 allowance), `burn` (destroy USDC on source chain), `fetchAttestation` (wait for Circle to sign the burn proof), and `mint` (create USDC on destination chain).
- **Adapters**: Both App Kit and Bridge Kit use adapter objects to abstract wallet/signer details.
