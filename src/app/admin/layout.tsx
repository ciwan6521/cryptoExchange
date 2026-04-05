'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Wallet,
  ArrowLeftRight,
  Settings,
  Shield,
  FileText,
  BarChart3,
  Megaphone,
  ScanFace,
  Flag,
  ScrollText,
  LogOut,
  ChevronLeft,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore, type AdminPermissions } from '@/stores/admin-store';

// ============================================
// Admin Layout
// Auth-guarded shell with dense sidebar navigation.
// Redirects to /admin/login if not authenticated.
// ============================================

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  permission?: keyof AdminPermissions;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Operations',
    items: [
      { name: 'Users', href: '/admin/users', icon: Users, permission: 'canManageUsers' },
      { name: 'KYC Requests', href: '/admin/kyc', icon: ScanFace, permission: 'canManageUsers' },
      { name: 'Balances', href: '/admin/balances', icon: Wallet, permission: 'canManageBalances' },
      { name: 'Orders & Trades', href: '/admin/orders', icon: ArrowLeftRight, permission: 'canManageOrders' },
      { name: 'Wallets', href: '/admin/wallets', icon: CreditCard, permission: 'canManageWallets' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { name: 'Markets', href: '/admin/markets', icon: BarChart3, permission: 'canManageMarkets' },
      { name: 'System Flags', href: '/admin/flags', icon: Flag, permission: 'canManageFlags' },
      { name: 'Campaigns', href: '/admin/campaigns', icon: Megaphone, permission: 'canManageCampaigns' },
      { name: 'CMS', href: '/admin/cms', icon: FileText, permission: 'canManageCMS' },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { name: 'Audit Logs', href: '/admin/logs', icon: ScrollText, permission: 'canViewLogs' },
      { name: 'Analytics', href: '/admin/analytics', icon: BarChart3, permission: 'canViewAnalytics' },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  operator: 'Operator',
  finance: 'Finance',
  readonly: 'Read-only',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'text-red-400 bg-red-500/10',
  operator: 'text-amber-400 bg-amber-500/10',
  finance: 'text-blue-400 bg-blue-500/10',
  readonly: 'text-gray-400 bg-gray-500/10',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    isAdminAuthenticated,
    adminUser,
    isSessionValid,
    adminLogout,
    getPermissions,
  } = useAdminStore();

  const isLoginPage = pathname === '/admin/login';

  // Auth guard — redirect to login if not authenticated or session expired
  useEffect(() => {
    if (isLoginPage) return;
    if (!isAdminAuthenticated || !isSessionValid()) {
      adminLogout();
      router.replace('/admin/login');
    }
  }, [isAdminAuthenticated, isLoginPage, isSessionValid, adminLogout, router]);

  // Login page renders without shell
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Don't render shell until auth is confirmed
  if (!isAdminAuthenticated || !adminUser) {
    return null;
  }

  const permissions = getPermissions();

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-60 bg-[#0f0f18] border-r border-white/[0.06] flex flex-col z-40">
        {/* Logo */}
        <div className="h-12 px-4 flex items-center gap-2 border-b border-white/[0.06] shrink-0">
          <div className="w-6 h-6 rounded bg-red-500/80 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Crypto4Pro Admin</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.permission || permissions[item.permission]
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title}>
                <p className="px-2 mb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive =
                      item.href === '/admin'
                        ? pathname === '/admin'
                        : pathname.startsWith(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                          isActive
                            ? 'bg-white/[0.08] text-white'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                        )}
                      >
                        <item.icon className="w-3.5 h-3.5 shrink-0" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Admin info + logout */}
        <div className="p-3 border-t border-white/[0.06] shrink-0">
          <div className="mb-2">
            <p className="text-xs font-medium text-white truncate">{adminUser.name}</p>
            <p className="text-[10px] text-gray-600 truncate">{adminUser.email}</p>
            <span className={cn('inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium', ROLE_COLORS[adminUser.role])}>
              {ROLE_LABELS[adminUser.role]}
            </span>
          </div>
          <div className="flex gap-1">
            <Link
              href="/"
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
              Main App
            </Link>
            <button
              onClick={async () => {
                try { await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
                adminLogout();
                router.push('/admin/login');
              }}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-3 h-3" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 flex-1 min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-10 bg-[#0a0a0f]/90 backdrop-blur border-b border-white/[0.06] flex items-center px-4">
          <p className="text-[11px] text-gray-600">
            {pathname.replace('/admin', 'Admin').replace(/\//g, ' / ').replace(/^/, '')}
          </p>
        </header>

        <div className="p-4">
          {children}
        </div>
      </main>
    </div>
  );
}
