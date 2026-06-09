'use client';

import React from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { marketApi } from '@/lib/api';

// ============================================
// Stats Section
// Key metrics and social proof
// ============================================

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
    
    const duration = 2000;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime - delay * 1000;
      
      if (elapsed < 0) {
        requestAnimationFrame(animate);
        return;
      }
      
      const progress = Math.min(elapsed / duration, 1);
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
  const [pairCount, setPairCount] = React.useState(0);
  const [makerFeePercent, setMakerFeePercent] = React.useState(0.1);

  React.useEffect(() => {
    marketApi.getPairs()
      .then((res) => {
        const enabled = res.pairs.filter((p) => p.is_enabled);
        const list = enabled.length > 0 ? enabled : res.pairs;
        setPairCount(list.length);
        if (list.length > 0) {
          setMakerFeePercent(parseFloat(list[0].maker_fee) * 100);
        }
      })
      .catch(() => {
        setPairCount(0);
      });
  }, []);

  const stats = [
    {
      value: pairCount || 0,
      suffix: pairCount > 0 ? '' : '+',
      label: 'Trading Pairs',
      description: 'Top cryptocurrencies available for trading',
    },
    {
      value: makerFeePercent,
      suffix: '%',
      label: 'Trading Fees',
      description: 'Industry-low fees for makers and takers',
    },
    {
      value: 24,
      suffix: '/7',
      label: 'Live Markets',
      description: 'Non-stop trading around the clock',
    },
    {
      value: 99.99,
      suffix: '%',
      label: 'Uptime',
      description: 'Platform availability guarantee',
    },
  ];

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-surface-300/30">
      <div className="max-w-7xl mx-auto">
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
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, index) => (
            <AnimatedStat
              key={stat.label}
              value={stat.value}
              suffix={stat.suffix}
              label={stat.label}
              description={stat.description}
              delay={index * 0.1}
            />
          ))}
        </div>
        
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 pt-16 border-t border-glass-border"
        >
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-50">
            {['SSL Encrypted', 'Cold Storage', '2FA Secured', 'Real-time Monitoring'].map(
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
