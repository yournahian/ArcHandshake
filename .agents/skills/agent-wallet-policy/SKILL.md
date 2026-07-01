---
name: agent-wallet-policy
description: "View spending policy on a Circle agent wallet — per-transaction, daily, weekly, and monthly USDC caps via the `circle` CLI. Use when the user wants to inspect current limits. Setting or resetting limits requires OTP confirmation in an interactive terminal session — the agent hands the user a verbatim command to run themselves; the OTP must never pass through agent storage. Mainnet-only — testnet chains are rejected. Triggers on: spending limit, spending policy, per-tx cap, daily cap, weekly cap, monthly cap, wallet rules, OTP confirmation."
---

## Overview

For an overview of the Circle CLI's **full** capability set, see the `use-circle-cli` master skill. This skill is the narrower spending-policy flow.

Circle agent wallets support **spending policies** — per-wallet caps that the CLI enforces on every payment and transfer. There are three operations:

| Operation | Command | OTP required? |
|---|---|---|
| **View** current limits | `circle wallet limit --address <addr> --chain BASE --output json` | No |
| **Set** custom limits | `circle wallet limit set ...` | **Yes — human OTP, run in user's own terminal** |
| **Reset** to defaults | `circle wallet limit reset ...` | **Yes — human OTP, run in user's own terminal** |

Spending policies are **mainnet-only** (testnet chains are rejected; see Troubleshooting / Rules).

## Prerequisites

```bash
# Confirm session is good
circle wallet status

# Get the wallet address
circle wallet list --chain BASE --type agent --output json
```

If `circle wallet status` errors with "Not logged in" or "Terms acceptance is required", hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

## Viewing current limits (in-agent, no OTP)

```bash
circle wallet limit --address <addr> --chain BASE --output json
```

Shows the current per-tx, daily, weekly, and monthly USDC caps (`null` for any unset tier). Safe to call freely — read-only, no money moves, no OTP.

## Setting or resetting limits (interactive terminal — handoff to user)

`circle wallet limit set` and `circle wallet limit reset` are **interactive**. They send a 6-digit OTP to the user's email mid-execution and wait for the code at the CLI's stdin prompt.

**OTPs are password-equivalent. The agent must NOT receive, store, or relay the OTP.** The agent's job here is to hand the user a verbatim command to run in their own terminal, then wait for them to report back.

### Step 1 — Confirm values with the user

Limits must be **monotonic**: `per-tx ≤ daily ≤ weekly ≤ monthly`.

A typical conservative configuration:

| Tier | Suggested USDC value |
|---|---|
| `--per-tx` | `1` |
| `--daily` | `5` |
| `--weekly` | `20` |
| `--monthly` | `50` |
