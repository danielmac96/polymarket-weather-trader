import { getAllMarkets } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 10;

function edgeColor(edge: number | null): string {
  if (edge === null) return 'text-zinc-400';
  if (edge > 0.02) return 'text-green-400';
  if (edge < -0.02) return 'text-red-400';
  return 'text-zinc-400';
}

export default async function MarketsPage() {
  const markets = await getAllMarkets();
  return (
    <div>
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
        all markets ({markets.length})
      </h2>
      {markets.length === 0 ? (
        <div className="px-3 py-6 text-sm text-zinc-400">No markets yet.</div>
      ) : (
        <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
          {markets.map((m) => (
            <li key={m.rowId} className="px-3 py-3">
              <div className="text-sm">{m.question}</div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500">
                <span>{m.status}</span>
                {m.decision ? <span>· {m.decision}</span> : null}
                {m.edge !== null ? (
                  <span className={edgeColor(m.edge)}>
                    edge {(m.edge * 100).toFixed(1)}%
                  </span>
                ) : null}
                {m.endDate ? <span>ends {m.endDate.toISOString().slice(0, 10)}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
