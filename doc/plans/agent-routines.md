# Agent Routines

## Problem

There is no way to run an agent with a specific prompt on a schedule. The heartbeat system handles periodic "check your inbox" wake-ups, but many real workflows require **routines** — recurring jobs with their own prompt, schedule, and execution context.

Examples:
- Daily production health check at 10:00 Berlin time with a detailed investigation prompt.
- End-of-day summary report at 18:00.
- Weekly dependency audit every Monday at 09:00.

## Why a New Primitive?

Three alternative approaches were considered. Routines were chosen because they are simpler, cheaper, and more universal.

### Alternative 1: Heartbeat with time-aware prompt

Pass current time to the agent via heartbeat, let the agent decide what to do based on its instructions ("if it's 10:00, run the health check").

### Alternative 2: Recurring issues

Add a recurrence rule to issues (like Linear/Asana). When an issue is completed, the system auto-creates the next instance. Agent picks it up through normal assignment wakeup.

### Alternative 3: Heartbeat `intervalSec` as cron

Extend the existing heartbeat policy with cron expressions instead of simple intervals.

### Comparison

| | Heartbeat + time | Recurring issues | Heartbeat cron | **Routines** |
|---|---|---|---|---|
| **Timing precision** | ±interval (could be 30-60 min off) | Depends on heartbeat polling | Precise (±30s) | Precise (±30s) |
| **Who decides "time to run"** | LLM (parses time, unreliable) | Scheduler + assignment | Scheduler | Scheduler |
| **Token cost on empty ticks** | Every tick = LLM invocation | No (assignment wakeup) | Every tick = LLM invocation | No (only fires on cron match) |
| **Custom prompt per task** | No (one heartbeat prompt) | Issue description | No (one heartbeat prompt) | Yes (dedicated prompt field) |
| **Visible in issue board** | No | Yes (each run = issue) | No | No |
| **Implementation complexity** | None (works today) | High (recurrence logic, cloning, state machine for skipped/overdue instances, template vs instance editing) | Low (~20 lines in tickTimers) | Medium (new table + scheduler service) |
| **New concept in data model** | None | None (extends issues) | None (extends heartbeat policy) | Yes (`routines` table) |
| **Separation from heartbeat** | Mixed — heartbeat does double duty | Separate (issue system) | Mixed — heartbeat does double duty | Clean separation |
| **Works without heartbeat** | No | No (needs assignment wakeup or heartbeat) | No | Yes |

### Why routines win

1. **Deterministic, not probabilistic.** The scheduler decides when to fire, not the LLM. Cron-parser costs 0 tokens. An LLM parsing "is it around 10:00?" costs tokens and can be wrong.

2. **Zero waste.** Routines only invoke the LLM when the cron expression matches. Heartbeat-based approaches invoke the LLM on every tick, even when there's nothing scheduled — the agent burns tokens just to conclude "not time yet."

3. **Clean separation of concerns.** Heartbeat = "check your inbox" (autonomous behavior). Routine = "do this specific thing at this time" (scheduled task). Mixing them into one system creates ambiguity: "when do I configure a heartbeat interval vs create a routine?"

4. **Independent of heartbeat.** A monitoring agent with no inbox can have heartbeat disabled and still run routines. This is impossible with heartbeat-based approaches.

