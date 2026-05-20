'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { href: string; label: string }[] = [
  { href: '/', label: 'Dash' },
  { href: '/positions', label: 'Open' },
  { href: '/history', label: 'History' },
  { href: '/markets', label: 'Markets' },
  { href: '/portfolio', label: 'Portfolio' },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 grid grid-cols-5 border-t border-zinc-800 bg-zinc-950">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`py-3 text-center text-xs ${
              active ? 'text-white' : 'text-zinc-400'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
