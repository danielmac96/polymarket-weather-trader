'use client';
import { useEffect, useState } from 'react';

type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

interface RiskProfile {
  kellyFraction: number;
  maxPositionPct: number;
  maxTotalExposurePct: number;
  edgeThreshold: number;
  minConfidence: number;
  maxUnitsPerTrade: number;
}

interface Settings {
  unitSizeUsd: number;
  riskTolerance: RiskTolerance;
  autoTradeEnabled: boolean;
  updatedAt: string;
}

const RISK_LABELS: Record<RiskTolerance, string> = {
  LOW: 'Low — patient, small bets',
  MEDIUM: 'Medium — balanced growth',
  HIGH: 'High — aggressive compounding',
};

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profiles, setProfiles] = useState<Record<RiskTolerance, RiskProfile> | null>(null);
  const [unitSize, setUnitSize] = useState('');
  const [risk, setRisk] = useState<RiskTolerance>('MEDIUM');
  const [autoTrade, setAutoTrade] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setProfiles(d.profiles);
        setUnitSize(String(d.settings.unitSizeUsd));
        setRisk(d.settings.riskTolerance);
        setAutoTrade(d.settings.autoTradeEnabled);
      })
      .catch(() => setError('failed to load settings'));
  }, []);

  async function save() {
    const parsed = Number(unitSize);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1000) {
      setStatus('error');
      setError('Unit size must be between $1 and $1000');
      return;
    }
    setStatus('saving');
    setError('');
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unitSizeUsd: parsed,
        riskTolerance: risk,
        autoTradeEnabled: autoTrade,
      }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setStatus('error');
      setError('save failed');
      return;
    }
    const d = await res.json();
    setSettings(d.settings);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  }

  if (!settings || !profiles) {
    return <div className="px-3 py-6 text-sm text-zinc-400">{error || 'Loading…'}</div>;
  }

  const profile = profiles[risk];

  return (
    <div className="space-y-5 px-3 py-4">
      <section>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Unit size (USD)
        </label>
        <p className="mt-1 text-xs text-zinc-400">
          Your base bet. Every position is a whole number of units; the engine picks
          how many units per trade from the edge and your risk tolerance.
        </p>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={1000}
          value={unitSize}
          onChange={(e) => setUnitSize(e.target.value)}
          className="mt-2 w-32 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
      </section>

      <section>
        <label className="text-xs uppercase tracking-wide text-zinc-500">
          Risk tolerance
        </label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(Object.keys(RISK_LABELS) as RiskTolerance[]).map((r) => (
            <button
              key={r}
              onClick={() => setRisk(r)}
              className={`rounded border px-2 py-2 text-xs ${
                risk === r
                  ? 'border-green-500 bg-green-500/10 text-green-300'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-400">{RISK_LABELS[risk]}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400">
          <span>Kelly fraction</span>
          <span className="text-right text-zinc-200">{profile.kellyFraction}</span>
          <span>Min edge to trade</span>
          <span className="text-right text-zinc-200">
            {(profile.edgeThreshold * 100).toFixed(0)}%
          </span>
          <span>Max per position</span>
          <span className="text-right text-zinc-200">
            {(profile.maxPositionPct * 100).toFixed(0)}% of equity
          </span>
          <span>Max total exposure</span>
          <span className="text-right text-zinc-200">
            {(profile.maxTotalExposurePct * 100).toFixed(0)}% of equity
          </span>
          <span>Max units per trade</span>
          <span className="text-right text-zinc-200">{profile.maxUnitsPerTrade}</span>
          <span>Min model confidence</span>
          <span className="text-right text-zinc-200">
            {(profile.minConfidence * 100).toFixed(0)}%
          </span>
        </div>
      </section>

      <section className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Auto trading
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Hands-off mode: open paper positions automatically on TRADE signals.
          </p>
        </div>
        <button
          onClick={() => setAutoTrade((v) => !v)}
          className={`ml-4 h-7 w-12 shrink-0 rounded-full border transition-colors ${
            autoTrade ? 'border-green-500 bg-green-500/30' : 'border-zinc-700 bg-zinc-800'
          }`}
          aria-pressed={autoTrade}
        >
          <span
            className={`block h-5 w-5 rounded-full bg-white transition-transform ${
              autoTrade ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </section>

      <button
        onClick={save}
        disabled={status === 'saving'}
        className="w-full rounded bg-green-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save settings'}
      </button>
      {status === 'error' ? <p className="text-xs text-red-400">{error}</p> : null}
      <p className="text-[10px] text-zinc-600">
        Changes apply on the analyzer&apos;s next cycle (within a minute) — no restart
        needed. Paper trading only.
      </p>
    </div>
  );
}
