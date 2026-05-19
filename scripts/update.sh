#!/bin/bash
set -e
echo "→ pulling..."
git pull
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
