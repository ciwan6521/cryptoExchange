'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Zap,
  LineChart,
  Wallet,
  Globe,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Features Section
// Highlights key platform capabilities
// ============================================

const features = [
  {
    icon: Shield,
    title: 'Bank-Grade Security',
    description:
      'Multi-signature wallets, cold storage, and 24/7 security monitoring protect your assets.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description:
      'Execute trades in milliseconds with our high-performance matching engine.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: LineChart,
    title: 'Advanced Trading',
    description:
      'Professional tools including limit orders, stop-loss, and margin trading up to 100x.',
    color: 'from-blue-500 to-indigo-500',
  },
  {
    icon: Wallet,
    title: 'Deep Liquidity',
    description:
      'Access to global liquidity pools ensures tight spreads and minimal slippage.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Globe,
    title: 'Global Access',
    description:
      'Trade from anywhere with support for 50+ fiat currencies and 200+ cryptocurrencies.',
    color: 'from-cyan-500 to-blue-500',
  },
  {
    icon: Lock,
    title: 'Full Compliance',
    description:
      'Regulated and compliant with global financial standards and AML requirements.',
    color: 'from-rose-500 to-red-500',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export const Features: React.FC = () => {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-0 w-96 h-96 bg-brand-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px]" />
      </div>
      
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 text-sm font-medium text-brand-400 bg-brand-500/10 rounded-full mb-4">
            Why Crypto4Pro
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white mb-4">
            Built for Serious Traders
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Everything you need to trade with confidence. From security to speed,
            we&apos;ve got you covered.
          </p>
        </motion.div>
        
        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className={cn(
                'group p-6 rounded-2xl',
                'bg-surface-100/50 border border-glass-border',
                'hover:bg-surface-100 hover:border-glass-hover',
                'transition-all duration-300'
              )}
            >
              {/* Icon */}
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                  'bg-gradient-to-br',
                  feature.color,
                  'opacity-90 group-hover:opacity-100 transition-opacity'
                )}
              >
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              
              {/* Content */}
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

