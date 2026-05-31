'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  LineChart,
  Wallet,
  Gift,
  Settings,
  Bell,
  User,
  Menu,
  ChevronDown,
  History,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { isEnabled } from '@/lib/feature-flags';

// ============================================
// Header Component
// Main navigation bar for the exchange
// ============================================

interface HeaderProps {
  onMenuClick?: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Trade', href: '/trade/BTC-USDT', icon: LineChart },
  ...(isEnabled('ENABLE_FUTURES') ? [{ name: 'Futures', href: '/futures', icon: LineChart }] : []),
  { name: 'Earn', href: '/earn', icon: TrendingUp },
  { name: 'T4PRO ICO', href: '/ico/t4pro', icon: Sparkles },
  { name: 'Wallet', href: '/wallet', icon: Wallet },
  { name: 'Rewards', href: '/rewards', icon: Gift },
];

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();
  
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-glass-border bg-surface-300/80 backdrop-blur-xl">
      <div className="h-full px-4 lg:px-6 flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center gap-6">
          {/* Mobile menu button */}
          <IconButton
            variant="ghost"
            className="lg:hidden"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </IconButton>
          
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/Crypto4pro.png"
              alt="Crypto4Pro Logo"
              width={140}
              height={40}
              className="object-contain"
              style={{ width: 'auto', height: '32px' }}
              priority
            />
          </Link>
          
          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = pathname.startsWith(item.href.split('/').slice(0, 2).join('/'));
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'relative px-4 py-2 rounded-lg text-sm font-medium',
                    'transition-colors duration-200',
                    isActive
                      ? 'text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="headerNav"
                      className="absolute inset-0 bg-white/10 rounded-lg"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </span>
                </Link>
              );
            })}
            
            {/* Markets dropdown */}
            <div className="relative group">
              <button className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 flex items-center gap-1 transition-colors">
                Markets
                <ChevronDown className="w-3 h-3" />
              </button>
              
              {/* Dropdown menu */}
              <div className="absolute top-full left-0 mt-1 w-48 py-2 bg-surface-200 border border-glass-border rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <Link
                  href="/markets/spot"
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  Spot
                </Link>
                <Link
                  href="/markets/options"
                  className="flex items-center justify-between px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  Options
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">Soon</span>
                </Link>
              </div>
            </div>
          </nav>
        </div>
        
        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="hidden md:block">
            <div className="relative">
              <input
                type="text"
                placeholder="Search markets..."
                className="w-48 h-9 pl-4 pr-8 text-sm bg-surface-100 border border-glass-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 bg-surface-50 px-1.5 py-0.5 rounded">
                /
              </kbd>
            </div>
          </div>
          
          {isAuthenticated ? (
            <>
              {/* Notifications */}
              <IconButton variant="ghost" aria-label="Notifications">
                <div className="relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-500 rounded-full" />
                </div>
              </IconButton>
              
              {/* User menu */}
              <div className="relative group">
                <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </button>
                
                {/* User dropdown */}
                <div className="absolute top-full right-0 mt-1 w-56 py-2 bg-surface-200 border border-glass-border rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="px-4 py-3 border-b border-glass-border">
                    <p className="text-sm font-medium text-white">{user?.email}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{user?.memberTier}</p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/settings"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    <Link
                      href="/wallet"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Wallet className="w-4 h-4" />
                      Wallet
                    </Link>
                    <Link
                      href="/ledger"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <History className="w-4 h-4" />
                      Ledger History
                    </Link>
                  </div>
                  <div className="border-t border-glass-border pt-1">
                    <button
                      onClick={() => {
                        logout();
                        router.push('/auth/login');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 ml-2">
              <Link href="/auth/login">
                <Button variant="ghost" size="sm">
                  Log In
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button variant="primary" size="sm">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

