'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Twitter, MessageCircle, Mail, Instagram } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionDot } from '@/components/trading/ConnectionStatus';
import { isEnabled } from '@/lib/feature-flags';
import { t4proIco } from '@/lib/t4pro-ico';

// ============================================
// Footer Component
// Site footer with links and social
// ============================================

const footerLinks = {
  products: [
    { name: 'Spot Trading', href: '/trade/BTC-USDT' },
    ...(isEnabled('ENABLE_FUTURES') ? [{ name: 'Futures', href: '/futures' }] : []),
    { name: 'Convert', href: '/convert' },
    { name: 'P2P', href: '/p2p' },
    { name: 'Staking', href: '/earn' },
    { name: 'T4PRO ICO', href: '/ico/t4pro' },
    { name: 'Markets', href: '/markets/spot' },
  ],
  company: [
    { name: 'About', href: '/' },
    { name: 'FAQ', href: '/#faq' },
  ],
  support: [
    { name: 'Help Center', href: '/help' },
    { name: 'Contact', href: 'mailto:support@crypto4pro.io' },
    { name: 'Status', href: '/status' },
  ],
  legal: [
    { name: 'Terms of Service', href: '/legal/terms' },
    { name: 'Privacy Policy', href: '/legal/privacy' },
    { name: 'Fee Schedule', href: '/fees' },
  ],
};

const socialLinks = [
  { name: 'Twitter', href: t4proIco.social.twitter, icon: Twitter },
  { name: 'Telegram', href: t4proIco.social.telegram, icon: MessageCircle },
  { name: 'Instagram', href: t4proIco.social.instagram, icon: Instagram },
  { name: 'Email', href: 'mailto:support@crypto4pro.io', icon: Mail },
];

interface FooterProps {
  variant?: 'full' | 'minimal';
}

export const Footer: React.FC<FooterProps> = ({ variant = 'full' }) => {
  if (variant === 'minimal') {
    return (
      <footer className="py-6 px-4 border-t border-glass-border">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Crypto4Pro. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-300 transition-colors"
                aria-label={link.name}
              >
                <link.icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>
      </footer>
    );
  }
  
  return (
    <footer className="border-t border-glass-border bg-surface-300/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer content */}
        <div className="py-12 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1 mb-6 lg:mb-0">
            <div className="mb-4">
              <Image
                src="/Crypto4pro.png"
                alt="Crypto4Pro Logo"
                width={140}
                height={40}
                className="object-contain"
                style={{ width: 'auto', height: '32px' }}
              />
            </div>
            <p className="text-sm text-gray-400 mb-6 max-w-xs">
              The next generation cryptocurrency exchange. Trade with confidence.
            </p>
            {/* Social links */}
            <div className="flex items-center gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center',
                    'bg-surface-100 border border-glass-border',
                    'text-gray-400 hover:text-white hover:border-glass-hover',
                    'transition-colors duration-200'
                  )}
                  aria-label={link.name}
                >
                  <link.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>
          
          {/* Link columns */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Products</h3>
            <ul className="space-y-3">
              {footerLinks.products.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Support</h3>
            <ul className="space-y-3">
              {footerLinks.support.map((link) => (
                <li key={link.name}>
                  {link.href.startsWith('mailto:') ? (
                    <a
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Bottom bar */}
        <div className="py-6 border-t border-glass-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Crypto4Pro. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <ConnectionDot className="text-sm" />
          </div>
        </div>
      </div>
    </footer>
  );
};

