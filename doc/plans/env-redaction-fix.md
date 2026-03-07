# Fix: Redact All Secret-Sourced Env Vars in Logs

## Problem

When an agent runs, its env vars are logged via `redactEnvForLogs()`. This function redacts based on **key name** — it matches `/(key|token|secret|password|passwd|authorization|cookie)/i`. Any env var whose name doesn't match the regex is logged in plaintext.

`POSTGRES_URL` is stored as a company secret (`secret_ref`), but its name doesn't match the regex, so its full connection string (with embedded credentials) appears in run logs.

This is a **data leak**: the secret system encrypts values at rest with AES-256-GCM, but the value is then printed unredacted in logs because the redaction layer doesn't know it came from a secret.

## Root Cause

`resolveAdapterConfigForRuntime()` in `server/src/services/secrets.ts:334` resolves `secret_ref` bindings into plain string values, discarding the metadata about which keys were secrets. By the time the adapter calls `redactEnvForLogs(env)`, `env` is a flat `Record<string, string>` — there's no way to distinguish a secret-sourced value from a plain one.

```
adapter_config.env (stored):
  POSTGRES_URL: { type: "secret_ref", secretId: "abc-123" }
  LOG_LEVEL:    { type: "plain", value: "debug" }

After resolveAdapterConfigForRuntime():
  POSTGRES_URL: "postgres://user:pass@host/db"   ← secret origin lost
  LOG_LEVEL:    "debug"

redactEnvForLogs() sees:
  POSTGRES_URL → name doesn't match regex → LEAKED
  LOG_LEVEL    → name doesn't match regex → shown (correct, it's plain)
```

## Fix

Return the set of secret-sourced keys alongside the resolved env. Intercept in the `onAdapterMeta` callback in `heartbeat.ts` — the single point where env is logged. Adapters don't change.

### 1. `resolveAdapterConfigForRuntime()` → return secret keys

Change the return type to include a `secretKeys` set.

```typescript
// server/src/services/secrets.ts

resolveAdapterConfigForRuntime: async (companyId: string, adapterConfig: Record<string, unknown>) => {
  const resolved = { ...adapterConfig };
  const secretKeys = new Set<string>();

  if (!Object.prototype.hasOwnProperty.call(adapterConfig, "env")) {
    return { config: resolved, secretKeys };
  }
  const record = asRecord(adapterConfig.env);
  if (!record) {
    resolved.env = {};
    return { config: resolved, secretKeys };
  }
  const env: Record<string, string> = {};
  for (const [key, rawBinding] of Object.entries(record)) {
    // ... existing validation ...
    const binding = canonicalizeBinding(parsed.data as EnvBinding);
    if (binding.type === "plain") {
      env[key] = binding.value;
    } else {
      env[key] = await resolveSecretValue(companyId, binding.secretId, binding.version);
      secretKeys.add(key);
    }
  }
  resolved.env = env;
  return { config: resolved, secretKeys };
},
```

### 2. Intercept in `onAdapterMeta` — one place, zero adapter changes

The `onAdapterMeta` callback in `heartbeat.ts` is the single point where adapter invocation metadata (including env) is written to the run log. Adapters already call `redactEnvForLogs()` with the key-name regex — we add a provenance-based layer on top, right in the callback:

```typescript
// server/src/services/heartbeat.ts (around line 1243)

const { config: resolvedConfig, secretKeys } = await secretsSvc.resolveAdapterConfigForRuntime(
  agent.companyId,
  mergedConfig,
);

const onAdapterMeta = async (meta: AdapterInvocationMeta) => {
  // Redact secret-sourced keys on top of adapter's regex-based redaction
  if (meta.env && secretKeys.size > 0) {
    for (const key of secretKeys) {
      if (key in meta.env) meta.env[key] = "***REDACTED***";
    }
  }
  await appendRunEvent(currentRun, seq++, {
    eventType: "adapter.invoke",
    stream: "system",
    level: "info",
    message: "adapter invocation",
    payload: meta as unknown as Record<string, unknown>,
  });
};
```

Why this works:
- `onAdapterMeta` is created in heartbeat, where `secretKeys` is already available after `resolveAdapterConfigForRuntime()`.
- Adapters pass `meta.env` already regex-redacted — we just catch what the regex missed.
- **Zero adapter changes.** New adapters are automatically covered.
- The callback is the only place env reaches the run log — there's no other code path.

## Files to Change

| File | Change |
|------|--------|
| `server/src/services/secrets.ts` | `resolveAdapterConfigForRuntime` returns `{ config, secretKeys }` |
| `server/src/services/heartbeat.ts` | Destructure new return shape, redact `secretKeys` in `onAdapterMeta` |

Two files. That's it.

## Why Not Just Expand the Regex?

Adding `url|connection|dsn|database` to `SENSITIVE_ENV_KEY` is a whack-a-mole approach. Users can name secrets anything — `MY_WEBHOOK`, `STRIPE_ACCOUNT`, `SLACK_INCOMING`. The correct invariant is: **if a value came from a secret, it's always redacted.** The regex remains as a safety net for plain env vars that happen to look sensitive.

## Leak Surface Analysis

There are two vectors where secret values can appear in logs:

| Vector | How | Severity | Fixed by this plan? |
|--------|-----|----------|---------------------|
| `onMeta` env dump | Server logs env as adapter invocation metadata | High — always visible in run UI | **Yes** |
| stdout/stderr | Agent or tool prints the value (e.g. `echo $POSTGRES_URL`, error messages with connection strings) | Medium — only if external process prints it | No |

**Why stdout scrubbing is a separate problem:**
- Requires comparing every chunk of stdout against every secret value — O(chunks × secrets).
- Values can appear partial, base64-encoded, URL-encoded, or split across chunks.
- GitHub Actions and GitLab CI solve this with plain string matching against a known secret list. It works but is a different system (output filter vs. metadata redaction).
- False positives are possible (short secret values matching normal output).

This plan fixes the **server-controlled** leak (metadata logging). Stdout scrubbing is a future enhancement that would apply the same `secretKeys` set as a value-based filter on `onLog` output.

## Out of Scope

- Stdout/stderr output scrubbing (see analysis above — future plan)
- Redacting secrets in the prompt template (secrets shouldn't be in prompts)
- Extending the key-name regex (provenance tracking makes this unnecessary)
