# FschoolAI × NeuroAGI — Web5 User Scenarios & Architecture
**Version: v2.0 (English) | Author: Vincent Yang / NeuroAGI**
**Status: Future Phase — Web5 features begin in Phase 2 (2026 Q1). Current build is Phase 0 (centralised Supabase).**

---

## Part 1 — Is Web5 Now or Later?

**Short answer: Later. But the architecture must be designed for it from Day 1.**

The current state of FschoolAI (Phase 0) stores all brain data in a centralised Supabase database. This is intentional — it is the fastest way to ship a working product and validate the core loop (Canvas sync → brain build → Reggie chat). Web5 infrastructure is not needed to prove that students want a personalised AI tutor.

Web5 becomes relevant at a specific inflection point: when users start asking *"who owns my brain data?"* and when NeuroAGI begins positioning against Google and Apple's centralised AI brain systems. That inflection point is estimated at the 10,000 active user mark, which maps to Phase 2 (2026 Q1).

The phased transition is as follows:

| Phase | Timeline | Data Architecture | Web5 Status |
|---|---|---|---|
| **Phase 0** | Now (2025) | Centralised Supabase — `neuroagi` schema | None — standard Web2 |
| **Phase 1** | 2025 Q4 | Supabase + Brain Identity (DBI) standard defined | DID standard designed, not yet deployed |
| **Phase 2** | 2026 Q1 | User-controlled DWN (PBDS) live; permission grants | **Web5 begins here** |
| **Phase 3** | 2026 Q2 | VBC standard launched; employer integrations | ZK proofs + W3C VCs |
| **Phase 4** | 2026 Q3 | NeuroAGI hardware ships; local on-device model | Full brain sovereignty |
| **Phase 5** | 2027 | DBI standard open-sourced; third-party apps | Protocol becomes ecosystem |
| **Phase 6** | 2028+ | Brain Credential Protocol = industry standard | Cognitive identity layer |

**What this means for the current build:** Every database write today should be designed so it can be migrated to a user-controlled DWN in Phase 2 without breaking the product. The `neuro.persons` table should store a `did` column from Day 1 (even if it is a placeholder). The `brain.data_references` pattern (store a reference, not raw data) should be established early.

---

## Part 2 — Web5 Architecture Overview

Web5 in the FschoolAI/NeuroAGI ecosystem is built on three cryptographic primitives:

| Primitive | Technical Implementation | Role in FschoolAI |
|---|---|---|
| **Decentralised Identity (DID)** | W3C DID spec anchored on ION (Bitcoin L2) | User's global identity — created at signup, portable across all apps |
| **Personal Brain Data Store (PBDS)** | Decentralised Web Node (DWN) — user-controlled, encrypted | All cognitive data lives here; FschoolAI holds only encrypted references |
| **Verifiable Brain Credential (VBC)** | W3C Verifiable Credentials + Groth16 ZK Proof | Proves cognitive ability to employers/universities without exposing raw data |

**The core privacy guarantee:** FschoolAI's servers never hold raw cognitive data. They hold encrypted content hashes and DWN endpoint references. A breach of FschoolAI's database reveals nothing about what any student actually knows or how they think.

---

## Part 3 — What Is Missing From the Current Web5 Docs (Gap Analysis)

The existing `WEB5_BRAIN_OS.md` and `TOKEN_ECONOMY_WEB3.md` documents establish the strategic vision clearly. However, several critical engineering and product gaps remain unaddressed. These are documented here so they can be resolved before Phase 2 begins.

### Gap 1: DID Provisioning During Phase 0 Signup

**What exists:** The current signup flow creates a user in Supabase with an email and password. There is no DID generation.

**What is missing:** A design decision on whether to generate a placeholder DID at Phase 0 signup (so the `did` column is populated from Day 1) or to retroactively assign DIDs when Phase 2 launches. Retroactive assignment is technically possible but creates a migration risk — any user who signed up in Phase 0 and never returns to Phase 2 will have brain data that cannot be migrated to their DWN.

**Recommendation:** Generate a custodial DID at Phase 0 signup. The private key is held by NeuroAGI (custodial, like a bank holding your gold). In Phase 2, the user is prompted to claim their DID and take custody of the private key. This is the same pattern used by Coinbase Wallet's transition from custodial to self-custody.

### Gap 2: The Brain Data Migration Script

**What exists:** A conceptual description of the graduation brain migration event.

