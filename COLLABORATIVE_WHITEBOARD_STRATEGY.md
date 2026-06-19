# Collaborative Whiteboard: Comprehensive Strategy Guide

> A guide on what to do for the FschoolAI collaborative whiteboard — the real root
> cause of the sync problems, the architectural fix, vendor/service options with
> current (2026) pricing, and a recommended migration path.

---

## 1. The real root cause (corrected)

Earlier analysis claimed Supabase has a "hard 30 events/second ceiling." That was **wrong**, and it matters. The actual Supabase Realtime limits are **tenant-configurable, not fixed**, and default to:

| Limit | Default |
|---|---|
| Events/second | **100** |
| Joins/second | 100 |
| Concurrent users | 200 |
| Channels per client | 100 |
| Payload size | 100 KB |
| Bytes/second | 100,000 |

The `10` we hit was the **client library's** default `eventsPerSecond` throttle, and the server default is `100` — both raisable. So the problem was **never really Supabase's ceiling**. The problem is our **architecture**:

> We were sending one message per pointer-move batch (raw points), with no batching, no delta encoding, no conflict model. That floods *any* pub/sub system — Supabase, Pusher, Firebase, all of them. Throwing a different vendor at a bad sync design just moves the wall.

**The thing that actually fixes this is a CRDT** (Conflict-free Replicated Data Type). A CRDT like Yjs:

- Encodes changes as tiny binary deltas (bytes, not JSON point arrays)
- Batches many edits into one update
- Merges concurrent edits from multiple users **without conflicts or lost strokes** — automatically
- Works offline and reconciles on reconnect

This is why every serious collaborative tool (Figma, Notion, Linear, tldraw) uses a CRDT or OT engine, not raw pub/sub.

**So the real question isn't "which DB" — it's "which sync engine," and then "what transport/host runs it."**

---

## 2. Two strategic paths

**Path A — Keep Supabase, fix the architecture.** Add Yjs for the sync engine, keep Supabase for auth + persistence (store the Yjs document blob in a Postgres column or Storage). Cheapest, least migration, you already know the stack.

**Path B — Move to a purpose-built collaboration backend.** Liveblocks, tldraw sync, or PartyKit. More money/lock-in, but batteries-included (cursors, presence, persistence, scaling all handled).

---

## 3. Option-by-option breakdown

### Option 1 — Yjs + Supabase (recommended starting point)

- **What:** Yjs CRDT in the browser; sync via a provider; persist the doc to Supabase.
- **Transport choices:** `y-websocket` (simplest), **Hocuspocus** (v4 is now MIT-licensed, purpose-built for whiteboards/editors, has auth + webhooks + persistence, runs on Node/Bun/Deno/Cloudflare), or even Supabase Broadcast as the transport (Yjs deltas are tiny, so you stay well under limits).
- **Cost:** Yjs + Hocuspocus are free/open-source. You pay only for the small server to run the WebSocket backend (~$5–10/mo) or stay on Supabase entirely.
- **Pros:** Keeps your stack, no vendor lock-in, free, solves the actual problem.
- **Cons:** You wire it together yourself; you run one small WebSocket service (unless you tunnel Yjs through Supabase Broadcast).

### Option 2 — Liveblocks

- **What:** Managed collaboration platform. Supports Yjs *or* their own storage. Gives you cursors, presence, comments, and a multiplayer whiteboard example out of the box.
- **Cost (2026):** Free up to **50 MAU**; paid scales by **monthly active users** + features. Reports range ~$25/mo (Pro, annual) up to a $99/mo Starter (100 MAU / 50 concurrent) and $500/mo tiers. MAU-based, so cost grows with your user base.
- **Pros:** Fastest path to a polished result; least code; production-grade.
- **Cons:** Ongoing cost that scales with users; vendor lock-in; you're routing user data through a third party.

### Option 3 — tldraw (SDK + sync)

- **What:** A complete infinite-canvas whiteboard SDK — you'd basically *replace* your custom canvas with theirs. Self-hosted multiplayer on Cloudflare Durable Objects.
- **Cost (2026):** Hosted tldraw.com is free, but the **commercial SDK license is ~$6,000/year** for teams up to 10, custom above. Non-OSI license restricts commercial use — **read it before committing.**
- **Pros:** Best whiteboard UX on the market instantly (shapes, text, zoom, undo all built in); you'd delete most of your `Whiteboard.tsx`.
- **Cons:** Expensive license for commercial use; you adopt their whole canvas (less control over look/feel); license restrictions.

### Option 4 — PartyKit (Cloudflare)

