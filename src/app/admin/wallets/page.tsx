'use client';

import React from 'react';
import { Wallet, Clock } from 'lucide-react';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Wallet Module
// Placeholder — will be wired when blockchain
// wallet integration is implemented.
// ============================================

export default function WalletsPage() {
  return (
    <RequirePermission permission="canManageWallets">
      <div className="space-y-4">
        <div>
          <h1 className="text-base font-semibold text-white">Wallet Operations</h1>
          <p className="text-[11px] text-gray-600 mt-0.5">Deposit and withdrawal management.</p>
        </div>
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-6 h-6 text-green-400" />
          </div>
          <h2 className="text-sm font-semibold text-white mb-1">Not Yet Available</h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Wallet operations will be available once blockchain wallet integration and the withdrawal security model are implemented.
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-4 text-[10px] text-gray-600">
            <Clock className="w-3 h-3" />
            Pending: Blockchain integration + wallet security model
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
