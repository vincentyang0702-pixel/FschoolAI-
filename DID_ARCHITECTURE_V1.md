# NeuroAGI — DID Architecture for v1
## What Needs to Change in the Database and Architecture

*Document version: 2026-06-10 v1.0 | Author: Vincent Yang / NeuroAGI*
*Internal technical reference — for engineering team*

---

## The Short Answer

**The current architecture is mostly correct and does not need to be rebuilt.** The stateful brain / stateless agents split, the FschoolAI domain data separation, the Apple ID analogy — all of these are right. The existing Supabase schema just needs three additive changes to support DID-first identity.

Nothing is deleted. Nothing is restructured. Three things are added.

---

## What the Current Architecture Gets Right

Based on the existing docs (ARCHITECTURE_V2_STATEFUL_STATELESS.md), the following design decisions are confirmed correct and do not need to change:

| Decision | Why it's right |
|---|---|
| Stateful brain in NeuroAGI, stateless agents in FschoolAI | Agents read from the brain, act, return results — they don't hold state. Correct. |
| Raw domain data stays in FschoolAI, learned abstractions go into NeuroAGI brain | Solves the data bloat problem. Signals and patterns enter the brain, not documents. Correct. |
| Separate databases for NeuroAGI and FschoolAI | Apple ID analogy — user registers on FschoolAI, NeuroAGI holds the brain profile. Correct. |
| DID as identity layer on top of Supabase auth | DID is the primary key for brain data, not the email. This is the right v1 approach. |

---

## The Three Changes Needed

### Change 1 — Add `did` column to the `users` table

**What:** Add a `did TEXT UNIQUE NOT NULL` column to the users table in the NeuroAGI Supabase database.

**Why:** Currently the brain data is keyed to `user_id` (Supabase UUID). The DID needs to be stored alongside this so that:
- The brain can be exported and signed with the user's DID
- Third-party apps can query the brain using the DID without knowing the internal Supabase UUID
- The migration to decentralized storage in v3 has a clean key to migrate to

**SQL:**
```sql
ALTER TABLE users ADD COLUMN did TEXT UNIQUE;

-- Generate DID at signup (done in application code, not SQL)
-- Format: did:key:z6Mk... (Ed25519 key, generated client-side or server-side)
-- Store the full DID string in this column
```

**When to populate:** At signup. Every new user gets a `did:key` generated automatically. Existing users get a DID assigned in a migration script.

**Cost:** Zero. A `did:key` is a cryptographic key pair generated locally — no blockchain, no gas fees, no third-party service required.

---

### Change 2 — Add `brain_credentials` table

**What:** A new table that stores Verifiable Credentials (VCs) issued to the user for learning milestones.

**Why:** This is the foundation of the Verifiable Brain Credential (VBC) system. Every time a student hits a meaningful milestone (first 10 study sessions, mastery of a concept, grade improvement), a signed VC is issued and stored here.

**SQL:**
```sql
CREATE TABLE brain_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_did TEXT NOT NULL REFERENCES users(did),
  credential_type TEXT NOT NULL,
  -- e.g. 'StudyMilestone', 'ConceptMastery', 'GradeImprovement'
  credential_json JSONB NOT NULL,
  -- Full W3C Verifiable Credential in JSON-LD format
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  -- null = never expires
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_brain_credentials_user_did ON brain_credentials(user_did);
CREATE INDEX idx_brain_credentials_type ON brain_credentials(credential_type);
```

**What a credential looks like (JSON-LD format):**
```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "StudyMilestone"],
  "issuer": "did:key:z6MkNeuroAGI...",
  "issuanceDate": "2026-06-10T00:00:00Z",
  "credentialSubject": {
    "id": "did:key:z6MkStudent...",
    "milestone": "10 study sessions completed",
    "studyHours": 24.5,
    "coursesActive": 4
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-06-10T00:00:00Z",
    "verificationMethod": "did:key:z6MkNeuroAGI...#key-1",
    "proofValue": "z..."
  }
}
```

---

### Change 3 — Add `brain_export_log` table

**What:** A table that tracks every time a user exports their brain data.

**Why:** For transparency and audit. Users should be able to see exactly what they exported and when. This also enables the "revoke access" feature — if a user exports their brain and then revokes NeuroAGI's access, the log shows what was shared.

**SQL:**
```sql
CREATE TABLE brain_export_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_did TEXT NOT NULL REFERENCES users(did),
  export_type TEXT NOT NULL,
  -- 'full_brain', 'knowledge_graph', 'credentials_only', 'signals_summary'
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  export_hash TEXT,
  -- SHA-256 hash of the exported package, for integrity verification
  recipient_did TEXT,
  -- null = user exported for themselves; set if shared with a third party
  permission_scope TEXT[]
  -- array of data types included in this export
);
```

