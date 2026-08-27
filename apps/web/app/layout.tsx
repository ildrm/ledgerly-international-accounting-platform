import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ledgerly — International Accounting',
  description: 'Secure, multilingual accounting for modern organizations.',
  openGraph: {
    title: 'Ledgerly — International Accounting',
    description: 'Secure, multilingual accounting for modern organizations.',
    type: 'website',
    images: [{ url: '/og-ledgerly.png', width: 1200, height: 630, alt: 'A balanced global ledger represented in emerald light' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ledgerly — International Accounting',
    description: 'Secure, multilingual accounting for modern organizations.',
    images: ['/og-ledgerly.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-US" dir="ltr" suppressHydrationWarning><body>{children}</body></html>;
}
