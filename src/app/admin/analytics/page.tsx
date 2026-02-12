'use client';

import React from 'react';
import { BarChart3, Clock } from 'lucide-react';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Analytics & Reporting
// Placeholder — will be wired when real trading
// data is available from the execution engine.
// ============================================

export default function AnalyticsPage() {
  return (
    <RequirePermission permission="canViewAnalytics">
      <div className="space-y-4">
        <div>
          <h1 className="text-base font-semibold text-white">Analytics & Reporting</h1>
          <p className="text-[11px] text-gray-600 mt-0.5">Trading volume, fee revenue, user activity, campaign ROI.</p>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-6 h-6 text-purple-400" />
          </div>
          <h2 className="text-sm font-semibold text-white mb-1">Not Yet Available</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Analytics will be populated once real trading data is available from the execution engine.
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-4 text-[10px] text-gray-600">
            <Clock className="w-3 h-3" />
            Pending: Execution engine + real trade data
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
