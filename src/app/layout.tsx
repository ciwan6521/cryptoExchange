import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers/Providers';
import './globals.css';

// ============================================
// Root Layout
// Provides global styles, fonts, and metadata
// ============================================

// Primary sans font
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

// Mono font for code/numbers
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://crypto4pro.io'),
  title: {
    default: 'Crypto4Pro | Trade Crypto with Confidence',
    template: '%s | Crypto4Pro',
  },
  description:
    'The next generation cryptocurrency exchange. Trade BTC, ETH, and 200+ cryptocurrencies with industry-leading security and performance.',
  keywords: [
    'crypto exchange',
    'bitcoin trading',
    'ethereum',
    'cryptocurrency',
    'defi',
    'trading platform',
  ],
  authors: [{ name: 'Crypto4Pro' }],
  creator: 'Crypto4Pro',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://crypto4pro.io',
    siteName: 'Crypto4Pro',
    title: 'Crypto4Pro | Trade Crypto with Confidence',
    description:
      'The next generation cryptocurrency exchange. Trade BTC, ETH, and 200+ cryptocurrencies.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Crypto4Pro',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crypto4Pro | Trade Crypto with Confidence',
    description: 'The next generation cryptocurrency exchange.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0a0b0c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-surface-500 text-gray-200 antialiased" suppressHydrationWarning>
        {/* Skip to main content for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-brand-500 focus:text-white focus:rounded-lg"
        >
          Skip to main content
        </a>
        
        {/* Main application — Providers initializes WS + global store */}
        <Providers>{children}</Providers>
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(17, 19, 23, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: '#e5e7eb',
              backdropFilter: 'blur(12px)',
            },
          }}
          richColors
          closeButton
        />
        
        {/* Performance hint - preconnect to API */}
        <link rel="preconnect" href="https://api.crypto4pro.io" />
      </body>
    </html>
  );
}

