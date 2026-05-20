import StatsBar from '@/components/StatsBar';
import { getClosedPositions } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 5;

function fmtUsd(n: number | null): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}$${n.toFixed(2)}`;
}

const STATUS_LABEL: Record<string, string> = {
  CLOSED_MANUAL: 'manual',
  RESOLVED_WIN: 'won',
  RESOLVED_LOSS: 'lost',
};

export default async function HistoryPage() {
  const closed = await getClosedPositions();
  return (
    <div>
      <StatsBar />
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
        closed ({closed.length})
      </h2>
      {closed.length === 0 ? (
        <div className="px-3 py-6 text-sm text-zinc-400">No closed trades yet.</div>
      ) : (
        <div className="border-y border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900">
              <tr className="text-left text-zinc-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Side</th>
                <th className="px-2 py-2">Entry</th>
                <th className="px-2 py-2">Close</th>
                <th className="px-2 py-2">PnL</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {closed.map((t) => {
                const pnlColor =
                  (t.realizedPnlUsd ?? 0) >= 0 ? 'text-green-400' : 'text-red-400';
                return (
                  <tr key={t.id}>
                    <td className="px-2 py-2 text-zinc-400">
                      {t.closedAt ? t.closedAt.toISOString().slice(5, 10) : '—'}
                      <div className="text-[10px] text-zinc-500">
                        {t.question.slice(0, 40)}
                      </div>
                    </td>
                    <td className="px-2 py-2">{t.side}</td>
                    <td className="px-2 py-2">{t.entryPrice.toFixed(3)}</td>
                    <td className="px-2 py-2">
                      {t.closePrice === null ? '—' : t.closePrice.toFixed(3)}
                    </td>
                    <td className={`px-2 py-2 ${pnlColor}`}>{fmtUsd(t.realizedPnlUsd)}</td>
                    <td className="px-2 py-2 text-zinc-400">{STATUS_LABEL[t.status] ?? t.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
