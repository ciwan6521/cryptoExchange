'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  LayoutDashboard,
  LineChart,
  Wallet,
  Settings,
  HelpCircle,
  FileText,
  Shield,
  TrendingUp,
  Gift,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

// ============================================
// Sidebar Component
// Mobile navigation drawer
// ============================================

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const mainNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Trade', href: '/trade/BTC-USDT', icon: LineChart },
  { name: 'Wallet', href: '/wallet', icon: Wallet },
  { name: 'Earn', href: '/earn', icon: TrendingUp },
  { name: 'Rewards', href: '/rewards', icon: Gift },
  { name: 'Ledger', href: '/ledger', icon: History },
];

const secondaryNavigation = [
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Markets', href: '/markets/spot', icon: TrendingUp },
];

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
          
          {/* Sidebar panel */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-y-0 left-0 z-50 w-72 bg-surface-200 border-r border-glass-border lg:hidden"
          >
            {/* Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-glass-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">N</span>
                </div>
                <span className="text-xl font-display font-bold text-white">
                  Nexus
                </span>
              </div>
              <IconButton variant="ghost" onClick={onClose} aria-label="Close menu">
                <X className="w-5 h-5" />
              </IconButton>
            </div>
            
            {/* Navigation */}
            <nav className="p-4 space-y-6 overflow-y-auto h-[calc(100vh-4rem)]">
              {/* Main navigation */}
              <div>
                <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Main
                </p>
                <div className="space-y-1">
                  {mainNavigation.map((item) => {
                    const isActive = pathname.startsWith(item.href.split('/').slice(0, 2).join('/'));
                    
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                          'transition-colors duration-200',
                          isActive
                            ? 'bg-brand-500/10 text-brand-400'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        )}
                      >
                        <item.icon className="w-5 h-5" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
              
              {/* Secondary navigation */}
              <div>
                <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Account
                </p>
                <div className="space-y-1">
                  {secondaryNavigation.map((item) => {
                    const isActive = pathname === item.href;
                    
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                          'transition-colors duration-200',
                          isActive
                            ? 'bg-brand-500/10 text-brand-400'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        )}
                      >
                        <item.icon className="w-5 h-5" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
              
              {/* Sign Out */}
              <div className="pt-2 border-t border-glass-border">
                <button
                  onClick={() => {
                    logout();
                    onClose();
                    router.push('/auth/login');
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 w-full transition-colors"
                >
                  <X className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

// Desktop sidebar (for dashboard pages)
export const DesktopSidebar: React.FC = () => {
  const pathname = usePathname();
  
  return (
    <aside className="hidden lg:block fixed left-0 top-16 bottom-0 w-64 bg-surface-200/50 border-r border-glass-border">
      <nav className="p-4 space-y-6 overflow-y-auto h-full">
        {/* Main navigation */}
        <div>
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Main
          </p>
          <div className="space-y-1">
            {mainNavigation.map((item) => {
              const isActive = pathname.startsWith(item.href.split('/').slice(0, 2).join('/'));
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                    'transition-colors duration-200',
                    isActive
                      ? 'bg-brand-500/10 text-brand-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
        
        {/* Secondary navigation */}
        <div>
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Account
          </p>
          <div className="space-y-1">
            {secondaryNavigation.map((item) => {
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                    'transition-colors duration-200',
                    isActive
                      ? 'bg-brand-500/10 text-brand-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </aside>
  );
};

