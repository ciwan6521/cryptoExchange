'use client';

import React, { useEffect } from 'react';
import { getWebSocket } from '@/lib/websocket';
import { useTradingStore } from '@/stores/trading-store';
import { useAuthStore } from '@/stores/auth-store';
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