**What is missing:** A concrete data migration specification. Specifically: which tables in the current `neuroagi` Supabase schema map to which DWN record schemas? The current schema includes `brain.signals`, `brain.reflections`, `brain.context_window`, `neuroagi.files`, `neuroagi.concepts`, and `neuroagi.concept_links`. Each of these needs a corresponding DWN record schema defined before Phase 2, or the migration will require a bespoke ETL job for every table.

**Recommendation:** Define a `neuroagi/brain/v1` DWN schema that mirrors the current Supabase tables. Write a migration script that reads from Supabase and writes to DWN. Test it on a staging brain before Phase 2 launch.

### Gap 3: ZK Proof Circuit Design

**What exists:** A reference to Groth16 ZK-SNARKs as the proof system for Verifiable Brain Credentials.

**What is missing:** The actual circuit design. A Groth16 circuit must be written in a domain-specific language (Circom or Noir) and compiled to a proving key and verification key before any VBC can be generated. The circuit must encode the specific claims FschoolAI wants to prove — for example, "mastery score for concept X is above threshold Y" or "GPA trajectory is positive over N years." This is non-trivial engineering work that requires a cryptography engineer and typically takes 4–8 weeks.

**Recommendation:** Scope the Phase 3 VBC launch to a small number of simple claims (3–5 maximum) with pre-defined circuits. Do not attempt to build a general-purpose ZK proof system in Phase 3. Expand the claim set in Phase 5 once the circuit infrastructure is proven.

### Gap 4: FST Token On-Chain Settlement Layer

**What exists:** A description of FST as a soulbound, earn-only token with exchange mechanics for partner rewards.

**What is missing:** The actual blockchain infrastructure. Three unresolved questions remain. First, which chain does FST live on — Ethereum L2 (Base, Optimism), a dedicated NeuroAGI L2, or a Solana program? Second, how are tokens minted — does NeuroAGI mint tokens on a schedule, or does each verified action trigger an on-chain mint? Third, how does the partner settlement layer work technically — does Notion receive FST and redeem it with NeuroAGI, or does NeuroAGI pay Notion in fiat and burn the FST?

**Recommendation:** For Phase 2, implement FST as an off-chain points system (stored in Supabase) with a commitment to migrate to on-chain in Phase 3. This avoids blockchain infrastructure costs and regulatory complexity during the growth phase. The token economy mechanics (earn rates, exchange rates, leaderboard) can be fully functional off-chain. The on-chain migration in Phase 3 becomes a marketing event ("your points are now real tokens").

### Gap 5: The Content Connector and Outside-World Signals

**What exists:** The ALIVE_PRODUCT_SPEC describes a Content Connector agent that links outside content (YouTube, Instagram, articles) to coursework.

**What is missing:** A Web5-compatible design for how outside-world signals are captured and stored. If a student watches a YouTube video about thermodynamics, how does that signal enter the PBDS? The current architecture assumes all signals come from Canvas (via the Chrome extension) or from Reggie chat. There is no design for a browser-level signal capture layer that writes to the PBDS without going through FschoolAI's servers.

**Recommendation:** Design a lightweight browser extension module (separate from the Canvas extension) that captures URL visits and time-on-page signals, encrypts them locally, and writes them directly to the user's DWN. This is a Phase 4 feature but the DWN schema for `browser_signals` should be defined in Phase 2.

### Gap 6: The NeuroAGI Hardware Signal Pipeline

**What exists:** A vision of NeuroAGI hardware as an always-on device that captures biometric and ambient signals.

**What is missing:** A specification for how hardware signals (audio transcriptions, biometric readings, ambient context) are processed and stored in the PBDS. The critical design question is whether raw signals are processed on-device (local model) before writing to the DWN, or whether raw signals are encrypted and written to the DWN for later processing. Processing on-device is more privacy-preserving but requires a capable local model. Writing raw signals to the DWN is simpler but creates a large, sensitive data store.

**Recommendation:** On-device processing is the correct architecture. Raw signals should never leave the device. The local model produces structured signals (e.g., `{ type: "focus_session", duration: 47, topic_detected: "thermodynamics" }`) and only the structured output is written to the DWN. This is consistent with Apple's on-device processing model for Siri and Health data.

### Gap 7: Regulatory and Compliance Framework

**What exists:** A general statement that the PBDS model reduces FschoolAI's regulatory exposure because it does not hold raw user data.

