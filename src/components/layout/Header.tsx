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
  ArrowDownUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { isEnabled } from '@/lib/feature-flags';
import { LanguageSwitcher, useI18n } from '@/lib/i18n';

// ============================================
// Header Component
// Main navigation bar for the exchange
// ============================================

interface HeaderProps {
  onMenuClick?: () => void;
}

function buildNavigation(t: (key: string) => string) {
  return [
    { name: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { name: t('nav.trade'), href: '/trade/BTC-USDT', icon: LineChart },
    ...(isEnabled('ENABLE_FUTURES') ? [{ name: t('nav.futures'), href: '/futures', icon: LineChart }] : []),
    { name: t('nav.convert'), href: '/convert', icon: ArrowDownUp },
    { name: t('nav.p2p'), href: '/p2p', icon: Users },
    { name: t('nav.earn'), href: '/earn', icon: TrendingUp },
    { name: t('nav.ico'), href: '/ico/t4pro', icon: Sparkles },
    { name: t('nav.wallet'), href: '/wallet', icon: Wallet },
    { name: t('nav.rewards'), href: '/rewards', icon: Gift },
  ];
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigation = buildNavigation(t);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [marketsOpen, setMarketsOpen] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const marketsRef = React.useRef<HTMLDivElement>(null);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (marketsRef.current && !marketsRef.current.contains(event.target as Node)) {
        setMarketsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
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
          <Link href={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-2">
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
            <div className="relative" ref={marketsRef}>
              <button
                type="button"
                onClick={() => setMarketsOpen((v) => !v)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors',
                  marketsOpen
                    ? 'text-white bg-white/10'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5',
                )}
              >
                {t('nav.markets')}
                <ChevronDown className={cn('w-3 h-3 transition-transform', marketsOpen && 'rotate-180')} />
              </button>

              {marketsOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 py-2 bg-surface-200 border border-glass-border rounded-xl shadow-xl">
                <Link
                  href="/markets/spot"
                  onClick={() => setMarketsOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  {t('nav.spot')}
                </Link>
                <Link
                  href="/markets/options"
                  onClick={() => setMarketsOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                >
                  {t('nav.options')}
                </Link>
              </div>
              )}
            </div>
          </nav>
        </div>
        
        {/* Right section */}
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:flex" />

          {/* Search */}
          <div className="hidden md:block">
            <div className="relative">
              <input
                type="text"
                placeholder={t('nav.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    router.push(`/markets/spot?q=${encodeURIComponent(searchQuery.trim())}`);
                  }
                }}
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
              <IconButton
                variant="ghost"
                aria-label="Notifications"
                onClick={() => router.push('/notifications')}
              >
                <div className="relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-500 rounded-full" />
                </div>
              </IconButton>
              
              {/* User menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', userMenuOpen && 'rotate-180')} />
                </button>

                {userMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-56 py-2 bg-surface-200 border border-glass-border rounded-xl shadow-xl">
                  <div className="px-4 py-3 border-b border-glass-border">
                    <p className="text-sm font-medium text-white">{user?.email}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{user?.memberTier}</p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      {t('nav.settings')}
                    </Link>
                    <Link
                      href="/wallet"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Wallet className="w-4 h-4" />
                      {t('nav.wallet')}
                    </Link>
                    <Link
                      href="/ledger"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <History className="w-4 h-4" />
                      {t('nav.ledger')}
                    </Link>
                  </div>
                  <div className="border-t border-glass-border pt-1">
                    <button
                      onClick={() => {
                        logout();
                        setUserMenuOpen(false);
                        router.push('/auth/login');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      {t('nav.signOut')}
                    </button>
                  </div>
                </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 ml-2">
              <Link href="/auth/login">
                <Button variant="ghost" size="sm">
                  {t('nav.login')}
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button variant="primary" size="sm">
                  {t('nav.signup')}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

