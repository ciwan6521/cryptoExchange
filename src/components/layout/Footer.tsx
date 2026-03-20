'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Twitter, Github, MessageCircle, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConnectionDot } from '@/components/trading/ConnectionStatus';

// ============================================
// Footer Component
// Site footer with links and social
// ============================================

const footerLinks = {
  products: [
    { name: 'Spot Trading', href: '/trade' },
    { name: 'Futures', href: '/futures' },
    { name: 'Staking', href: '/earn' },
    { name: 'API', href: '/docs/api' },
  ],
  company: [
    { name: 'About', href: '/about' },
    { name: 'Careers', href: '/careers' },
    { name: 'Press', href: '/press' },
    { name: 'Blog', href: '/blog' },
  ],
  support: [
    { name: 'Help Center', href: '/help' },
    { name: 'Contact', href: '/contact' },
    { name: 'Status', href: '/status' },
    { name: 'Bug Bounty', href: '/security' },
  ],
  legal: [
    { name: 'Terms of Service', href: '/terms' },
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Cookies', href: '/cookies' },
    { name: 'Licenses', href: '/licenses' },
  ],
};

const socialLinks = [
  { name: 'Twitter', href: 'https://twitter.com', icon: Twitter },
  { name: 'GitHub', href: 'https://github.com', icon: Github },
  { name: 'Discord', href: 'https://discord.com', icon: MessageCircle },
  { name: 'Email', href: 'mailto:support@crypto4.io', icon: Mail },
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
            <div className="flex items-center gap-2 mb-4">
              <Image
                src="/Crypto4pro.png"
                alt="Crypto4Pro Logo"
                width={150}
                height={42}
                className="object-contain"
                style={{ width: 'auto', height: '30px' }}
                priority
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

