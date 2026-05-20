'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CloseButton({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function close() {
    if (!confirm('Close this position at current midpoint?')) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/close-trade/${tradeId}`, { method: 'POST' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <button
        type="button"
        onClick={close}
        disabled={loading}
        className="rounded bg-zinc-700 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {loading ? '…' : 'Close'}
      </button>
      {err ? <div className="text-[11px] text-red-400">{err}</div> : null}
    </div>
  );
}
