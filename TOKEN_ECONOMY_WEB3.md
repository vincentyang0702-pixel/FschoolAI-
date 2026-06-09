# FschoolAI × NeuroAGI — Web3 Token Economy Partnership Architecture
**Strategic Design Document | v1.0 | Confidential**

---

## The Core Thesis

FschoolAI's token system (FST) is not a loyalty points programme. It is the foundation of a **closed-loop token economy** — a network where academic behaviour generates verifiable on-chain value, and that value flows through a tripartite partnership structure spanning compute, distribution, and financial settlement. This is the same model that powers the most durable Web3 ecosystems: one layer provides the infrastructure, one layer provides the users, and one layer handles the money.

The difference between FschoolAI and every other EdTech token experiment is that **our tokens are earned, not bought, and every earn event is cryptographically anchored to a real academic outcome** (Canvas submission timestamp, grade delta, verified study session). This makes FST one of the only token systems in existence where the underlying asset — a student's verified academic effort — has intrinsic, auditable value independent of speculation.

---

## Part 1 — The Tripartite Partnership Model

Every sustainable token economy requires three distinct layers operated by partners who each focus on their core competency. Building all three in-house is how token projects fail. The PATEO / Xunce / Saimo model in automotive AI billing is the clearest precedent: one partner owns the hardware and compute, one owns the user relationship, one owns the financial rails. FschoolAI follows the same structure.

### Layer 1 — Compute & Intelligence (NeuroAGI)

**Role:** Provides the AI infrastructure that makes tokens meaningful. Without a brain that actually knows the student, FST is just a gamification badge. NeuroAGI's brain OS is what makes each token a verified signal of real cognitive engagement.

**What NeuroAGI contributes to the token economy:**
- The brain context window that validates every earn event (was this a real study session or tab-switching?)
- The knowledge mastery graph that determines when a "grade improvement" token is genuinely earned vs. a lucky exam
- The local model layer (BriLLM, future hardware) that processes signals without sending raw data to the cloud — enabling privacy-preserving token validation
- The Brain API that third-party apps can call to verify a student's academic credentials without accessing raw data

**Token flow:** NeuroAGI receives a **compute fee** denominated in FST for every brain operation that validates a token earn event. This creates a direct economic loop: the more students earn tokens, the more compute NeuroAGI processes, the more FST flows to the compute layer.

---

### Layer 2 — Distribution & Application (FschoolAI)

**Role:** Owns the student relationship, the Canvas integration, and the daily-use surface. FschoolAI is where tokens are earned and where the leaderboard, Study Room, and partner exchange live. It is the **demand side** of the token economy — the entity that creates the reasons to earn and spend FST.

**What FschoolAI contributes:**
- The verified earn events (Canvas-anchored, tamper-proof)
- The leaderboard and social layer that makes token accumulation visible and competitive
- The partner exchange marketplace where FST is redeemed
- The university distribution channel (B2B2C) that onboards thousands of students per institution
- The Chrome extension that captures Canvas signals at the source

**Token flow:** FschoolAI issues FST on every verified earn event. It also collects FST from partner redemptions (the partner pays FschoolAI in fiat; FschoolAI uses that fiat to buy back FST from the open pool, maintaining token supply equilibrium).

---

### Layer 3 — Financial Settlement & Compliance (Partner Protocol)

**Role:** Handles the on-chain settlement, stablecoin reserve design, regulatory compliance, and cross-border token operations. This is the layer that FschoolAI should **not** build in-house — it requires financial licensing, AML/KYC infrastructure, and blockchain engineering that is orthogonal to the core product.

**Target partner profile:** A Web3 fintech or token protocol that already has:
- Regulatory licences in Canada, US, and key markets
- Stablecoin reserve management experience
- On-chain settlement infrastructure (Solana, Base, or Polygon preferred for low fees)
- Experience with utility token compliance (not securities)

