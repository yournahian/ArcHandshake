---
name: use-agent-wallet
description: "Set up and manage a Circle agent wallet through the `circle` CLI. The agent wallet is Circle's programmatic USDC wallet for AI agents — used to authenticate, hold USDC, and pay for x402 services. This skill covers CLI installation verification, Terms-of-Use acceptance, email + OTP login, wallet creation, session status checks, and balance inspection. Use whenever the user wants to set up, log in to, or inspect the state of their Circle agent wallet, or whenever a downstream skill (like paying for an x402 service or funding the wallet) needs the wallet bootstrapped first. Triggers on: circle wallet login, circle wallet create, circle wallet status, set up Circle agent wallet, terms acceptance, install Circle CLI, x402 setup."
---

## Overview

The Circle CLI (`@circle-fin/cli`, command `circle`) provides a programmatic agent wallet — a non-custodial USDC wallet designed for AI agents to authenticate, hold balances, and pay for paid x402 services on Circle's marketplace. This skill is the bootstrap surface for that wallet: install check, terms acceptance, login, wallet creation, and status inspection. After bootstrap completes, downstream operations (paying for services, funding, spending policy) hand off to dedicated skills.

For an overview of the Circle CLI's **full** capability set — bridging, smart contract execution, transaction inspection, and more — see the `use-circle-cli` master skill. This skill is the narrower bootstrap/identity surface.

## Prerequisites / Setup

### Step 1 — Verify the CLI is installed

```bash
which circle || command -v circle
circle --version
```

If not installed:

```bash
npm install -g @circle-fin/cli
```

`circle --version` also surfaces any server-driven update notice (never blocks). If one prints, suggest `npm install -g @circle-fin/cli@latest` — but only when contextually relevant (session start, or unexpected output), not on every command.

### Step 2 — Check session status

**Always check whether the user is already logged in before attempting login.**

```bash
circle wallet status
```

Possible outcomes:

- **Logged in** — output shows email, wallet type (`agent`), and session expiry. Tell the user "You're already logged in as `<email>`. Continue with this session?" and skip to Step 4.
- **Not logged in** — output is `Error: Not logged in. Run 'circle wallet login <email> --type agent' to authenticate.` Proceed to Step 3.
- **Terms not accepted** — output is `Error: Circle CLI Terms acceptance is required before use.` Stop and complete the **Terms-of-Use Gate** below before proceeding. Do NOT run `circle terms accept` without explicit user consent.

## Step 3 — Login (email + OTP, two-step non-interactive flow)

Circle's CLI supports a two-step OTP login designed for AI agents and other non-interactive contexts.

### 3a. Initialize login (request OTP)

Ask the user for their email address (do NOT guess or hardcode). Then:

```bash
circle wallet login <user-email> --type agent --init
```

`--type agent` defaults to `agent` so it can be omitted, but pass it explicitly here for consistency with the error text in Step 2.

Expected output:

```
OTP code sent to user@example.com
Please run: circle wallet login --request <request-id> --otp <code>
```

Parse the request ID from the output. It is a UUID; you will need it for the next step. Request IDs expire after 10 minutes and are single-use.

### 3b. Complete login (verify OTP)

Tell the user: "An OTP code has been sent to your email. Please share it (format: ABC-123456 or just the 6 digits)." If email- or messaging-integration tools are connected (e.g., Gmail or Slack via MCP), the OTP can also be fetched through them — note the option to the user; how to share it is their call. Then:

```bash
circle wallet login --type agent --request <request-id> --otp <user-otp>
```

OTP format notes:

- Full form: `ABC-123456`
- Bare digits: `123456` — the CLI prepends the cached prefix automatically
- The CLI validates the prefix matches what was sent (anti-phishing)

If successful, output is:

```
Logged in as user@example.com
```

Tell the user "Successfully logged in" and continue. If the call fails (`Invalid or expired request ID`, `OTP prefix mismatch`, `Invalid OTP`), restart from 3a to generate a fresh OTP — do NOT loop without telling the user.

### 3c. Verify session

```bash
circle wallet status
```

Confirms the session and surfaces expiry. Proceed to Step 4.

### Logging out / switching accounts

```bash
circle wallet logout
```

Use only when the user explicitly asks to switch accounts.

## Step 4 — Check or create the agent wallet

**The `--chain` flag is REQUIRED for `circle wallet list` and `circle wallet create`.**
