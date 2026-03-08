# Fork rules (vk fork of paperclipai/paperclip)

## Extension-first architecture

This is a fork of `paperclipai/paperclip`. We regularly sync from `upstream/master`.
To minimize merge conflicts, follow these rules:

### DO
- Add new files in dedicated directories (`ui/src/components/office/`, `ui/src/pages/`, `packages/db/src/office/`, `server/src/routes/office.ts`, etc.)
- Keep upstream file modifications to single-line additions (imports, route registrations, exports)
- Use `@/` alias for imports in `ui/src/` — never `../`
- Use `import type` at the top of the file — never inline `import("pkg").Type`

### DON'T
- Modify upstream file structure (don't wrap/restructure JSX, don't refactor existing functions)
- Add dependencies to root `package.json` or `pnpm-lock.yaml`
- Add configs (`.prettierrc`, `.eslintrc`, `.editorconfig`) that conflict with upstream — our lint config lives in `.claude/lint/`
- Touch files outside our feature scope unless absolutely necessary

### Upstream touch points (keep minimal)
When adding a new feature, the only upstream files you should touch are:
- `ui/src/App.tsx` — add Route
- `ui/src/components/Sidebar.tsx` — add NavItem
- `ui/src/lib/company-routes.ts` — add route root
- `ui/src/lib/queryKeys.ts` — add query key
- `ui/src/api/client.ts` — add HTTP method if missing
- `server/src/app.ts` — register route
- `server/src/services/index.ts` — export service
- `packages/db/package.json` — add export path

Each touch should be a single line (import + usage). If you need more, extract logic into a new file.

## Commands

- `/code-style-fix` — ESLint + Prettier on fork-only files. Config lives in `.claude/lint/`.
- `/git-upstream-sync` — Fetch & merge `upstream/master`, resolve conflicts, push.
- `/git-upstream-pr` — Create a PR from fork back to `paperclipai/paperclip` on a clean branch.
