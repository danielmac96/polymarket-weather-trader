import { getFooterHealth } from '@/lib/footerHealth';

export const dynamic = 'force-dynamic';

function ago(d: Date | null): string {
  if (!d) return 'never';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default async function Footer() {
  const h = await getFooterHealth();
  const wsStale = !h.lastPriceAt || Date.now() - h.lastPriceAt.getTime() > 60_000;
  return (
    <footer className="px-3 pb-2 pt-3 text-[10px] text-zinc-500">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          <span
            aria-label={wsStale ? 'ws stale' : 'ws live'}
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              wsStale ? 'bg-red-500' : 'bg-green-500'
            }`}
          />
          ws {ago(h.lastPriceAt)}
        </span>
        <span>· forecast {ago(h.lastForecastAt)}</span>
        <span>· analysis {ago(h.lastAnalysisAt)}</span>
        <span>· {h.activeMarketCount} active</span>
        {h.commitSha ? <span>· {h.commitSha}</span> : null}
      </div>
    </footer>
  );
}
