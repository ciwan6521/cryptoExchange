'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';
import { Features, MarketTicker, Stats, CTA, FAQ } from '@/components/landing';
import { Button, Skeleton } from '@/components/ui';
import { isEnabled } from '@/lib/feature-flags';

// ============================================
// Landing Page Client Content
// Interactive parts extracted from page.tsx
// so the page itself can be a server component.
// ============================================

// Lazy load Three.js hero for performance — gated by feature flag
const Hero3D = dynamic(
  () => import('@/components/landing/Hero3D').then(mod => mod.Hero3D),
  {
    ssr: false,
    loading: () => <HeroFallback />,
  }
);

function HeroFallback() {
  return (
    <div className="absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-gradient-to-b from-surface-400 via-surface-500 to-surface-500" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/10 blur-[100px]" />
    </div>
  );
}

export function LandingHero() {
  const show3D = isEnabled('ENABLE_3D_HERO');

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      {/* 3D Background — feature-flagged */}
      {show3D ? (
        <Suspense fallback={<HeroFallback />}>
          <Hero3D />
        </Suspense>
      ) : (
        <HeroFallback />
      )}

      {/* Top Center Logo */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-center py-5">
        <Link href="/">
          <Image
            src="/Crypto4pro.png"
            alt="Crypto4Pro Logo"
            width={180}
            height={50}
            className="object-contain"
            style={{ width: 'auto', height: '60px' }}
            priority
          />
        </Link>
      </div>

      {/* Hero Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
              </span>
              New: Futures trading now live with up to 100x leverage
            </span>
          </motion.div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold text-white mb-6 tracking-tight">
            Trade Crypto with
            <br />
            <span className="text-gradient">Confidence</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            The next generation cryptocurrency exchange. Institutional-grade
            security, lightning-fast execution, and the deepest liquidity.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link href="/auth/register">
              <Button
                size="lg"
                icon={<ArrowRight className="w-5 h-5" />}
                iconPosition="right"
                className="shadow-lg shadow-brand-500/25"
              >
                Start Trading Now
              </Button>
            </Link>
            <Button
              variant="secondary"
              size="lg"
              icon={<Play className="w-4 h-4" />}
            >
              Watch Demo
            </Button>
          </div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500"
          >
            {['Bank-grade security', 'No hidden fees', '24/7 Support'].map((text) => (
              <span key={text} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {text}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-6 h-10 rounded-full border-2 border-gray-600 flex items-start justify-center p-2"
          >
            <motion.div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export function LandingSections() {
  return (
    <>
      <MarketTicker />
      <Features />
      <Stats />
      <FAQ />
      <CTA />
    </>
  );
}
