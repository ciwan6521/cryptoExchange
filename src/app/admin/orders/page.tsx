'use client';

import React from 'react';
import { ArrowLeftRight, Clock } from 'lucide-react';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Order & Trade Management
// Placeholder — will be wired when order execution
// engine is implemented on the backend.
// ============================================

export default function OrdersPage() {
  return (
    <RequirePermission permission="canManageOrders">
      <div className="space-y-4">
        <div>
          <h1 className="text-base font-semibold text-white">Orders & Trades</h1>
          <p className="text-[11px] text-gray-600 mt-0.5">View, filter, and manage orders and trades.</p>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <ArrowLeftRight className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-sm font-semibold text-white mb-1">Not Yet Available</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Order and trade management will be available once the execution engine is implemented.
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-4 text-[10px] text-gray-600">
            <Clock className="w-3 h-3" />
            Pending: Execution engine + trade matching
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