**What the financial settlement partner contributes:**
- On-chain FST issuance and burn mechanics
- Stablecoin reserve backing FST redemptions (1 FST = $0.001 USD floor value, backed by partner redemption pool)
- Cross-border settlement for international students redeeming tokens across different currencies
- Regulatory compliance layer — ensuring FST is classified as a utility token, not a security, across all operating jurisdictions
- Audit trail for all token earn events (immutable on-chain record of academic achievements)

**Token flow:** The financial settlement partner earns a **settlement fee** (0.5–1% of all redemption volume) and holds the stablecoin reserve. In return, it provides the legal and financial infrastructure that allows FschoolAI to operate the token economy without building a fintech company.

---

## Part 2 — Token Architecture & On-Chain Design

### FST Token Specification

| Parameter | Value |
|---|---|
| Token Name | FschoolAI Token |
| Symbol | FST |
| Standard | ERC-20 (Ethereum) or SPL (Solana) — TBD based on settlement partner |
| Total Supply | Uncapped (earn-only issuance, no pre-mine) |
| Issuance Mechanism | Minted on verified earn event, burned on redemption |
| Floor Value | $0.001 USD (backed by partner redemption reserve) |
| Transferability | Non-transferable between users (soulbound within student wallet) |
| Exportability | Transferable to NeuroAGI Brain Wallet on graduation (Brain Migration) |

### Why Soulbound?

FST tokens are **soulbound** — they cannot be transferred, sold, or traded between wallets. This is a deliberate design choice that distinguishes FST from speculative tokens and keeps the system focused on genuine academic behaviour:

1. **Anti-gaming:** You cannot buy tokens from another student or sell your earned tokens. The only way to have tokens is to study.
2. **Regulatory clarity:** Non-transferable utility tokens have a much cleaner regulatory profile than tradeable tokens. They are closer to airline miles than securities.
3. **Identity anchoring:** Each token is cryptographically linked to the student's verified identity (Canvas login + university email). This makes FST a **verifiable academic credential** — an on-chain proof of engagement that travels with the student.

### Token Lifecycle

```
EARN EVENT (Canvas-verified)
        ↓
Brain validates signal (NeuroAGI compute layer)
        ↓
FST minted to student's Brain Wallet (on-chain)
        ↓
Student accumulates FST → unlocks tiers → redeems rewards
        ↓
REDEMPTION: Student spends FST on partner reward
        ↓
Partner pays FschoolAI in fiat
        ↓
FschoolAI burns equivalent FST from supply
        ↓
Settlement partner records burn on-chain, updates reserve
```

### The Stablecoin Reserve

The financial settlement partner maintains a **stablecoin reserve** (USDC) that backs the redemption floor of FST. The reserve is funded by:
1. Partner redemption fees (primary source)
2. University enterprise contracts (secondary source)
3. A small percentage of subscription revenue (tertiary source)

The reserve ensures that FST always has a minimum redemption value, preventing the token from becoming worthless if a partner exits the programme. This is the key difference between FST and most loyalty token systems — there is a real financial backstop.

---

## Part 3 — Partnership Dynamics & Risk Allocation

### Risk Distribution Across Three Layers

| Risk Type | Who Bears It | Mitigation |
|---|---|---|
| AI compute cost overrun | NeuroAGI | Compute fee is denominated in FST, not fiat — cost scales with token volume |
| Partner redemption default | Settlement partner | Stablecoin reserve covers shortfall |
| Regulatory classification (utility vs. security) | Settlement partner + FschoolAI jointly | Soulbound design + legal opinion from settlement partner |
| User acquisition | FschoolAI | University B2B2C channel de-risks cold-start |
| Token inflation | Settlement partner | Burn mechanics on every redemption |
| Brain data privacy | NeuroAGI | Local model processes raw signals; only anonymised signals go on-chain |

### Commercial Scalability Path

The tripartite model enables a clear commercial scaling path that no single company could achieve alone:

**Phase 1 (0–1,000 users):** FST operates as an off-chain points system. No blockchain, no settlement partner needed. This keeps complexity low while the earn/redeem mechanics are validated with real users.

**Phase 2 (1,000–10,000 users):** FST migrates on-chain. Settlement partner is onboarded. Stablecoin reserve is established. Partner redemption volume justifies the infrastructure cost.

**Phase 3 (10,000–100,000 users):** University enterprise contracts are signed. FST becomes a recognised academic credential. Settlement partner handles cross-border operations. NeuroAGI Brain Wallet is launched — students carry their FST (and their brain) from university into the workforce.

**Phase 4 (100,000+ users):** FST is recognised by employers as a verified signal of academic engagement. A student with 50,000 FST and a Brain Owner tier has a cryptographically verifiable record of 4 years of consistent, high-quality academic work. This is the **resume of the future**.

---

## Part 4 — Target Partnership Candidates

### Compute Layer (NeuroAGI)
Already internal — NeuroAGI is the compute partner by design.

### Distribution Layer (FschoolAI)
Already internal — FschoolAI is the distribution partner by design.

### Financial Settlement Layer — Target Candidates

| Candidate | Why | Status |
|---|---|---|
| **Coinbase (Base L2)** | Base is purpose-built for consumer crypto apps, low fees, US regulatory clarity, Coinbase has university programmes | Target |
| **Circle (USDC)** | USDC is the dominant stablecoin for reserve design, Circle has enterprise partnerships, strong regulatory standing | Target |
| **Solana Foundation** | Solana's speed and low fees are ideal for high-frequency micro-transactions (every study session = one token event), strong developer ecosystem | Target |
| **Stripe (Crypto Payouts)** | Stripe already handles FschoolAI's subscription billing; Stripe Crypto could handle FST-to-fiat conversion for partner payouts | Existing relationship |
| **World App (Worldcoin)** | Worldcoin's World ID provides the identity verification layer needed for soulbound tokens — proof of personhood anchors FST to a unique human | Exploratory |

### Distribution Amplifiers — Strategic Alliances

Beyond the core tripartite structure, FschoolAI can form **distribution alliances** with companies that want access to the verified student demographic:

| Alliance Type | Target Partner | Value Exchange |
|---|---|---|
| **LMS Integration** | Instructure (Canvas parent company) | Canvas API access + co-marketing; FschoolAI becomes the official AI layer on Canvas |
| **University ERP** | Workday Student, Banner (Ellucian) | FST as verified academic credential fed into university records systems |
| **Employer Verification** | LinkedIn, Handshake | FST earn history as a verifiable signal on student profiles — "this student studied 1,200 hours in 4 years" |
| **EdTech Ecosystem** | Coursera, Duolingo, Khan Academy | Cross-platform token earn — FST earned on FschoolAI can be spent on Coursera certificates |
| **Hardware Ecosystem** | Apple (Education), Lenovo (student laptops) | FST earn events triggered by device usage patterns — study on your MacBook, earn FST |

---

## Part 5 — The MOU Framework

When approaching financial settlement partners, FschoolAI should propose a **Memorandum of Understanding (MOU)** that covers:

1. **Token Architecture Agreement** — joint definition of FST issuance, burn, and reserve mechanics
2. **Platform Integration Scope** — which APIs and SDKs each party provides
3. **Revenue Share** — settlement partner earns 0.5–1% of redemption volume; FschoolAI retains the rest
4. **Regulatory Responsibility** — settlement partner is responsible for token classification opinions and compliance filings in each jurisdiction
5. **Data Boundaries** — FschoolAI provides anonymised aggregate earn data; no individual student data crosses to the settlement layer
6. **Exit Provisions** — if a partner exits, the stablecoin reserve is transferred to a successor partner; FST redemptions are honoured for 180 days post-exit

---

*Document version: 2025-06-09 v1.0 | Author: Vincent Yang / FschoolAI*
*Confidential — for strategic partner discussions only*