**What is missing:** A formal analysis of how the Web5 architecture interacts with FERPA (US student data privacy law), PIPEDA (Canadian privacy law, relevant for UofT), and GDPR (if European students are onboarded). Specifically: does storing a DID reference and a DWN endpoint in FschoolAI's Supabase database constitute "holding student data" under FERPA? The answer is likely no, but this needs a legal opinion before Phase 2 launch.

**Recommendation:** Engage a privacy lawyer with EdTech experience before Phase 2. The Web5 architecture is likely more compliant than a centralised model, but the compliance argument needs to be formally documented for university partnership discussions.

### Gap 8: Key Recovery and Lost Device Scenarios

**What exists:** A mention that the private key is stored in the browser's IndexedDB, encrypted with the user's password.

**What is missing:** A complete key recovery design. If a student loses their device or forgets their password, how do they recover access to their PBDS? The current Web5 architecture has no answer to this. Without a recovery mechanism, a lost device means permanent loss of the brain — which is the opposite of the "data lives forever" promise.

**Recommendation:** Implement a social recovery scheme (similar to Argent Wallet) where the user designates 3 trusted contacts. Any 2 of 3 contacts can approve a key rotation. Alternatively, implement a custodial recovery option where NeuroAGI holds an encrypted backup of the key, recoverable via identity verification. The custodial option is simpler but reduces sovereignty; the social recovery option is more aligned with Web5 principles.

---

## Part 4 — Web5 User Scenarios (Full Trajectories)

The following scenarios describe the end-state Web5 experience. These are not current-state — they describe what the product looks like in Phase 2–4.

---

### Scenario 1: DID Registration and PBDS Initialization (Phase 2)

**Trigger:** New user completes email verification. System automatically creates their Web5 identity.

**What happens:**

The system generates an Ed25519 keypair locally on the user's device. The public key is anchored to the ION network (Bitcoin Layer 2), creating a globally unique DID in the format `did:ion:EiA7...xyz`. A Decentralised Web Node instance is provisioned as the user's Personal Brain Data Store, encrypted with a key derived from their DID keypair. FschoolAI's database receives only the DID reference and DWN endpoint — no cognitive data is stored centrally.

The user sees a Brain Card: *"Your Brain has been created. You own this brain. FschoolAI can never access it without your permission."* The private key is stored in the browser's IndexedDB, encrypted with the user's password. A 12-word recovery phrase is shown once.

| Step | Operation | Type | Latency |
|---|---|---|---|
| 1 | Ed25519 keypair generation | Local crypto | ~2ms |
| 2 | ION DID anchor (Bitcoin L2) | External network | ~800ms |
| 3 | DWN instance provisioning | External service | ~150ms |
| 4 | DB write (DID reference only) | DB write | ~8ms |

**Claude calls: 0. Total latency: ~960ms. Cost: $0.003 (one-time per user).**

---

### Scenario 2: Cognitive Data Written to PBDS After Every Session (Phase 2)

**Trigger:** Alex completes a Reggie tutoring session. The session insight is written to his PBDS, not to FschoolAI's database.

**What happens:**

After the session ends, the brain data writer fetches Alex's public key from the `neuro.persons` table (DID lookup). The session insight is encrypted with Alex's public key using ECIES. The encrypted payload is written to Alex's DWN as a private record with schema `neuroagi/brain/tutor_impression/v1`. FschoolAI's database receives only a content hash reference — not the insight text. The `brain.context_window` table is updated with a minimal summary (e.g., "PSYC201 essay outline session") sufficient for Reggie to function, but not the full insight.

**Claude calls: 0. Total latency: ~138ms (async, user does not wait). Cost: $0.0001 per write.**

The user can see all their records on the Brain page: *"247 records. Last updated 2 minutes ago. [View] [Export] [Revoke Access]."* Every record is marked as encrypted. The user can delete any record or their entire brain at any time.

---

### Scenario 3: Verifiable Brain Credential for a Job Application (Phase 3)

**Trigger:** Alex applies for a Google internship and requests a cognitive profile credential. He wants to prove statistical reasoning ability without sharing his actual grades.

**What happens:**

Alex initiates a VBC request from his NeuroAGI Brain Wallet. The system reads his PBDS records with his signed authorisation — the data is decrypted client-side and never sent to the server. Claims are computed locally: statistical reasoning at the 87th percentile (threshold: 80th), academic consistency score of 0.81 (threshold: 0.75), GPA trajectory positive over 4 years. A Groth16 ZK-SNARK proof is generated — the proof mathematically demonstrates that all claims are true without revealing the underlying scores. A W3C Verifiable Credential is issued and sent to Google's HR verifier DID. One Claude call generates a professional 3-sentence summary for the HR team to read.

