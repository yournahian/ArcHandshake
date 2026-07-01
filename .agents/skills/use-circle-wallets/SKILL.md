---
name: use-circle-wallets
description: "Choose and implement the right Circle wallet type for your application. Compares developer-controlled, user-controlled, and modular (passkey) wallets across custody model, key management, account types, blockchain support, and use cases. Use whenever blockchain wallet integrations are required for onchain application development. Triggers on: which wallet, choose wallet, wallet comparison, EOA vs SCA vs Modular Wallet, custody model, programmable wallets."
---

## Overview

Circle offers three wallet types -- developer-controlled, user-controlled, and modular -- each with different custody models, account types, key management, and capabilities. This skill helps you pick the right one.

## Quick Comparison

|                     | Developer-Controlled              | User-Controlled                | Modular (Passkey)                         |
|---------------------|-----------------------------------|--------------------------------|-------------------------------------------|
| **Custody**         | Developer                         | User                           | User                                      |
| **Auth**            | API key + entity secret (backend) | Social login / email OTP / PIN | Passkey (WebAuthn)                        |
| **Account types**   | EOA, SCA                          | EOA, SCA                       | Modular Wallet SCA (ERC-6900)             |
| **Gas sponsorship** | SCA via Circle Paymaster          | SCA via Circle Paymaster       | Circle Paymaster or third-party paymaster |
| **Custom modules**  | No                                | No                             | Yes                                       |
| **Architecture**    | Backend SDK only                  | Backend + frontend SDKs        | Frontend SDK only                         |

## Decision Guide

For the latest supported account types on different blockchains: https://developers.circle.com/wallets/account-types
