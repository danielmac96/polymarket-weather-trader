import StatsBar from '@/components/StatsBar';
import { getEquityHistory } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const revalidate = 10;

export default async function PortfolioPage() {
  const series = await getEquityHistory(200);
  return (
    <div>
      <StatsBar />
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
        equity ({series.length} points)
      </h2>
      <div className="px-3">
        <EquityChart series={series} />
      </div>
    </div>
  );
}

function EquityChart({ series }: { series: Array<{ at: Date; totalEquityUsd: number }> }) {
  if (series.length === 0) {
    return <div className="py-6 text-sm text-zinc-400">No snapshots yet.</div>;
  }
  const w = 360;
  const h = 200;
  const pad = 20;

  const vs = series.map((s) => s.totalEquityUsd);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);
  const valueRange = maxV - minV || 1;

  const xs = series.map((s) => s.at.getTime());
  const minT = xs[0] ?? 0;
  const maxT = xs[xs.length - 1] ?? 1;
  const timeRange = maxT - minT || 1;

  const points = series.map((s) => {
    const x = pad + ((s.at.getTime() - minT) / timeRange) * (w - 2 * pad);
    const y = h - pad - ((s.totalEquityUsd - minV) / valueRange) * (h - 2 * pad);
    return { x, y, v: s.totalEquityUsd, t: s.at };
  });

  // Single-point case: render a dot in the middle.
  if (points.length === 1) {
    const p = points[0]!;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <rect x="0" y="0" width={w} height={h} fill="#0b0d10" />
        <circle cx={w / 2} cy={h / 2} r="4" fill="#22c55e" />
        <text x={w / 2} y={h / 2 - 10} textAnchor="middle" fill="#a1a1aa" fontSize="10">
          ${p.v.toFixed(2)}
        </text>
      </svg>
    );
  }

  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const stroke = last.v >= first.v ? '#22c55e' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <rect x="0" y="0" width={w} height={h} fill="#0b0d10" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" />
      <text x={pad} y={pad - 4} fill="#a1a1aa" fontSize="9">
        ${maxV.toFixed(2)}
      </text>
      <text x={pad} y={h - 4} fill="#a1a1aa" fontSize="9">
        ${minV.toFixed(2)}
      </text>
      <text x={w - pad} y={h - 4} textAnchor="end" fill="#a1a1aa" fontSize="9">
        ${last.v.toFixed(2)}
      </text>
    </svg>
  );
}