Google's HR system sees: *"Statistical reasoning 80–90th percentile ✓. Academic consistency 0.75–0.85 ✓. GPA trajectory positive ✓."* They cannot see Alex's actual GPA, his raw mastery scores, or any of his conversation history.

| Step | Operation | Type | Latency |
|---|---|---|---|
| 1 | PBDS records read (signed auth) | DWN read | ~200ms |
| 2 | Claims computation (local) | Local calculation | ~50ms |
| 3 | Groth16 ZK proof generation | Crypto computation | ~800ms |
| 4 | Claude API — summary text | **Claude call × 1** | ~500ms |
| 5 | W3C VC issuance + send | Crypto signature | ~100ms |

**Claude calls: 1. Total latency: ~1,650ms. Cost: $0.007 per credential.**

---

### Scenario 4: Third-Party Access Grant and Cryptographic Revocation (Phase 2)

**Trigger:** Notion (a partner) requests access to Alex's learning patterns to personalise Notion AI. Alex grants access, uses it for 3 months, then revokes it.

**Grant flow:** Notion sends a structured access request specifying exactly which PBDS schemas it needs (`brain.learning_patterns`, `brain.knowledge.subjects`, `brain.study_schedule`). Alex reviews the request on his Brain page — he can see precisely what Notion is asking for and what it is not asking for. He taps "Allow for 90 days." His private key signs an Access Grant, which is written to his PBDS and sent to Notion's DID endpoint. Notion can now read the specified schemas from Alex's DWN.

**Revocation flow:** Three months later, Alex revokes Notion's access. His private key signs a Revocation Record that overwrites the original grant in his PBDS. The revocation is broadcast to Notion's DID endpoint. From this point, the DWN cryptographically rejects all requests from Notion — not as a policy decision, but as a mathematical impossibility. Even if FschoolAI wanted to give Notion access, it cannot.

**Claude calls: 0. Cost: ~$0.001 per grant/revocation event.**

---

### Scenario 5: Graduation Brain Migration (Phase 2–3)

**Trigger:** Canvas webhook fires when Alex completes his final course. The system detects graduation eligibility and initiates the brain migration event.

**What happens:**

The BrainMigrationService verifies that all courses are complete and the account is in good standing. Alex's brain stats are compiled: 847 records, 23 concepts at mastery ≥ 0.7, 312 study sessions over 4 years. One Claude call generates a personal graduation brain summary — not a generic congratulations message, but a specific reflection on Alex's 4-year cognitive arc. A NeuroAGI Brain Wallet is created at `wallet.neuroagi.com`. All 847 PBDS records are migrated from the FschoolAI DWN endpoint to the NeuroAGI DWN endpoint using the DWN sync protocol. The encryption keys are unchanged — the same DID keypair that protected Alex's data in FschoolAI continues to protect it in NeuroAGI. The FschoolAI DWN becomes a read-only archive. A non-expiring Graduation VBC is issued.

Alex receives: *"🎓 Congratulations. Your Brain has been migrated to your NeuroAGI Brain Wallet. 847 records transferred. Encryption unchanged. This is not the end of the story — it is the foundation."*

From this point, Alex's brain continues growing in professional context. Work projects replace assignments. Professional skills replace course concepts. Career patterns replace study patterns. By age 30, Alex has a 4-year academic + N-year professional cognitive record that no centralised competitor can replicate — because they deleted his data the day he graduated.

| Step | Operation | Type | Latency |
|---|---|---|---|
| 1 | Graduation eligibility check | DB read | ~15ms |
| 2 | Claude API — graduation summary | **Claude call × 1** | ~600ms |
| 3 | NeuroAGI Wallet creation | External API | ~200ms |
| 4 | PBDS migration (847 records) | DWN sync protocol | ~2,000ms |
| 5 | Graduation VBC issuance | Crypto signature | ~100ms |
| 6 | DB status update | DB write | ~8ms |

**Claude calls: 1. Total latency: ~2,923ms. Cost: $0.013 (one-time per graduating user).**

---

### Scenario 6: FST Token On-Chain Redemption (Phase 3)

**Trigger:** Alex has accumulated 2,500 FST tokens and redeems 800 FST for a Notion Plus subscription.

**What happens:**

