import React from 'react';
import type { Metadata } from 'next';
import { LandingHero, LandingSections } from '@/components/landing/LandingContent';
import { Header, Footer } from '@/components/layout';

// ============================================
// Landing Page (Server Component)
// SEO-critical shell rendered on the server.
// Interactive content imported as client components.
// ============================================

// Page-level metadata (supplements root layout)
export const metadata: Metadata = {
  title: 'Crypto4Pro — Trade Crypto with Confidence',
  description:
    'The next generation cryptocurrency exchange. Institutional-grade security, lightning-fast execution, and spot + futures trading on major USDT pairs.',
  alternates: {
    canonical: 'https://crypto4pro.io',
  },
  openGraph: {
    title: 'Crypto4Pro — Trade Crypto with Confidence',
    description:
      'Institutional-grade crypto trading. Spot, futures, earn & more — bank-grade security, 24/7 markets.',
    url: 'https://crypto4pro.io',
    siteName: 'Crypto4Pro',
    type: 'website',
    images: [
      {
        url: 'https://crypto4pro.io/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Crypto4Pro — Trade Crypto with Confidence',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crypto4Pro — Trade Crypto with Confidence',
    description:
      'Institutional-grade crypto trading. Spot, futures, earn & more — bank-grade security, 24/7 markets.',
    images: ['https://crypto4pro.io/og-image.png'],
  },
};

// JSON-LD structured data for search engines
function JsonLd() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Crypto4Pro',
    url: 'https://crypto4pro.io',
    description:
      'The next generation cryptocurrency exchange with institutional-grade security and deep liquidity.',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free to create an account and start trading',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-500">
      <JsonLd />

      <Header />

      {/* Hero Section (client component — 3D + animations) */}
      <LandingHero />

      {/* Market Ticker, Features, Stats, CTA (client components) */}
      <LandingSections />

      {/* Footer (client component) */}
      <Footer />
    </div>
  );
}
