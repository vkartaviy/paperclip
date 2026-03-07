# Company Secrets Management UI

## Problem

Secrets (API keys, connection strings) are company-level resources shared across agents, but the only way to manage them today is through the agent's env config form. This creates a real UX problem:

**Creating secrets is broken on the agent side.** The current flow:
1. User adds an env variable, switches the dropdown from "Plain" to "Secret"
2. The variable silently disappears — `emit()` skips rows with empty `secretId`, the parent state loses the variable, and on re-render the row is gone
3. If the user instead enters a plain value first and clicks "Seal", a `window.prompt()` asks for a secret name — functional but ugly and insecure
4. The "New" button in secret mode requires a `plainValue` that doesn't exist because the input field is replaced by a select dropdown
5. There is no way to view, rotate, or delete existing secrets
6. There is no way to see which agents reference a given secret

**The root cause:** secret lifecycle management (create, rotate, delete) is jammed into the agent config form, which should only handle referencing existing secrets. Moving secret management to a dedicated Company Settings page fixes the flow and makes everything logical — secrets are company resources managed in one place, agents just pick which ones they need.

## Current State

**Backend: fully implemented.** All CRUD + rotate endpoints exist:

```
GET    /api/companies/:companyId/secrets           — List all
GET    /api/companies/:companyId/secret-providers   — List providers
POST   /api/companies/:companyId/secrets           — Create
PATCH  /api/secrets/:id                            — Update (name, description)
POST   /api/secrets/:id/rotate                     — Rotate (new value)
DELETE /api/secrets/:id                            — Delete
```

API client: `ui/src/api/secrets.ts` — all methods implemented.

**UI: missing.** No dedicated page. Secrets are only created/selected inline in `AgentConfigForm.tsx`.

**Data model:**
- `company_secrets` — name, provider, latest_version, description, created_by
- `company_secret_versions` — encrypted material per version
- Encryption: AES-256-GCM via local master key (`server/data/secrets/master.key`, auto-generated)

## Proposed Changes

### 1. Company Settings → Secrets tab

Add a **Secrets** section to the existing Company Settings page (`/company/settings`).

| Column | Description |
|--------|-------------|
| Name | e.g. `POSTGRES_URL`, `DD_API_KEY` |
| Provider | `local_encrypted` (default) |
| Description | Optional note |
| Version | Current version number |
| Created | Timestamp |
| Actions | Rotate, Edit, Delete |

**Create dialog:**
- Name (text input, validated: `^[A-Za-z_][A-Za-z0-9_]*$`)
- Value (password input, not shown after creation)
- Description (optional textarea)

**Rotate dialog:**
- New value (password input)
- Shows current version → next version

**Delete:** Confirmation dialog. Warn if secret is referenced by any agent's env config.

### 2. Agent Env Config — simplified to selection only

Remove all inline secret creation from `AgentConfigForm.tsx` (`sealRow`, `createSecretForRow`, `window.prompt`). The env editor becomes:

- **Plain mode:** text input for value (as today)
- **Secret mode:** dropdown of existing company secrets. No "New" / "Seal" buttons.
- Below the env table, a small helper text: _"Secrets are managed in [Company Settings → Secrets](/company/settings)."_ with a link.

The agent config form does one thing: reference existing resources. All secret lifecycle management lives in Company Settings. Simple, logical, no broken flows.

### 3. Usage visibility (optional, nice-to-have)

On the secrets page, show which agents reference each secret. Query: scan `agents.adapter_config->'env'` for `secret_ref` entries matching the secret ID.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `ui/src/pages/CompanySettings.tsx` | Edit | Add Secrets tab/section |
| `ui/src/components/SecretsManager.tsx` | **Create** | Secrets list + create/rotate/delete dialogs |
| `ui/src/components/AgentConfigForm.tsx` | Edit | Remove `sealRow`, `createSecretForRow`, `window.prompt`. Secret mode = dropdown only + link to settings. |
| `ui/src/App.tsx` | Maybe | If secrets get their own route instead of a tab |

## Out of Scope

- Project-level secrets (all secrets are company-level for now)
- External secret providers (AWS Secrets Manager, GCP, Vault) — backend supports them but UI can start with `local_encrypted` only
- Secret access policies (which agents can use which secrets)
