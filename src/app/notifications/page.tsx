'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bell, Settings, AlertCircle, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Card, CardHeader, Button, Badge } from '@/components/ui';
import { alertsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { formatNumber } from '@/lib/utils';

type PriceAlert = {
  id: string;
  asset: string;
  condition: string;
  target_price: string;
  is_active: boolean;
};

export default function NotificationsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await alertsApi.list();
      setAlerts(res.alerts || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load notifications';
      setError(message);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="py-6 flex items-center justify-between gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3 mb-1">
                <Bell className="w-6 h-6 text-brand-400" />
                <h1 className="text-2xl font-display font-bold text-white">Notifications</h1>
              </div>
              <p className="text-gray-400 text-sm">Price alerts and trading notifications</p>
            </motion.div>
            <Link href="/settings">
              <Button variant="secondary" size="sm" icon={<Settings className="w-4 h-4" />}>
                Alert Settings
              </Button>
            </Link>
          </div>

          <Card padding="none">
            <CardHeader
              title="Price Alerts"
              subtitle={`${alerts.length} active alert${alerts.length !== 1 ? 's' : ''}`}
              className="px-4 pt-4"
            />

            {!isAuthenticated ? (
              <div className="px-4 py-12 text-center">
                <Bell className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 mb-4">Sign in to view your notifications</p>
                <Link href="/auth/login">
                  <Button size="sm">Log In</Button>
                </Link>
              </div>
            ) : error ? (
              <div className="px-4 py-12 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={loadAlerts}
                  className="text-sm text-brand-400 hover:text-brand-300 underline"
                >
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 mb-1">No notifications yet</p>
                <p className="text-sm text-gray-500 mb-4">
                  Create price alerts in settings to get notified when markets move.
                </p>
                <Link href="/settings">
                  <Button variant="secondary" size="sm" icon={<Settings className="w-4 h-4" />}>
                    Manage Alerts
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-glass-border">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="px-4 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {alert.condition === 'above' ? (
                        <TrendingUp className="w-5 h-5 text-profit shrink-0" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-loss shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {alert.asset}/USDT {alert.condition === 'above' ? 'above' : 'below'}{' '}
                          ${formatNumber(parseFloat(alert.target_price), { decimals: 2 })}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">Price alert</p>
                      </div>
                    </div>
                    <Badge variant={alert.is_active ? 'success' : 'default'}>
                      {alert.is_active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