5. **Simpler than recurring issues.** Recurring issues require a recurrence state machine (when to create next instance? what if previous isn't done? what to clone? how to handle template edits?). Routines are just: cron + prompt → trigger. The agent can create issues through the Paperclip API if the workflow needs issue tracking.

6. **Universal primitive.** Routines cover all scheduled use cases through the prompt:
   - Simple execution: routine runs agent with prompt, agent does the work.
   - With issue tracking: prompt instructs agent to create an issue and work on it.
   - With review flow: prompt instructs agent to create an issue, do the work, assign a reviewer.

   The flexibility is in the prompt, not in the data model.

## Relationship to Heartbeat

Routines are **orthogonal to heartbeat** — a separate trigger system, not an extension of heartbeat scheduling.

An agent can have:
- Heartbeat enabled (periodic inbox check) + routines (scheduled tasks)
- Heartbeat disabled + routines only
- Heartbeat only, no routines
- Neither

This complements #39 (skip LLM invocation when no assigned tasks) and #206 (proactive vs reactive heartbeat mode):

| Agent type | Heartbeat | Routines |
|------------|-----------|----------|
| Reactive IC (engineer) | Skip if no tasks (#39), saves tokens | "Weekly at Mon 09:00 — dependency audit" |
| Proactive manager (CEO) | Always run, triage inbox (#206) | "Daily at 18:00 — generate team report" |
| Monitoring agent | Disabled (no inbox to check) | "Daily at 10:00 — production health check" |

## Proposed Design

### Data Model

New table: `routines`

```sql
CREATE TABLE routines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  agent_id        UUID NOT NULL REFERENCES agents(id),
  project_id      UUID REFERENCES projects(id),

  -- Identity
  name            TEXT NOT NULL,
  description     TEXT,

  -- Schedule
  cron_expression TEXT NOT NULL,                -- 5-field cron: "0 10 * * *"
  timezone        TEXT NOT NULL DEFAULT 'UTC',  -- IANA: "Europe/Berlin"
  enabled         BOOLEAN NOT NULL DEFAULT true,
  next_run_at     TIMESTAMPTZ,                 -- Pre-computed next fire time

  -- Execution
  prompt          TEXT NOT NULL,                -- The routine-specific prompt
  session_mode    TEXT NOT NULL DEFAULT 'isolated', -- "isolated" | "resume"

  -- State (minimal — run history lives in heartbeat_runs via routine_id FK)
  last_run_id     UUID,                        -- FK to heartbeat_runs for UI

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only index the scheduler needs
CREATE INDEX routines_due_idx
  ON routines(next_run_at) WHERE enabled = true AND next_run_at IS NOT NULL;
```

Add `routine_id` FK to `heartbeat_runs` for run history:

```sql
ALTER TABLE heartbeat_runs
  ADD COLUMN routine_id UUID REFERENCES routines(id);

CREATE INDEX heartbeat_runs_routine_idx
  ON heartbeat_runs(routine_id) WHERE routine_id IS NOT NULL;
```

Key design choices:

- **`next_run_at`** — Pre-computed next fire time. The scheduler queries `WHERE next_run_at <= now()` — one indexed scan, zero cron parsing in the hot path. Cron is only parsed twice: on create/update (to validate + compute first `next_run_at`) and after each trigger (to compute the next one). The UI gets "Next run: March 8, 10:00 CET" for free.
- **Minimal state on the routine** — Only `last_run_id` is denormalized (for the UI to show the most recent run). All other run state (status, errors, history) is queryable via `routine_id` FK on `heartbeat_runs`. Less state = less code = fewer sync bugs.
- **`project_id`** — Provides workspace resolution (cwd, MCP config) via the existing `resolveWorkspaceForRun()` path.
- **`session_mode`** — `"isolated"` starts a fresh session each run (default). `"resume"` continues from the previous session, useful for routines that build on prior context (e.g., ongoing research).

### Architecture: Scheduler as a Thin Trigger Layer

The design has one rule: **all routine-specific logic lives in the scheduler. The heartbeat execution layer knows nothing about routines.**

The scheduler resolves a routine into a generic wakeup request. From that point, the existing heartbeat pipeline handles everything — workspace resolution, adapter invocation, run tracking. No new execution engine.

```
Scheduler ─── resolves routine ──→ enqueueWakeup() ──→ Heartbeat pipeline
(routine-aware)                    (generic)            (generic)
```

The heartbeat execution layer gains two generic capabilities (usable by any future trigger source, not just routines):

1. **Config overrides** — `context.configOverrides` merged into adapter config via the existing `issueAssigneeOverrides` spread pattern: `{ ...config, ...issueAssigneeOverrides?.adapterConfig, ...context.configOverrides }`. One line. The routine scheduler passes `{ promptTemplate: routine.prompt }` — but any config field can be overridden by any trigger source. This also makes per-routine adapter overrides (model, thinking, timeout) trivially addable later with zero heartbeat changes.
2. **Session mode** — `context.sessionMode === "isolated"` → clear previous session before adapter invocation.

Plus one metadata column: `opts.routineId` → `heartbeat_runs.routine_id` (same pattern as existing FK fields).

All adapters (claude-local, codex-local, cursor-local, etc.) work without changes — config overrides are merged before adapter invocation.

### Scheduler

`server/src/services/scheduler.ts`

```typescript
export async function tickRoutines(db, heartbeat, now = new Date()) {
  // Single indexed query — no cron parsing in the hot path
  const due = await db.select().from(routines)
    .where(and(eq(routines.enabled, true), lte(routines.nextRunAt, now)));

  for (const routine of due) {
    const agent = await getAgent(routine.agentId);
    if (!agent || agent.status === "paused" || agent.status === "terminated") continue;

    const run = await heartbeat.enqueueWakeup(routine.agentId, {
      source: "automation",
      triggerDetail: "routine",
      reason: "routine",
      routineId: routine.id,
      contextSnapshot: {
        configOverrides: { promptTemplate: routine.prompt },
        projectId: routine.projectId,
        sessionMode: routine.sessionMode,
      },
    });

    // Advance to next occurrence (only place cron is parsed at runtime)
    const next = cronParser.parse(routine.cronExpression, {
      tz: routine.timezone, currentDate: now,
    }).next().toDate();

    await db.update(routines)
      .set({ nextRunAt: next, lastRunId: run?.id, updatedAt: now })
      .where(eq(routines.id, routine.id));
  }
}
```

One exported function. ~20 lines of logic. No service wrapper, no baseline comparisons, no `prev()` tricks.

### Timer Integration

In `server/src/index.ts`, alongside the existing heartbeat timer:

```typescript
if (config.heartbeatSchedulerEnabled) {
  setInterval(() => {
    const now = new Date();
    heartbeat.tickTimers(now);
    tickRoutines(db, heartbeat, now);
  }, config.heartbeatSchedulerIntervalMs);
}
```

Both run on the same 30s interval. The routine check is one indexed query returning only due routines (typically 0).

### API Endpoints

```
POST   /api/agents/:agentId/routines              — Create
GET    /api/agents/:agentId/routines              — List all for agent
GET    /api/agents/:agentId/routines/:id          — Get one
PATCH  /api/agents/:agentId/routines/:id          — Update
DELETE /api/agents/:agentId/routines/:id          — Delete
POST   /api/agents/:agentId/routines/:id/trigger  — Trigger manually (run now)
```

On create/update, the API computes `next_run_at` from the cron expression + timezone. This is the only place cron is parsed besides post-trigger advancement.

### UI

Routines live under the agent — a new **Routines** tab in agent settings.

Each routine shows:
- Name, description
- Project (dropdown — determines workspace/cwd)
- Cron expression + timezone (with human-readable preview from `next_run_at`)
- Prompt (multiline text editor, markdown)
- Session mode (isolated / resume)
- Enabled/disabled toggle
- Next run time, last run status (via `last_run_id` join)
- "Run now" button

## Files to Create / Change

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/schema/routines.ts` | **Create** | Table schema |
| `packages/db/src/schema/index.ts` | Edit | Export new schema |
| `packages/db/src/schema/heartbeat_runs.ts` | Edit | Add `routine_id` FK column |
| `packages/db/src/migrations/...` | **Create** | Migration for new table + column |
| `server/src/services/scheduler.ts` | **Create** | `tickRoutines()` — ~20 lines |
| `server/src/services/heartbeat.ts` | Edit | Generic: configOverrides merge, session mode, routineId FK (~5 lines, no routine-specific logic) |
| `server/src/routes/agents.ts` | Edit | Add routine CRUD + trigger endpoints |
| `server/src/index.ts` | Edit | Add scheduler.tickRoutines to timer loop |
| `server/package.json` | Edit | Add `cron-parser` dependency |
| `ui/` | Edit | Add Routines tab to agent settings |

## Edge Cases

**Server downtime:** On restart, `next_run_at` is already in the past → the routine fires immediately on the next tick. At-most-once semantics: only one catch-up run, regardless of how long the server was down.

**Agent paused/terminated:** Scheduler skips without advancing `next_run_at`. When the agent is resumed, `next_run_at` is in the past → one natural catch-up run fires, then `next_run_at` advances to the next future occurrence. No burst — at-most-once semantics apply.

**Invalid cron expression:** Validated on create/update (API returns 400). If a stored expression becomes unparseable, `next_run_at` won't be advanced → routine effectively disables itself. Logged as warning.

**DST transitions:** `cron-parser` with timezone support handles DST correctly. `0 10 * * *` in `Europe/Berlin` fires at 10:00 CET in winter and 10:00 CEST in summer.

**Concurrent runs:** Respects the agent's `maxConcurrentRuns` policy via the existing heartbeat execution pipeline. If the agent is already running, the wakeup is coalesced or queued per existing behavior.

## Out of Scope (future)

- Adapter overrides per routine (different model/thinking/timeout). Use agent defaults for now. Note: the `configOverrides` mechanism makes this trivially addable — just extend the routine schema and pass more fields in overrides, zero heartbeat changes.
- Multiple cron schedules per routine (use multiple routines instead).
- Calendar-based exclusions (holidays, specific dates).
- Catch-up mode (fire all missed ticks, not just the latest).
- Chained routines (routine A triggers routine B on completion).
- Cost budgets per routine.
- Recurring issues as a separate feature in the issue system.
