# AI Studio

**Status: not built. This folder is a placeholder + design brief.**

AI Studio is the planned visual constructor for **workflow automation** across
AIBA — the surface where a user wires up "when this happens over there, look at
it, decide, and do something here" without writing code.

It is the third and most general layer of automation in the product. The first
two already ship, and Studio should be designed as their superset rather than a
replacement:

| Layer | Trigger | Decides by | Where it lives |
|---|---|---|---|
| **Board automations** | a board write (created / moved / assigned / priority / commented) | fixed `conditions` | `backend/crates/tasks-core/src/automation.rs`, UI `modules/tasks/local/automation-section.tsx` |
| **Autotasks (regular)** | the clock (daily / weekly / monthly / yearly) | nothing — it always fires | `backend/crates/tasks-core/src/autotasks.rs`, UI `modules/tasks/local/autotasks-section.tsx` |
| **AI Studio** *(this)* | any source event, or a schedule | **an LLM reading the actual context** | — |

The distinction that matters: the first two are deterministic rule engines. A
condition either matches or it doesn't. Studio exists for the cases where the
decision *cannot* be expressed as a rule — "is this incoming invoice actually a
problem?", "does this email need a task, and for whom?" — because answering it
requires reading the content.

## The shape of a Studio workflow

```
  SOURCE            →   ANALYSIS            →   ACTIONS
  what to watch         read the context        do it, or don't
  ────────────          ────────────────        ─────────────────
  documents (EDI)       an LLM prompt with      create a task
  mail                  the source payload      post to a chat
  bank                  + retrieved context     send a Telegram message
  tasks board           → a structured verdict  write to wiki
  soliq / warehouse                             call an MCP tool
  a schedule                                    …or decide to do nothing
```

The middle step is what makes it "AI" and it is also the risky part: the model
must return a **structured** decision (not prose), and the runtime must be able
to refuse to act when confidence is low. Design the verdict as a typed object
from day one.

## Where it plugs into what already exists

- **Autotasks already reserve the slot.** `km.task_autotasks.kind` is
  `'regular' | 'ai'`, and the engine deliberately fires only `kind = 'regular'`
  (see the `due()` query in `tasks-core/src/autotasks.rs`). The `ai` tab in
  `modules/tasks/local/autotasks-section.tsx` currently renders a "Soon" screen
  describing exactly the three steps above. Decide early whether AI workflows
  keep living in that table or graduate to their own — the current column is a
  placeholder, not a commitment.
- **Actions should reuse the MCP tools, not reimplement them.** The MCP server
  (`backend/crates/mcp/`) already exposes tasks, wiki, files, documents, soliq,
  HR, companies and calendar as callable tools with validated arguments. A
  Studio "action" is most naturally an MCP tool call — that gives every action
  argument validation and an audit trail for free, and anything added for the
  assistant becomes available to Studio automatically.
- **Card writes must go through `automation::write_card_and_run`**, not
  `ops::upsert_card`, so board rules still fire on Studio-created cards. This is
  the same rule autotasks follow.
- **Every generated artefact needs provenance.** Autotasks tag their cards with
  the `autotask` label and `source: "autotask"`; the card source union in
  `modules/tasks/types.ts` already has an `"ai"` member for this. Do the
  equivalent for whatever Studio creates — an AI-made thing must be
  distinguishable from a human-made one, always.
- **The ticker exists.** `backend/crates/api/src/modules/autotask_ticker.rs`
  sweeps every active tenant once a minute and is the natural place to also poll
  scheduled Studio workflows. Its idempotency pattern (claim a `(workflow, slot)`
  row before acting) is the one to copy — an LLM call is expensive and
  side-effecting, so firing one twice is worse here than it is for a plain card.

## Access

Follow the autotasks precedent: a dedicated `TaskPermission`-style flag rather
than folding it into `manage`, so "may configure AI workflows" is grantable on
its own. Autotasks added `"autotask"` to the permission union in
`modules/tasks/local/model.ts` + `local/perms.ts` and mirrored it in
`tasks-core/src/ops.rs::system_task_role`; a Studio permission should be added
the same way in all three places.

## Open questions to settle before building

1. **Model + cost.** Every run is an LLM call against live business data. Which
   model, what token budget per workflow, and who sees the bill? A per-tenant
   quota probably has to exist before this ships.
2. **Blast radius.** A misfiring rule engine creates a wrong card. A misfiring
   AI workflow can create a hundred, or message a customer. Decide the guard
   rails: dry-run mode, a required human approval step for outward-facing
   actions, per-workflow rate limits.
3. **Data boundaries.** The analysis step sends tenant data to a model provider.
   That needs an explicit, per-tenant opt-in and a written answer to "what
   leaves the building".
4. **Debuggability.** Users will ask "why did it do that?". Persist the input
   context, the prompt, and the structured verdict for every run — the autotask
   run ledger (`km.task_autotask_runs`) is the minimum shape; Studio needs more.

## Getting started in a fresh session

Read, in this order:

1. `backend/crates/tasks-core/src/autotasks.rs` — the newest engine, and the
   closest thing to a template (schedule → idempotent claim → create → broadcast).
2. `backend/crates/tasks-core/src/automation.rs` — the rule model
   (trigger / conditions / actions) that Studio generalises.
3. `frontend/src/modules/tasks/local/autotasks-section.tsx` — the AI tab copy
   already written for users; it is the product promise this folder has to keep.
