'use client';

import React, { useEffect } from 'react';
import { getWebSocket } from '@/lib/websocket';
import { useTradingStore } from '@/stores/trading-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAdminStore } from '@/stores/admin-store';
import { marketApi } from '@/lib/api';
import { MaintenanceGuard } from '@/components/layout/MaintenanceGuard';
import { AnnouncementBar, MaintenanceNoticeBar, CMSPopup } from '@/components/layout/CMSRenderer';

// ============================================
// App Providers
// Initializes WebSocket connection, auth session, and global state.
// Wraps the entire app in root layout.
// ============================================

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    // Restore auth session from httpOnly cookie
    useAuthStore.getState().restoreSession();

    // Fetch system flags for all users (public endpoint)
    marketApi.getFlags().then((res) => {
      const f = res.flags;
      const store = useAdminStore.getState();
      store.setSystemFlag('tradingEnabled', f.trading_enabled);
      store.setSystemFlag('newOrdersEnabled', f.new_orders_enabled);
      store.setSystemFlag('depositsEnabled', f.deposits_enabled);
      store.setSystemFlag('withdrawalsEnabled', f.withdrawals_enabled);
      store.setSystemFlag('maintenanceMode', f.maintenance_mode);
      store.setSystemFlag('registrationEnabled', f.registration_enabled);
    }).catch(() => {});

    const ws = getWebSocket();

    // Connect on mount
    ws.connect().catch((err) => {
      console.error('[Providers] WebSocket connection failed:', err);
    });

    // Detect mobile and set restriction flag
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768;
      useTradingStore.getState().setMobileTradeRestricted(isMobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      ws.disconnect();
    };
  }, []);

  return (
    <MaintenanceGuard>
      <AnnouncementBar />
      <MaintenanceNoticeBar />
      {children}
      <CMSPopup />
    </MaintenanceGuard>
  );
};
