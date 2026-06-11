import StatsBar from '@/components/StatsBar';
import TradeButtons from '@/components/TradeButtons';
import { getDashboardMarkets, getFocusData, type FocusData } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 5;

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPrice(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toFixed(3);
}

function edgeColor(edge: number | null): string {
  if (edge === null) return 'text-zinc-400';
  if (edge > 0.02) return 'text-green-400';
  if (edge < -0.02) return 'text-red-400';
  return 'text-zinc-400';
}

function FocusPanel({ focus }: { focus: FocusData }) {
  return (
    <section className="border-b border-zinc-800">
      <h2 className="px-3 pt-3 text-xs uppercase tracking-wide text-zinc-500">
        focus · highest temp {focus.locationName ? `· ${focus.locationName}` : ''} ·{' '}
        {focus.targetDate}
      </h2>
      <div className="px-3 py-2 text-xs text-zinc-400">
        {focus.forecasts.length === 0 ? (
          <span>No daily-max forecasts yet — waiting on collector.</span>
        ) : (
          <span>
            Forecast high:{' '}
            {focus.forecasts
              .map((f) => `${f.provider} ${f.tempMaxF.toFixed(0)}°F`)
              .join(' · ')}
          </span>
        )}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase text-zinc-500">
            <th className="px-3 py-1 font-normal">Bucket</th>
            <th className="py-1 font-normal">Market</th>
            <th className="py-1 font-normal">Model</th>
            <th className="py-1 font-normal">Edge</th>
            <th className="py-1 pr-3 font-normal">Call</th>
          </tr>
        </thead>
        <tbody>
          {focus.buckets.map((b) => (
            <tr key={b.rowId} className="border-t border-zinc-800/60">
              <td className="px-3 py-1.5">{b.label}</td>
              <td className="py-1.5">{fmtPct(b.midpointYes)}</td>
              <td className="py-1.5">{fmtPct(b.modelProb)}</td>
              <td className={`py-1.5 ${edgeColor(b.edge)}`}>
                {b.edge === null ? '—' : `${(b.edge * 100).toFixed(1)}%`}
              </td>
              <td className="py-1.5 pr-3 text-zinc-500">{b.decision ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function DashboardPage() {
  const [markets, focus] = await Promise.all([getDashboardMarkets(), getFocusData()]);
  return (
    <div>
      <StatsBar />
      {focus ? <FocusPanel focus={focus} /> : null}
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
        active markets ({markets.length})
      </h2>
      {markets.length === 0 ? (
        <div className="px-3 py-6 text-sm text-zinc-400">
          No active markets yet. Run the live-feed to discover some.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
          {markets.map((m) => (
            <li key={m.rowId} className="px-3 py-3">
              <div className="text-sm">{m.question}</div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-zinc-400">
                <div>
                  <div className="text-[10px] uppercase text-zinc-500">Market</div>
                  <div>{fmtPrice(m.midpointYes)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500">Model</div>
                  <div>{fmtPct(m.modelProb)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-zinc-500">Edge</div>
                  <div className={edgeColor(m.edge)}>
                    {m.edge === null ? '—' : `${(m.edge * 100).toFixed(1)}%`}
                  </div>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                {m.decision ? <span>· {m.decision}</span> : null}
                {m.endDate ? <span>· ends {m.endDate.toISOString().slice(0, 10)}</span> : null}
              </div>
              <TradeButtons marketId={m.rowId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
