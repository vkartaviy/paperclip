#!/bin/sh
# Fork dev wrapper: runs upstream dev with extra --ignore for ui/ sources
# so frontend edits don't restart the backend (Vite HMR handles them).
exec pnpm dev -- --ignore ../ui/src --ignore ../ui/public
