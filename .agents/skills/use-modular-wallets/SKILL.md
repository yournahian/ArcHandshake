---
name: use-modular-wallets
description: "Build crypto wallets using Circle Modular Wallets SDK with passkey authentication, gasless transactions, and extensible module architecture. Use when: creating crypto wallets with passkey-based (WebAuthn) registration and login, sending gasless transactions using Circle Gas Station paymaster, batching multiple transactions into a single user operation, implementing passkey recovery using BIP-39 mnemonic phrases, building advanced onchain wallets with custom modules (multisig, subscriptions, session keys). Triggers on: MSCA, passkey authentication, WebAuthn, paymaster, Gas Station, ERC-4337, ERC-6900, toCircleSmartAccount, toModularTransport, sendUserOperation, 2D nonce, passkey recovery, EIP-1193 provider."
---

## Overview

Modular Wallets are flexible smart contract accounts (MSCAs) that extend functionality through installable modules. Built on ERC-4337 (account abstraction) and ERC-6900 (modular smart contract framework), they support passkey authentication, gasless transactions, batch operations, and custom logic modules (multisig, subscriptions, session keys). MSCAs are lazily deployed -- gas fees for account creation are deferred until the first outbound transaction.

## Prerequisites / Setup

### Installation

```bash
npm install @circle-fin/modular-wallets-core viem
```

For passkey recovery, also install:

```bash
npm install bip39
```

### Environment Variables

```
CLIENT_KEY=     # Circle Console client key for app identification
CLIENT_URL=     # Circle Client URL (e.g., https://modular-sdk.circle.com/v1/rpc/w3s/buidl)
```

Before using the SDK, complete the [Console Setup](https://developers.circle.com/wallets/modular/console-setup.md):

1. Create a Client Key in the Circle Console
2. Configure the Passkey Domain (passkeys are domain-bound)
3. Retrieve the Client URL

## Quick Reference

### Supported Chains

| Chain | Mainnet | Testnet |
|-------|---------|---------|
| Arc | No | Yes |
| Arbitrum | Yes | Yes |
| Avalanche | Yes | Yes |
| Base | Yes | Yes |
| Monad | Yes | Yes |
| Optimism | Yes | Yes |
| Polygon | Yes | Yes |
| Unichain | Yes | Yes |

For the latest supported blockchains: https://developers.circle.com/wallets/account-types.md (MSCA chain restrictions are in Rules below.)

### Transport URL Path Segments

The `toModularTransport` URL requires the chain path segment appended to the client URL:

| Chain | Mainnet Path | Testnet Path |
|-------|-------------|-------------|
| Arbitrum | `/arbitrum` | `/arbitrumSepolia` |
| Arc | -- | `/arcTestnet` |
| Avalanche | `/avalanche` | `/avalancheFuji` |
| Base | `/base` | `/baseSepolia` |
| Monad | `/monad` | `/monadTestnet` |
| Optimism | `/optimism` | `/optimismSepolia` |
| Polygon | `/polygon` | `/polygonAmoy` |
| Unichain | `/unichain` | `/unichainSepolia` |

Example: `toModularTransport(\`${clientUrl}/polygonAmoy\`, clientKey)` for Polygon Amoy testnet.

## Core Concepts

- **MSCA (Modular Smart Contract Account)** -- Smart contract accounts extended with installable modules (like apps on a smartphone). Ownership can be single owner, multi-owner, passkeys, or multi-sig.
- **Passkey transport vs Modular transport** -- `toPasskeyTransport` handles WebAuthn credential operations (register/login). `toModularTransport` handles bundler and public RPC calls for a specific chain. They are separate transports with different purposes.
- **Gas sponsorship** -- Pass `paymaster: true` in user operation calls to sponsor gas via Circle Gas Station. End users pay zero gas fees.
- **Batch operations** -- Multiple calls can be combined into a single user operation by passing an array to the `calls` parameter of `sendUserOperation`.
- **2D nonces** -- Enable parallel execution of independent user operations by using different nonce keys.
- **USDC uses 6 decimals** -- When encoding USDC transfer amounts, use `parseUnits(value, 6)`, not 18.
- **Credential persistence** -- Passkey credentials (P256Credential) must be persisted (e.g., httpOnly cookies) and restored on reload to maintain the user session.
