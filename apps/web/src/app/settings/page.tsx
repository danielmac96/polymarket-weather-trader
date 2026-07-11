import SettingsPanel from '@/components/SettingsPanel';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div>
      <h2 className="px-3 pt-3 text-xs uppercase tracking-wide text-zinc-500">
        trading settings
      </h2>
      <SettingsPanel />
    </div>
  );
}
