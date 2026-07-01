---
name: fund-agent-wallet
description: "Fund a Circle agent wallet with USDC via the `circle` CLI. payments are gas-abstracted. users can pay with USDC only, no ETH required. Covers two top-level paths — fiat on-ramp (buy USDC with USD/credit card) and crypto transfer (send existing USDC to the wallet via QR or direct address). Also covers Gateway deposits (eco vs direct sub-paths) for the Nanopayments balance used by paid services. Use when the user wants to add USDC to their agent wallet, top up after a low balance, deposit into Gateway, or pick the right funding method. Triggers on: fund agent wallet, add USDC, fiat on-ramp, Gateway deposit, eco deposit, direct deposit, top up wallet, withdraw USDC, nanopayments."
---

## Overview

For an overview of the Circle CLI's **full** capability set — bridging, smart contract execution, x402 payment, and more — see the `use-circle-cli` master skill. This skill is the narrower funding flow.

Funding an agent wallet means putting USDC where the CLI can spend it. There are **two balance pools** to be aware of:

- **On-chain (vanilla x402)** — USDC sitting at the wallet address on a specific chain. Each chain is separate. Used to pay endpoints whose `accepts[]` does not include `GatewayWalletBatched`. Settles in one block.
- **Nanopayments (powered by Gateway)** — USDC held off-chain in your Circle Gateway balance, batched and settled for you across supported chains. Per source chain — no cross-chain pooling at payment time. Used to pay endpoints whose `accepts[]` includes `GatewayWalletBatched`. Settles in <500ms once the balance exists.

### Gas note
**Agent wallet payment flows are gas-abstracted** — users can pay with USDC without pre-funding native gas. 

This skill covers funding both pools. Pick the path with the shortest time-to-result and hide chain complexity from the user.

## Prerequisites

```bash
# Confirm session is good
circle wallet status

# Get the wallet address
circle wallet list --chain BASE --type agent --output json

# Check current on-chain balance (per chain)
circle wallet balance --address <addr> --chain BASE --output json

# Check current Gateway balance (per chain)
circle gateway balance --address <addr> --chain BASE --output json
```

If `circle wallet status` errors with "Not logged in" or "Terms acceptance is required", hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

## Step 1 — Pick a funding path

Ask the user: *"How would you like to fund your wallet?"*

- **Fiat (USD or local currency)** — Buy USDC with a card or bank transfer via the CLI's built-in fiat on-ramp. Best for users who don't have crypto yet.
- **Existing USDC** — Send USDC from a wallet they already have (MetaMask, Coinbase, Phantom, etc.). Faster and free of on-ramp fees.
- **Gateway deposit (advanced)** — Move existing on-chain USDC into the Gateway balance for low-latency batched payments. Only useful if the seller they're paying supports Gateway on a specific chain.

**Default recommendation: existing USDC → BASE.** Fastest, lowest friction, and BASE is the most commonly accepted chain across the marketplace.

## Step 2 — Required flags for non-interactive use

The CLI prompts for missing values when run interactively. **Agents are non-interactive**, so every `circle wallet fund` invocation against mainnet MUST include:

- `--address <addr>` — wallet address from `circle wallet list`
- `--chain <chain>` — e.g. `BASE`
- `--method <fiat|crypto>` — without it: `Error: --method is required in non-interactive mode.`
- `--amount <number>` — USDC amount; without it: `Error: --amount is required.`

`--token usdc` is the default and can be omitted, but pass it explicitly when the user asked for USDC specifically.

## Path A — Fiat on-ramp

Opens a fiat on-ramp window in the user's default browser. Funds deposit directly to the wallet on the selected chain.

```bash
circle wallet fund --address <addr> --chain BASE --amount 25 --token usdc --method fiat --open
```

The user completes purchase in the on-ramp window. USDC arrives in the wallet on the selected chain after on-ramp settlement (typically minutes for card, longer for bank transfer).

Verify after the user reports purchase complete:

```bash
circle wallet balance --address <addr> --chain BASE --output json
```

## Path B — Crypto transfer (existing USDC)

The user already holds USDC somewhere (another wallet, an exchange, etc.) and wants to send it to the agent wallet.

### Recommended — browser-rendered QR (best UX)

```bash
circle wallet fund --address <addr> --chain BASE --amount 10 --token usdc --method crypto --open
```

`--open` renders the EIP-681 QR code on a local HTML page in the user's default browser.
