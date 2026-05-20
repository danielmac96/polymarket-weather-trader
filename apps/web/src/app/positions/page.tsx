import StatsBar from '@/components/StatsBar';
import CloseButton from '@/components/CloseButton';
import { getOpenPositions } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 5;

function fmtUsd(n: number): string {
  return `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;
}

function age(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export default async function PositionsPage() {
  const positions = await getOpenPositions();
  return (
    <div>
      <StatsBar />
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
        open ({positions.length})
      </h2>
      {positions.length === 0 ? (
        <div className="px-3 py-6 text-sm text-zinc-400">No open positions.</div>
      ) : (
        <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
          {positions.map((p) => {
            const currentSide =
              p.currentYesMidpoint === null
                ? null
                : p.side === 'YES'
                  ? p.currentYesMidpoint
                  : 1 - p.currentYesMidpoint;
            const pnlColor = p.unrealizedPnlUsd >= 0 ? 'text-green-400' : 'text-red-400';
            return (
              <li key={p.id} className="px-3 py-3">
                <div className="text-sm">{p.question}</div>
                <div className="mt-1 grid grid-cols-4 gap-2 text-xs text-zinc-400">
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Side</div>
                    <div>{p.side}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Entry</div>
                    <div>{p.entryPrice.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">Now</div>
                    <div>{currentSide === null ? '—' : currentSide.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-zinc-500">PnL</div>
                    <div className={pnlColor}>{fmtUsd(p.unrealizedPnlUsd)}</div>
                  </div>
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">
                  ${p.sizeUsd.toFixed(2)} · {p.sharesQty.toFixed(1)} shares · {age(p.openedAt)} ago
                </div>
                <CloseButton tradeId={p.id} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
