'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const faqs = [
  {
    q: 'How do I create an account?',
    a: 'Click "Start Trading Now" and fill in your email, username, and a strong password. After registration, verify your email to unlock all features.',
  },
  {
    q: 'What cryptocurrencies can I trade?',
    a: 'We support over 100 of the most popular cryptocurrencies paired with USDT, including BTC, ETH, BNB, SOL, XRP, ADA, and many more. Our list is updated dynamically from market data.',
  },
  {
    q: 'What are the trading fees?',
    a: 'We offer competitive fees starting at 0.1% for both makers and takers. Higher-volume traders can qualify for reduced fees through our tiered fee schedule.',
  },
  {
    q: 'How do I secure my account?',
    a: 'We strongly recommend enabling Two-Factor Authentication (2FA) via an authenticator app. You can set this up in Settings > Security after logging in.',
  },
  {
    q: 'How do deposits and withdrawals work?',
    a: 'You can deposit and withdraw supported cryptocurrencies to and from your exchange wallet. Each withdrawal goes through a security review process to protect your funds.',
  },
  {
    q: 'Is my data safe?',
    a: 'Absolutely. We use bank-grade SSL encryption, secure httpOnly cookies for authentication, and never store sensitive data in the browser. All passwords are hashed with bcrypt.',
  },
];

function FAQItem({ q, a, isOpen, onClick }: { q: string; a: string; isOpen: boolean; onClick: () => void }) {
  return (
    <div className="border border-glass-border rounded-xl overflow-hidden">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="font-medium text-white pr-4">{q}</span>
        <ChevronDown className={cn('w-5 h-5 text-gray-400 flex-shrink-0 transition-transform', isOpen && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-5 pb-5 text-sm text-gray-400 leading-relaxed">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-gray-400">
            Everything you need to know about Crypto4Pro
          </p>
        </motion.div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <FAQItem
                q={faq.q}
                a={faq.a}
                isOpen={openIndex === i}
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
