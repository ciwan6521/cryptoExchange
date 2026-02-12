'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Shield,
  ArrowLeftRight,
  CreditCard,
  Wallet,
  Wrench,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminFlagsApi, AdminApiError } from '@/lib/admin-api';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// System Flags & Kill Switches — wired to real backend
// ============================================

const FLAG_CONFIG: {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  dangerWhenOff: boolean;
}[] = [
  {
    key: 'trading_enabled',
    label: 'Trading',
    description: 'Master switch for all trading operations. Disabling stops the matching engine.',
    icon: ArrowLeftRight,
    dangerWhenOff: true,
  },
  {
    key: 'new_orders_enabled',
    label: 'New Orders',
    description: 'Allow new order submissions. Existing orders remain active when disabled.',
    icon: Shield,
    dangerWhenOff: true,
  },
  {
    key: 'deposits_enabled',
    label: 'Deposits',
    description: 'Allow users to deposit funds. Disable during wallet maintenance.',
    icon: CreditCard,
    dangerWhenOff: true,
  },
  {
    key: 'withdrawals_enabled',
    label: 'Withdrawals',
    description: 'Allow users to withdraw funds. Disable for security incidents.',
    icon: Wallet,
    dangerWhenOff: true,
  },
  {
    key: 'maintenance_mode',
    label: 'Maintenance Mode',
    description: 'Show maintenance page to all users. Admin panel remains accessible.',
    icon: Wrench,
    dangerWhenOff: false, // danger when ON
  },
  {
    key: 'registration_enabled',
    label: 'Registration',
    description: 'Allow new user registrations. Disable during attacks or capacity limits.',
    icon: UserPlus,
    dangerWhenOff: true,
  },
];

export default function FlagsPage() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFlagsApi.get();
      setFlags(res.flags);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to load flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  const handleToggle = async (key: string) => {
    setToggling(true);
    setError(null);
    try {
      const newValue = !flags[key];
      await adminFlagsApi.update(key, newValue);
      setFlags((prev) => ({ ...prev, [key]: newValue }));
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to update flag');
    } finally {
      setToggling(false);
      setConfirmToggle(null);
    }
  };

  return (
    <RequirePermission permission="canManageFlags">
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">System Flags & Kill Switches</h1>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Critical system toggles. Changes take effect immediately and are logged.
          </p>
        </div>
        <button onClick={fetchFlags} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Warning banner */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <p className="text-[11px] text-amber-400">
          Toggling these flags affects all users immediately. Use with caution.
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
      )}

      {/* Flags Grid */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-white/[0.02] border border-white/[0.06] rounded-lg animate-pulse" />
          ))
        ) : (
          FLAG_CONFIG.map((flag) => {
            const isOn = !!flags[flag.key];
            const isDangerous = flag.key === 'maintenance_mode' ? isOn : !isOn;

            return (
              <div
                key={flag.key}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border transition-colors',
                  isDangerous && flag.dangerWhenOff
                    ? 'bg-red-500/5 border-red-500/20'
                    : flag.key === 'maintenance_mode' && isOn
                      ? 'bg-red-500/5 border-red-500/20'
                      : 'bg-white/[0.02] border-white/[0.06]'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    isOn && flag.key !== 'maintenance_mode' ? 'bg-green-500/10 text-green-400' :
                    !isOn && flag.key !== 'maintenance_mode' ? 'bg-red-500/10 text-red-400' :
                    isOn ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                  )}>
                    <flag.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white">{flag.label}</p>
                    <p className="text-[10px] text-gray-600 max-w-md">{flag.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded',
                    flag.key === 'maintenance_mode'
                      ? (isOn ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400')
                      : (isOn ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')
                  )}>
                    {flag.key === 'maintenance_mode'
                      ? (isOn ? 'ACTIVE' : 'OFF')
                      : (isOn ? 'ON' : 'OFF')}
                  </span>

                  <button
                    onClick={() => setConfirmToggle(flag.key)}
                    className={cn(
                      'relative w-10 h-5 rounded-full transition-colors',
                      isOn ? 'bg-green-500/30' : 'bg-white/[0.1]'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full transition-all',
                        isOn ? 'left-[22px] bg-green-400' : 'left-0.5 bg-gray-500'
                      )}
                    />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmToggle(null)}>
          <div className="w-full max-w-sm bg-[#0f0f18] border border-white/[0.08] rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-medium text-white">Confirm Toggle</p>
            </div>
            <p className="text-xs text-gray-400 mb-1">
              Are you sure you want to set <strong className="text-white">{confirmToggle}</strong> to{' '}
              <strong className={!flags[confirmToggle] ? 'text-green-400' : 'text-red-400'}>
                {confirmToggle === 'maintenance_mode'
                  ? (!flags[confirmToggle] ? 'ACTIVE' : 'OFF')
                  : (!flags[confirmToggle] ? 'ON' : 'OFF')}
              </strong>?
            </p>
            <p className="text-[10px] text-gray-600 mb-4">This change takes effect immediately for all users.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmToggle(null)}
                className="flex-1 h-8 rounded-lg text-xs font-medium text-gray-500 border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggle(confirmToggle)}
                disabled={toggling}
                className="flex-1 h-8 rounded-lg text-xs font-medium bg-amber-500/80 text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {toggling ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </RequirePermission>
  );
}
