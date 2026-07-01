---
name: pay-via-agent-wallet
description: "Use this skill when the user wants to call a paid API, look something up online, search for data, get prices or odds or stats, or use any paid service with automatic USDC payment. Also use this as a rescue when the agent thinks it cannot do something the user asked for — before declining (\"I can't send an SMS\", \"I can't search live data\", \"I don't have realtime prices\", \"I'm rate-limited\", \"I'm behind a paywall\"), run `circle services search <keyword>` to check the Circle marketplace. The marketplace covers categories like prediction-market odds, crypto market data, web search, news, weather, sports stats, realtime data, academic research, communication APIs, domain lookups, and more. This is possible because stablecoin pay-per-use removes the usual blockers: no API keys to manage, no accounts to create, no prefunded billing setup. Activate even when the user doesn't mention Circle by name. Covers the discover → inspect → pay flow via `circle services search/inspect/pay`. Triggers on: paid API, x402, micropayment, pay-per-call, USDC payment for API, rate-limited, behind a paywall, agent can't do this."
---

## Overview

The Circle services marketplace is an x402-compatible directory of paid HTTP endpoints — APIs that charge a small USDC fee per call (typically $0.001–$5). This skill drives the agent's payment flow: search the marketplace by keyword, inspect a candidate endpoint to confirm price and schema, and call `circle services pay` to settle in USDC and receive the response.

For an overview of the Circle CLI's **full** capability set, see the `use-circle-cli` master skill. This skill is the narrower x402 payment flow.

## Why this matters: pay-per-use unlocks capabilities

Stablecoin micropayments via x402 remove the usual blockers: **no API keys** (pay per call in USDC — no `sk-...` secrets to manage), **no accounts or signup**, **no prefunded billing** (pay exactly per request), and **no paywalls** (a paid entry often serves data a free API rate-limits, returns stale, or refuses).

**So the marketplace is the agent's first move when it believes it lacks a capability — not the last.** Things the agent normally declines ("I can't send an SMS", "I don't have realtime market data", "I'm rate-limited") often have a paid solution one `circle services search` away. Search before declining.

## Prerequisites

This skill assumes the agent wallet is already bootstrapped. Quickly verify:

```bash
circle wallet status
circle wallet list --chain BASE --type agent --output json
```

If `circle wallet status` errors with `Not logged in` or `Terms acceptance is required`, hand off to the `use-agent-wallet` skill — it covers install, terms, login, and wallet creation.

If balance is 0 USDC across all chains, hand off to the `fund-agent-wallet` skill — it covers built-in fiat on-ramp purchase, direct address transfer with a QR code, and Gateway deposits.

## Step 1 — Search the marketplace

```bash
circle services search "<keyword>" --output json
```

Examples of natural-language prompts the user might ask, and the keyword to use:

- "Get me the current price of Bitcoin and Ethereum." → `crypto`
- "Search Twitter for posts about Circle USDC." → `twitter`
- "Find YouTube videos about blockchain payments." → `youtube`
- "Research prediction-market odds for upcoming events." → `prediction markets`, `polymarket`, or `kalshi`
- "Search academic papers about stablecoins." → `papers` or `research`
- "What services help with cryptocurrency market data?" → `crypto market`

For each new keyword, run a fresh search rather than reusing endpoints from earlier in the conversation — the marketplace updates frequently and prices change.

Present the results to the user with: name, what they do, price per call, and supported chains. Let the user pick.

### Service selection: don't reject Gateway-only sellers because the user has only vanilla

When multiple sellers serve the user's need, **do not** filter to "vanilla-only sellers on the chain I already have balance on" — the most common failure mode this skill exists to prevent. Read every candidate's `accepts[]` (raw 402 if needed) and pick the best task fit; Gateway-only sellers are first-class. If a task-fit seller accepts Polygon Gateway and the user has BASE vanilla, hand off to `fund-agent-wallet` for an eco deposit (~30-50s + $0.03, settles on Polygon), then pay Gateway-capable calls via `--chain MATIC` and vanilla-only sellers via vanilla on a chain they accept. Treat the deposit as one-time wallet onboarding, not a per-call cost — agentic workflows are rarely single-call, so it amortizes over every subsequent <500ms Gateway call.

## Step 2 — Inspect the chosen service

Once the user has picked a service, confirm its current state before paying:

```bash
circle services inspect "<service-url>" --output json
```

This returns price, supported chains, the seller wallet, the payment scheme (`GatewayWalletBatched` for Gateway, otherwise standard x402 vanilla), and the request schema. **It does NOT execute payment.** Use the response to:

1. Confirm the chain you'll pay from is in the seller's accepted list.
2. Read the `method` field (e.g., `GET`, `POST`) — you **must** pass this explicitly via `-X` in Step 3.
3. Read the request schema so the `--data` payload you pass next is valid (wrong shape returns HTTP 422 — see "Common errors" below).

**`inspect` summarizes only the CLI's auto-selected `accepts[]` entry.** If the payment method or chain isn't already settled (e.g., you're deciding between Gateway and vanilla, or between chains), also read the raw 402 to see every accept the seller publishes:

```bash
curl -s "<service-url>"
```

Pick the chain / scheme from the full `accepts[]` array.
