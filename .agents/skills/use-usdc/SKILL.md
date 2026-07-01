---
name: use-usdc
description: "USDC is Circle's stablecoin deployed across multiple blockchain ecosystems including EVM chains (Ethereum, Base, Arbitrum, Polygon, Arc) and Solana. Use this skill to check balances, send transfers, approve spending, and verify transactions. Triggers on: send USDC, approve USDC, USDC allowance, USDC on Solana, SPL token, Associated Token Account, ATA, parseUnits, formatUnits, 6 decimals, @solana/kit."
---

## Overview

USDC is Circle's stablecoin deployed across multiple blockchain ecosystems. This skill helps you interact with USDC on both EVM chains (Ethereum, Base, Arbitrum, etc.) and Solana. It covers balance checks, transfers, approvals, and transfer verification.

## Prerequisites / Setup

### Determine Ecosystem

First, identify which ecosystem the user is working with:

- **EVM**: User has an Ethereum-style address (`0x...`) or mentions Ethereum, Base, Arbitrum, Polygon, etc.
- **Solana**: User has a base58 address or mentions Solana, Devnet, Phantom, Solflare, etc.
- **Unclear**: Ask which ecosystem before proceeding.

### Dependencies

**EVM:**
```bash
npm install viem
```

**Solana:**
```bash
npm install @solana/kit @solana-program/token ws dotenv bs58
```

### Environment Variables

See ecosystem-specific guides:
- **EVM**: Private key handling covered in `references/evm.md`
- **Solana**: Private key handling covered in `references/solana.md`

**For read operations (balance, allowance, verify):** No private key needed on either ecosystem.

## Quick Reference

### USDC Contract Addresses

Canonical source: https://developers.circle.com/stablecoins/usdc-contract-addresses

#### EVM Testnet

| Chain | Chain ID | USDC Address |
|-------|----------|-------------|
| Arc Testnet | 5042002 | `0x3600000000000000000000000000000000000000` |
| Ethereum Sepolia | 11155111 | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Arbitrum Sepolia | 421614 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| Avalanche Fuji | 43113 | `0x5425890298aed601595a70AB815c96711a31Bc65` |
| Polygon Amoy | 80002 | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |
| OP Sepolia | 11155420 | `0x5fd84259d66Cd46123540766Be93DFE6D43130D7` |

Get testnet USDC: https://faucet.circle.com

#### EVM Mainnet

| Chain | USDC Address |
|-------|-------------|
| Ethereum | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Polygon PoS | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |
| Avalanche | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` |
| OP Mainnet | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |

#### Solana

| Network | USDC Mint |
|---------|-----------|
| Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

### The 6-Decimal Rule

USDC uses **6 decimals on all ecosystems**.
```ts
// EVM (viem)
parseUnits("1.00", 6);    // 1_000_000n (CORRECT - $1 USDC)
parseUnits("1.00", 18);   // 1_000_000_000_000_000_000n (WRONG - 1 trillion dollars)

// Solana - convert manually
const amount = Math.floor(1.00 * 1_000_000); // 1_000_000 (CORRECT - $1 USDC)
const human = rawAmount / 1_000_000;          // 1.0 (CORRECT - converts back to dollars)
```

### Arc USDC Duality

On Arc, USDC is both the **native gas token** and an **ERC-20** at `0x3600...`. Same underlying balance, different decimal exposure.

| Context | Decimals | Use |
|---------|----------|-----|
| Native (gas, `msg.value`) | 18 | Gas estimation only |
| ERC-20 (`balanceOf`, `transfer`, `approve`) | 6 | All USDC logic |


**For Arc-specific setup and configuration**, see the `use-arc` skill.
