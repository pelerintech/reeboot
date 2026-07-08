# Roadmap

Tracked reeboot-layer work that is in scope and needs its own planning session, but does not belong inside the `ree-sdk` request itself. These items were surfaced during `ree-sdk` discovery (2026-07-06) and are flagged here so they are not lost.

## ree-mode: messages-table write rule

The orchestrator currently writes user+assistant rows to the `messages` table after every non-synthetic turn (scheduler/recovery turns are excluded). In `ree` mode (multi-user, transactional), customer conversations must NOT be consolidated into the owner's soul — but the `messages` table is also the backing store for `session_search`, which the decisions log says is "always-on, independent of the memory feature flag." 

Decision needed (plan phase): for ree-mode customer turns, is the `messages` write **(a)** skipped entirely, **(b)** routed to a separate per-chat table that is pruned on handoff/idle-eviction, or **(c)** tagged (e.g. `chat_id` + `mode='ree'`) so the consolidation job never mines it but `session_search` can still query it?

This is a reeboot-orchestrator concern, not an `ree-sdk` adapter concern. The `ree-sdk` brief should call it out as a hard dependency (the adapter must not break when the write rule changes), but the design lives here.

## ree-mode: session_search gating review

`session_search` (FTS5 full-text search over the `messages` table) is registered as a core always-on capability. The decisions log gates this as independent of the `memory.enabled` flag. But in `ree` mode, where customer conversations are transactional and must not leak across chats, the question is: should a ree-mode agent be able to `session_search` across *other* customers' past chats? 

Decision needed: is `session_search` in ree mode **(a)** scoped to the current chat only, **(b)** scoped to the current authenticated user/tenant, **(c)** disabled entirely for ree mode, or **(d)** kept as-is with the understanding that ree deployments use per-tenant DB views/RLS?

Coupled to the messages-table write rule above. Also a reeboot-orchestrator concern.

## Note on sequencing

These two items are prerequisites (or co-requisites) for a production `ree` deployment, but they are NOT prerequisites for the `ree-sdk` request itself — the adapter can be built and the abstraction proven without them resolved, as long as the brief flags the dependency. They should be planned in a session after `ree-sdk` (or in parallel, if separate planners are available).
