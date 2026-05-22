#!/bin/bash
set -e
echo "→ pulling..."
git pull

# Ensure pnpm is on PATH — Codespaces sometimes drops the postCreateCommand
# global install for fresh shells. Prefer corepack (ships with Node 20).
if ! command -v pnpm >/dev/null 2>&1; then
  echo "→ pnpm missing, installing..."
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@9.12.0 --activate
  else
    npm install -g pnpm@9.12.0
  fi
fi

echo "→ installing..."
pnpm install
echo "→ migrating..."
pnpm db:migrate
echo "→ restarting services..."
pkill -f "node-cron\|next dev\|tsx watch" 2>/dev/null || true
sleep 2
nohup pnpm dev:all > /tmp/app.log 2>&1 &
sleep 3
echo "✓ Done. Refresh browser. Tail logs: tail -f /tmp/app.log"
