import type { Metadata, Viewport } from 'next';
import { Nunito, Noto_Sans_KR } from 'next/font/google';
import AppShell from '@/components/AppShell';
import './globals.css';
import './extra.css';

const ui = Nunito({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['600', '700', '800', '900'], variable: '--font-ui', display: 'swap' });
const kr = Noto_Sans_KR({ weight: ['500', '700', '900'], variable: '--font-kr', display: 'swap', preload: false });

const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'Christine — корейский алфавит в игре',
  description: 'Выучи корейский алфавит за неделю: уроки-игры, аудирование, мини-игры, сцены из дорам и рейтинг.',
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/icons/icon.svg`, apple: `${base}/icons/icon-192.png` },
  appleWebApp: { capable: true, title: 'Christine', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fff8f1' },
    { media: '(prefers-color-scheme: dark)', color: '#15111d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${ui.variable} ${kr.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
