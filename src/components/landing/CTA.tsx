'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';

// ============================================
// CTA Section
// Final call-to-action before footer
// ============================================

export const CTA: React.FC = () => {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-500/5 to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-brand-500/10 rounded-full blur-[120px]" />
      </div>
      
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Badge */}
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-full mb-6">
            <span className="w-2 h-2 bg-brand-400 rounded-full animate-pulse" />
            Start trading in under 5 minutes
          </span>
          
          {/* Heading */}
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white mb-6">
            Ready to Start
            <br />
            <span className="text-gradient">Your Crypto Journey?</span>
          </h2>
          
          {/* Description */}
          <p className="text-lg text-gray-400 mb-8 max-w-2xl mx-auto">
            Join millions of traders worldwide. Create your account today and get
            access to 200+ cryptocurrencies with industry-leading security.
          </p>
          
          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link href="/auth/register">
              <Button size="lg" icon={<ArrowRight className="w-5 h-5" />} iconPosition="right">
                Get Started Free
              </Button>
            </Link>
            <Link href="/trade/BTC-USDT">
              <Button variant="secondary" size="lg" icon={<ChevronRight className="w-5 h-5" />} iconPosition="right">
                Explore Markets
              </Button>
            </Link>
          </div>
          
          {/* Trust indicators */}
          <p className="text-sm text-gray-500">
            No credit card required • Free demo account • Start trading instantly
          </p>
        </motion.div>
        
        {/* Decorative elements */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-16 relative"
        >
          {/* Trading interface preview */}
          <div className="relative mx-auto max-w-3xl">
            <div className="aspect-[16/9] rounded-2xl bg-surface-100 border border-glass-border overflow-hidden shadow-2xl">
              {/* Header bar */}
              <div className="h-8 bg-surface-200 border-b border-glass-border flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              
              {/* Content */}
              <div className="p-6 grid grid-cols-3 gap-4">
                {/* Chart placeholder */}
                <div className="col-span-2 h-48 bg-surface-200 rounded-lg flex items-center justify-center">
                  <div className="flex items-end gap-1 h-32">
                    {[65,42,78,35,88,52,71,40,83,57,46,90,38,74,60,85,44,68,50,76].map((h, i) => (
                      <div
                        key={i}
                        className="w-2 bg-brand-500/30 rounded-sm"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Orderbook placeholder */}
                <div className="h-48 bg-surface-200 rounded-lg p-3 space-y-1">
                  {[1.2340,0.8921,0.5467,1.7803,0.3215,1.1056,0.6789,1.4532].map((qty, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className={i < 4 ? 'text-loss' : 'text-profit'}>
                        {(97000 + (i - 4) * 10).toFixed(2)}
                      </span>
                      <span className="text-gray-500">
                        {qty.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Glow effect */}
            <div className="absolute -inset-4 bg-brand-500/10 rounded-3xl blur-xl -z-10" />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

