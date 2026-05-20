import './globals.css';
import type { Metadata, Viewport } from 'next';
import BottomNav from '@/components/BottomNav';
import TopBar from '@/components/TopBar';
import Footer from '@/components/Footer';

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
        <main className="pb-24">{children}</main>
        <div className="fixed bottom-12 left-0 right-0 z-0 border-t border-zinc-900 bg-zinc-950">
          <Footer />
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
