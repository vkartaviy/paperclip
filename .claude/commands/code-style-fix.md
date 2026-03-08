Fix code style (eslint + prettier) on fork-only files — files added by us, not present in upstream.

Prettier is integrated into ESLint via eslint-plugin-prettier, so a single `eslint --fix` handles both code quality and formatting.

IMPORTANT: All commands below MUST run from the project root `/Users/vk/Development/Paperclip`.

Steps:

1. Install lint dependencies if needed:
   ```bash
   cd /Users/vk/Development/Paperclip/.claude/lint && [ -d node_modules ] || pnpm install --ignore-workspace
   ```

2. Get the list of "our" files (added in fork, not in upstream). Run from project root:
   ```bash
   cd /Users/vk/Development/Paperclip && \
   (git diff --name-only --diff-filter=A HEAD upstream/master; \
    git diff --name-only --diff-filter=A --cached; \
    git ls-files --others --exclude-standard) \
   | sort -u | grep -E '\.(ts|tsx)$' | grep -v -E '(node_modules/|dist/|\.claude/lint/)'
   ```

3. If no files found, report "No fork-only files to format" and stop.

4. Run ESLint with auto-fix from the project root. Pass files as individual arguments (not a single string):
   ```bash
   cd /Users/vk/Development/Paperclip && \
   .claude/lint/node_modules/.bin/eslint --fix --config .claude/lint/eslint.config.mjs \
     file1.ts file2.tsx ...
   ```

5. Report summary: how many files were processed, any remaining ESLint errors that couldn't be auto-fixed.

IMPORTANT: Never run eslint on files that exist in upstream/master. Only process files that were added by us.
