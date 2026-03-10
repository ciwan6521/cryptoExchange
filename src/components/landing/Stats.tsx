'use client';

import React from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { formatNumber } from '@/lib/utils';

// ============================================
// Stats Section
// Key metrics and social proof
// ============================================

const stats = [
  {
    value: 5.2,
    suffix: 'M+',
    label: 'Active Traders',
    description: 'Trust Crypto4Pro for their trading needs',
  },
  {
    value: 128,
    suffix: 'B+',
    label: '24h Volume',
    prefix: '$',
    description: 'Daily trading volume across all markets',
  },
  {
    value: 200,
    suffix: '+',
    label: 'Cryptocurrencies',
    description: 'Available for spot and futures trading',
  },
  {
    value: 99.99,
    suffix: '%',
    label: 'Uptime',
    description: 'Platform availability guarantee',
  },
];

function AnimatedStat({
  value,
  prefix = '',
  suffix = '',
  label,
  description,
  delay = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  description: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [displayValue, setDisplayValue] = React.useState(0);
  
  React.useEffect(() => {
    if (!isInView) return;
    
    const duration = 2000; // 2 seconds
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime - delay * 1000;
      
      if (elapsed < 0) {
        requestAnimationFrame(animate);
        return;
      }
      
      const progress = Math.min(elapsed / duration, 1);
      // Ease out expo
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      setDisplayValue(value * easeProgress);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [isInView, value, delay]);
  
  const formattedValue = value >= 100
    ? Math.round(displayValue)
    : displayValue.toFixed(2);
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay }}
      className="text-center"
    >
      <div className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white mb-2 tabular-nums">
        {prefix}
        {formattedValue}
        {suffix}
      </div>
      <div className="text-lg font-semibold text-brand-400 mb-1">{label}</div>
      <p className="text-sm text-gray-500">{description}</p>
    </motion.div>
  );
}

export const Stats: React.FC = () => {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-surface-300/30">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            Trusted by Millions Worldwide
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Join the fastest-growing crypto exchange and start trading today.
          </p>
        </motion.div>
        
        {/* Stats grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <AnimatedStat
              key={stat.label}
              value={stat.value}
              prefix={stat.prefix}
              suffix={stat.suffix}
              label={stat.label}
              description={stat.description}
              delay={index * 0.1}
            />
          ))}
        </div>
        
        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 pt-16 border-t border-glass-border"
        >
          <p className="text-center text-sm text-gray-500 mb-6">
            Backed by industry leaders and regulated worldwide
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-50">
            {['SEC Registered', 'SOC 2 Type II', 'ISO 27001', 'GDPR Compliant'].map(
              (badge) => (
                <div
                  key={badge}
                  className="px-4 py-2 border border-glass-border rounded-lg text-sm text-gray-400"
                >
                  {badge}
                </div>
              )
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