Alex initiates the redemption from his Token Wallet. The FST engine queries his on-chain balance (2,500 FST available). The reward availability is confirmed (Notion Plus 1-month = 800 FST). Alex's private key signs a transaction transferring 800 FST from his DID to the FschoolAI Treasury DID. The transaction is broadcast to the NeuroAGI token chain and confirmed. FschoolAI sends a settlement request to Notion's partner API, referencing the on-chain transaction hash. Notion verifies the hash (publicly auditable on-chain) and activates Alex's Plus subscription. The transaction record is written to Alex's PBDS.

The entire settlement is transparent and auditable. Alex can verify on-chain that his tokens were spent correctly. Notion can verify on-chain that the payment is legitimate. Neither party needs to trust FschoolAI's internal accounting.

**Claude calls: 0. Cost: ~$0.001 per redemption (chain gas only).**

---

## Part 5 — Web5 vs. Web2 Comparison

| Dimension | Web2 EdTech (Chegg, Quizlet) | Web4 AI (ChatGPT, Khanmigo) | NeuroAGI Web5 |
|---|---|---|---|
| Data ownership | Platform | Platform | User |
| Identity portability | None | None | Full (DID) |
| Credential verifiability | Static diploma | None | VBC + ZK Proof |
| Brain portability | None | None | Full (PBDS migration) |
| Privacy model | Centralised, opaque | Centralised, opaque | Local compute + ZK proofs |
| Value after graduation | Zero (data deleted) | Zero (data deleted) | Compounds forever |
| Token economy | None | None | FST (soulbound, earn-only) |
| Partner ecosystem | Closed | Closed | Open protocol (DBI standard) |
| Breach impact | All user data exposed | All user data exposed | Encrypted references only — nothing readable |

---

## Part 6 — Architecture Decisions Required Before Phase 2

The following decisions must be made before Phase 2 development begins. They are listed in order of urgency.

**Decision 1 — Custodial vs. Self-Custody DID at Phase 0 Signup**
Recommendation: Custodial DID at Phase 0, self-custody claim in Phase 2. This avoids blocking signup on cryptographic complexity while preserving the migration path.

**Decision 2 — Which Blockchain for FST**
Recommendation: Off-chain (Supabase) for Phase 0–2, migrate to Base (Ethereum L2) in Phase 3. Base has the lowest gas costs, the largest developer ecosystem, and is already used by Coinbase — a likely future partner.

**Decision 3 — DWN Provider**
Recommendation: Use TBD's reference DWN implementation for Phase 2, with a plan to run NeuroAGI's own DWN nodes in Phase 4 when hardware ships. Running your own DWN nodes is required for the hardware signal pipeline.

**Decision 4 — ZK Proof Circuit Scope for Phase 3**
Recommendation: Launch with 3 circuits only — `percentile_claim`, `trajectory_claim`, and `consistency_claim`. These cover 90% of the job application use case. Expand in Phase 5.

**Decision 5 — Key Recovery Mechanism**
Recommendation: Social recovery (3-of-3 trusted contacts, any 2 can approve rotation) as the primary mechanism. Custodial recovery (NeuroAGI holds encrypted backup) as a fallback for users who cannot set up social recovery. Both options must be designed before Phase 2 launch — a lost key with no recovery path is a catastrophic user experience failure.

---

## Part 7 — Summary Cost Model for Web5 Operations

| Operation | Claude Calls | Latency | Cost Per Event | Phase |
|---|---|---|---|---|
| DID registration + PBDS init | 0 | ~960ms | $0.003 (one-time) | Phase 2 |
| Cognitive data write to PBDS | 0 | ~138ms (async) | $0.0001 | Phase 2 |
| VBC generation (job application) | 1 | ~1,650ms | $0.007 | Phase 3 |
| Third-party access grant | 0 | ~50ms | $0.001 | Phase 2 |
| Third-party access revocation | 0 | ~50ms | $0.001 | Phase 2 |
| Graduation brain migration | 1 | ~2,923ms | $0.013 (one-time) | Phase 2–3 |
| FST token redemption (on-chain) | 0 | ~800ms | $0.001 | Phase 3 |

**Key observation:** The majority of Web5 operations require zero Claude API calls. They are cryptographic operations — keypair generation, ZK proof computation, digital signatures. The marginal cost of data sovereignty is effectively zero at scale. The only Web5 operations that require Claude are the ones that generate human-readable text (graduation summary, credential summary) — and these are one-time events per user lifecycle, not per-session costs.

---

*Document version: 2025-06-09 v2.0 (English rewrite) | Author: Vincent Yang / NeuroAGI*
*Confidential — for engineering team and strategic partner discussions*
