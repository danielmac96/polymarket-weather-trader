import { getLatestSnapshot } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default async function StatsBar() {
  const s = await getLatestSnapshot();
  if (!s) {
    return (
      <div className="px-3 py-3 text-sm text-zinc-400">No snapshot yet.</div>
    );
  }
  const roiPositive = s.roiPct >= 0;
  return (
    <div className="grid grid-cols-3 gap-2 px-3 py-3 text-xs sm:grid-cols-5">
      <Stat label="Equity" value={fmtUsd(s.totalEquityUsd)} />
      <Stat
        label="ROI"
        value={`${s.roiPct.toFixed(2)}%`}
        color={roiPositive ? 'text-green-400' : 'text-red-400'}
      />
      <Stat label="Win%" value={`${s.winRatePct.toFixed(0)}%`} />
      <Stat label="Open" value={`${s.openPositionsCount}`} />
      <Stat
        label="Unrlz"
        value={fmtUsd(s.unrealizedPnlUsd)}
        color={s.unrealizedPnlUsd >= 0 ? 'text-green-400' : 'text-red-400'}
      />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-base font-semibold ${color ?? ''}`}>{value}</div>
    </div>
  );
}
