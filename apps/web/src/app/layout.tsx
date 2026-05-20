import './globals.css';
import type { Metadata, Viewport } from 'next';
import BottomNav from '@/components/BottomNav';
import TopBar from '@/components/TopBar';

export const metadata: Metadata = {
  title: 'polymarket weather',
  description: 'live weather markets · edge detection · paper trades',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0d10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <TopBar />
        <main className="pb-16">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