---

## Architecture Changes (Application Code)

Beyond the database, three additions are needed in the application code:

### Addition 1 — DID generation at signup

When a user creates an account, generate a `did:key` and store it in the `users.did` column.

**Implementation:** Use the `@decentralized-identity/did-resolver` or `@noble/ed25519` npm package to generate an Ed25519 key pair. The public key becomes the DID. The private key is stored in the user's browser (localStorage or secure storage) — **never on the server**.

```typescript
// Pseudocode — runs at signup
import { generateKeyPair } from '@noble/ed25519';
import { bytesToBase58 } from '@noble/hashes/utils';

const keyPair = await generateKeyPair();
const publicKeyBase58 = bytesToBase58(keyPair.publicKey);
const did = `did:key:z${publicKeyBase58}`;

// Store DID in Supabase
await supabase.from('users').update({ did }).eq('id', userId);

// Store private key in user's browser (never server)
localStorage.setItem('neuroagi_brain_key', bytesToHex(keyPair.privateKey));
```

**Important:** The private key never leaves the user's device. NeuroAGI only stores the DID (public identifier). This is what makes the brain "belong to the user" — only they can sign exports and credentials.

---

### Addition 2 — VC issuance service

A lightweight service that signs learning milestones as W3C Verifiable Credentials.

**Trigger events for VC issuance:**
- 10 study sessions completed → `StudyMilestone` VC
- First concept marked as mastered → `ConceptMastery` VC
- Grade improvement in a course → `GradeImprovement` VC
- Semester completed → `SemesterCompletion` VC
- Graduation → `AcademicRecord` VC (the big one)

**Implementation:** A Supabase Edge Function or a simple serverless function that:
1. Receives a trigger event from the brain OS
2. Constructs the VC JSON-LD
3. Signs it with NeuroAGI's issuer DID (server-side key)
4. Stores it in `brain_credentials`
5. Optionally notifies the user

---

### Addition 3 — Brain export endpoint

An API route that packages the user's knowledge graph as a signed, portable JSON-LD document.

**What it returns:**
```json
{
  "@context": "https://neuroagi.com/brain-export/v1",
  "did": "did:key:z6MkStudent...",
  "exportedAt": "2026-06-10T00:00:00Z",
  "knowledgeGraph": { ... },
  "credentials": [ ... ],
  "signalsSummary": { ... },
  "signature": "z..."
}
```

**The signature** is generated using the user's private key (which lives in their browser). The export endpoint returns unsigned data; the browser signs it before the user downloads it. This means NeuroAGI cannot forge an export on the user's behalf.

---

## What Does NOT Need to Change

| Component | Status | Reason |
|---|---|---|
| Stateful brain tables (knowledge graph, signals, patterns) | No change | Just add `user_did` as an indexed column alongside `user_id` |
| Stateless agent architecture | No change | Agents read from brain by `user_id`; DID is an additional lookup |
| FschoolAI domain data (syllabi, grades, professor data) | No change | This data stays in FschoolAI, never enters the brain |
| Nightly reflection engine | No change | Continues to write learned abstractions to the brain |
| FST token economy | No change | Token already planned for Solana; DID is the wallet address |
| Reggie agent interface | No change | Students still interact with Reggie; DID is invisible infrastructure |

---

## Migration Plan for Existing Users

When the DID system launches, existing users (those who signed up before DID was implemented) need a DID assigned:

1. Run a migration script that generates a server-side `did:key` for each existing user and stores it in `users.did`
2. These DIDs are "custodial" — NeuroAGI holds the key pair until the user claims ownership
3. When the user next logs in, prompt them to "claim their brain" — generate a new key pair in their browser, re-sign the brain data with their own key, and update the DID
4. Custodial DIDs are clearly marked in the UI as "not yet claimed"

This is the same pattern that crypto wallets use for custodial → self-custody migration.

---

## Summary: Do We Need to Modify the Database?

**Yes, but minimally.** Three additive changes:

| Change | Type | Effort | Priority |
|---|---|---|---|
| Add `did` column to `users` table | SQL migration | 30 minutes | Required for v1 |
| Add `brain_credentials` table | SQL migration | 1 hour | Required for v1 |
| Add `brain_export_log` table | SQL migration | 30 minutes | Recommended for v1 |
| DID generation at signup | Application code | 2–4 hours | Required for v1 |
| VC issuance service | Application code | 1–2 days | Required for v1 |
| Brain export endpoint | Application code | 1–2 days | Required for v1 |

**Total estimated effort: 3–5 days of engineering work.**

The existing architecture is sound. The DID layer is an addition, not a replacement. Everything built so far continues to work.

---

*Document version: 2026-06-10 v1.0 | Author: Vincent Yang / NeuroAGI*
*Internal technical reference — for engineering team*
