import { getFeedHealth } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function TopBar() {
  const health = await getFeedHealth();
  const stale = health.staleSeconds === null || health.staleSeconds > 60;
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
      <span className="font-semibold">polymarket weather</span>
      <span className="flex items-center gap-2 text-xs text-zinc-400">
        <span
          aria-label={stale ? 'feed stale' : 'feed live'}
          className={`inline-block h-2 w-2 rounded-full ${
            stale ? 'bg-red-500' : 'bg-green-500'
          }`}
        />
        {health.lastPriceAt
          ? `last ${health.staleSeconds ?? 0}s ago`
          : 'no data yet'}
      </span>
    </header>
  );
}
