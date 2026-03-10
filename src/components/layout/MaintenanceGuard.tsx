'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { useAdminStore } from '@/stores/admin-store';

// ============================================
// Maintenance Guard
// Shows a full-page maintenance overlay on all
// user-facing pages when maintenanceMode is ON.
// Admin routes (/admin/*) are excluded.
// ============================================

export const MaintenanceGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const maintenanceMode = useAdminStore((s) => s.systemFlags.maintenanceMode);
  const pathname = usePathname();

  // Never block admin panel
  if (pathname.startsWith('/admin')) {
    return <>{children}</>;
  }

  if (maintenanceMode) {
    return (
      <>
        {children}
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-500/95 backdrop-blur-md">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
              <Wrench className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-2xl font-display font-bold text-white mb-3">
              Under Maintenance
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Crypto4Pro is currently undergoing scheduled maintenance.
              We&apos;ll be back shortly. Thank you for your patience.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Maintenance in progress
            </div>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
};