- **What:** Open-source real-time framework, now owned by Cloudflare. Each room = one Durable Object. `y-partyserver` adds Yjs support. "Hibernation" means idle rooms cost nothing.
- **Cost (2026):** Durable Objects free tier is generous (~millions of requests/mo); Workers Paid is $5/mo base + usage. Very cheap at study-room scale.
- **Pros:** Edge-distributed (low latency worldwide), cheap, scales automatically, pairs perfectly with Yjs.
- **Cons:** Adds Cloudflare to your stack; more infra concepts (Durable Objects, Workers) to learn.

---

## 4. Decision matrix

| | Setup effort | Monthly cost @ ~500 users | Lock-in | Solves multi-user reliably | Best for |
|---|---|---|---|---|---|
| **Yjs + Supabase** | Medium | ~$0–10 | None | ✅ | Staying lean, keeping control |
| **Yjs + PartyKit** | Medium | ~$5 | Low | ✅ | Cheap + global low latency |
| **Liveblocks** | Low | ~$99–199 | High | ✅ | Shipping fast, polished |
| **tldraw** | Low (but rewrite) | ~$500 (license) | High | ✅ | Wanting a world-class canvas now |

---

## 5. Recommendation

**Go with Yjs, keeping Supabase for persistence.** Specifically:

1. **Phase 1 (proof):** Yjs + `y-websocket` running locally → confirm two browsers draw together flawlessly with zero dropped strokes. This validates the CRDT approach before any infra commitment.
2. **Phase 2 (host it):** Either run **Hocuspocus** (MIT, purpose-built) on a small server, or deploy **y-partyserver on PartyKit/Cloudflare** for near-zero cost and global latency.
3. **Phase 3 (persist):** Save the Yjs document to Supabase (a `bytea`/blob column on the room, or Supabase Storage) so late-joiners and reloads restore the board. Supabase stays your source of truth for auth, rooms, and storage.

This keeps your costs near zero, avoids lock-in, and — crucially — fixes the actual engineering problem instead of renting around it. If speed-to-demo is prioritized over cost, **Liveblocks** is the fallback (it also speaks Yjs, so Phase 1 work transfers).

---

## 6. Features that become easy once sync is solid

With a CRDT in place, the smaller features become straightforward because the data model handles concurrency for you:

- **Per-user undo/redo** (Yjs has `UndoManager` built in)
- **Shapes, text, sticky notes** (just more CRDT data types)
- **Live cursors with names** (Yjs Awareness protocol — designed exactly for this)
- **Offline drawing** that reconciles on reconnect
- **Infinite canvas / zoom / pan**

---

## 7. Next step

Build the **Phase 1 proof-of-concept on a throwaway branch**: swap the stroke sync to Yjs with `y-websocket`, keep the existing canvas UI, and test two browsers drawing together with no dropped strokes. If it proves out, pick the host (Hocuspocus vs PartyKit) and wire in Supabase persistence.

---

## Sources

- [Supabase Realtime Rate Limiting (DeepWiki)](https://deepwiki.com/supabase/realtime/8.1-rate-limiting-system)
- [Supabase Pricing 2026 (UI Bakery)](https://uibakery.io/blog/supabase-pricing)
- [Liveblocks Pricing](https://liveblocks.io/pricing) · [Liveblocks 2.0 (Yjs support)](https://liveblocks.io/blog/introducing-liveblocks-2-0)
- [tldraw.dev](https://tldraw.dev/) · [tldraw Reviews/Pricing 2026 (Toolradar)](https://toolradar.com/tools/tldraw)
- [Cloudflare acquires PartyKit](https://blog.cloudflare.com/cloudflare-acquires-partykit) · [Durable Objects Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Hocuspocus (Yjs backend)](https://github.com/ueberdosis/hocuspocus) · [y-websocket docs](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket)

---

## TL;DR — Quick Reference

| | |
|---|---|
| **Real problem** | Not Supabase's limits — our raw per-move pub/sub design floods any backend |
| **The fix** | Use a CRDT (Yjs) — tiny binary deltas, auto-merge, no dropped strokes |
| **Recommended** | Yjs + Supabase (persistence) → host via Hocuspocus or PartyKit |
| **Cheapest** | Yjs + PartyKit/Cloudflare (~$5/mo) or Yjs + Supabase (~$0–10/mo) |
| **Fastest to ship** | Liveblocks (~$99–199/mo, scales by users) |
| **Best canvas UX** | tldraw SDK (~$6k/yr license, restricts commercial use) |
| **Next step** | Phase 1 PoC: Yjs + y-websocket on a throwaway branch, test 2 browsers |
