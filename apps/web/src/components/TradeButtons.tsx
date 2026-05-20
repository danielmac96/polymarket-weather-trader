'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TradeButtons({ marketId }: { marketId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<'YES' | 'NO' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(side: 'YES' | 'NO') {
    setLoading(side);
    setErr(null);
    try {
      const res = await fetch('/api/paper-trade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ marketId, side }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => go('YES')}
          disabled={loading !== null}
          className="flex-1 rounded bg-green-700 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading === 'YES' ? '…' : 'Buy YES'}
        </button>
        <button
          type="button"
          onClick={() => go('NO')}
          disabled={loading !== null}
          className="flex-1 rounded bg-red-700 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading === 'NO' ? '…' : 'Buy NO'}
        </button>
      </div>
      {err ? <div className="text-[11px] text-red-400">{err}</div> : null}
    </div>
  );
}
