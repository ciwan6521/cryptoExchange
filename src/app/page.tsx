import React from 'react';
import type { Metadata } from 'next';
import { LandingHero, LandingSections } from '@/components/landing/LandingContent';
import { Footer } from '@/components/layout';

// ============================================
// Landing Page (Server Component)
// SEO-critical shell rendered on the server.
// Interactive content imported as client components.
// ============================================

// Page-level metadata (supplements root layout)
export const metadata: Metadata = {
  title: 'Nexus Exchange — Trade Crypto with Confidence',
  description:
    'The next generation cryptocurrency exchange. Institutional-grade security, lightning-fast execution, deep liquidity, and 200+ cryptocurrencies. Start trading in under 5 minutes.',
  alternates: {
    canonical: 'https://nexus.exchange',
  },
  openGraph: {
    title: 'Nexus Exchange — Trade Crypto with Confidence',
    description:
      'Institutional-grade crypto trading. 200+ assets, bank-grade security, 24/7 support.',
    url: 'https://nexus.exchange',
    siteName: 'Nexus Exchange',
    type: 'website',
    images: [
      {
        url: 'https://nexus.exchange/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Nexus Exchange — Trade Crypto with Confidence',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexus Exchange — Trade Crypto with Confidence',
    description:
      'Institutional-grade crypto trading. 200+ assets, bank-grade security, 24/7 support.',
    images: ['https://nexus.exchange/og-image.png'],
  },
};

// JSON-LD structured data for search engines
function JsonLd() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Nexus Exchange',
    url: 'https://nexus.exchange',
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

      {/* Hero Section (client component — 3D + animations) */}
      <LandingHero />

      {/* Market Ticker, Features, Stats, CTA (client components) */}
      <LandingSections />

      {/* Footer (client component) */}
      <Footer />
    </div>
  );
}
