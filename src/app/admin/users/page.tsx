'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Shield,
  ShieldOff,
  Ban,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore } from '@/stores/admin-store';
import { RequirePermission } from '@/components/admin/RequirePermission';
import { adminUsersApi, AdminApiError, type AdminUserItem } from '@/lib/admin-api';

// ============================================
// User Management Module — wired to real backend
// ============================================

function UserDetailModal({
  user,
  onClose,
  onUpdated,
}: {
  user: AdminUserItem;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const hasPermission = useAdminStore((s) => s.hasPermission);
  const canManage = hasPermission('canManageUsers');
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = async (action: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      switch (action) {
        case 'toggle_enabled':
          await adminUsersApi.updateFlags(user.id, { is_active: !user.is_active });
          break;
        case 'toggle_trading':
          await adminUsersApi.updateFlags(user.id, { trading_enabled: !user.trading_enabled });
          break;
        case 'toggle_withdrawals':
          await adminUsersApi.updateFlags(user.id, { withdrawals_enabled: !user.withdrawals_enabled });
          break;
      }
      onUpdated();
      setShowConfirm(null);
    } catch (e) {
      setActionError(e instanceof AdminApiError ? e.detail : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[#0f0f18] border border-white/[0.08] rounded-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-[#0f0f18] border-b border-white/[0.06] px-4 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-sm font-semibold text-white">{user.username}</h2>
            <p className="text-[11px] text-gray-600">{user.email}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', user.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
              {user.is_active ? 'Active' : 'Disabled'}
            </span>
            <span className={cn('px-2 py-0.5 rounded text-[10px] font-medium', user.is_verified ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400')}>
              {user.is_verified ? 'Verified' : 'Unverified'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/[0.05] text-gray-400">
              KYC: {user.kyc_status}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/[0.05] text-gray-400">
              Tier: {user.member_tier}
            </span>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="User ID" value={user.id} />
            <InfoRow label="Registered" value={new Date(user.created_at).toLocaleDateString()} />
            <InfoRow label="Last Login" value={user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'} />
            <InfoRow label="Trading" value={user.trading_enabled ? 'Enabled' : 'Disabled'} />
            <InfoRow label="Withdrawals" value={user.withdrawals_enabled ? 'Enabled' : 'Disabled'} />
          </div>

          {/* Actions */}
          {canManage && (
            <div>
              <p className="text-[11px] font-medium text-gray-500 mb-2">Admin Actions</p>
              <div className="grid grid-cols-2 gap-1.5">
                <ActionBtn
                  icon={user.is_active ? Ban : CheckCircle2}
                  label={user.is_active ? 'Disable User' : 'Enable User'}
                  color={user.is_active ? 'red' : 'green'}
                  onClick={() => setShowConfirm('toggle_enabled')}
                />
                <ActionBtn
                  icon={user.trading_enabled ? ShieldOff : Shield}
                  label={user.trading_enabled ? 'Disable Trading' : 'Enable Trading'}
                  color={user.trading_enabled ? 'amber' : 'green'}
                  onClick={() => setShowConfirm('toggle_trading')}
                />
                <ActionBtn
                  icon={user.withdrawals_enabled ? ShieldOff : Shield}
                  label={user.withdrawals_enabled ? 'Disable Withdrawals' : 'Enable Withdrawals'}
                  color={user.withdrawals_enabled ? 'amber' : 'green'}
                  onClick={() => setShowConfirm('toggle_withdrawals')}
                />
              </div>
            </div>
          )}

          {/* Action error */}
          {actionError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{actionError}</p>
          )}

          {/* Confirmation */}
          {showConfirm && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-red-400 mb-2">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Confirm: <strong>{showConfirm.replace(/_/g, ' ')}</strong> for {user.email}?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(showConfirm)}
                  disabled={actionLoading}
                  className="px-3 py-1 rounded text-[11px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowConfirm(null)}
                  className="px-3 py-1 rounded text-[11px] font-medium text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.02] rounded-md px-3 py-1.5">
      <p className="text-[10px] text-gray-600">{label}</p>
      <p className="text-xs text-white truncate" title={value}>{value}</p>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, color, onClick }: {
  icon: React.ElementType;
  label: string;
  color: 'red' | 'amber' | 'green' | 'blue';
  onClick: () => void;
}) {
  const colors = {
    red: 'text-red-400 hover:bg-red-500/10',
    amber: 'text-amber-400 hover:bg-amber-500/10',
    green: 'text-green-400 hover:bg-green-500/10',
    blue: 'text-blue-400 hover:bg-blue-500/10',
  };
  return (
    <button
      onClick={onClick}
      className={cn('flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors', colors[color])}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminUsersApi.list({ search: search || undefined, limit: 100 });
      setUsers(res.users);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchUsers, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchUsers, search]);

  return (
    <RequirePermission permission="canManageUsers">
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-white">User Management</h1>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600">{total} users</span>
          <button onClick={fetchUsers} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or username..."
          className="w-full h-8 pl-9 pr-3 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15]"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
      )}

      {/* User Table */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600 border-b border-white/[0.06]">
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Status</th>
              <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Last Login</th>
              <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">KYC / Tier</th>
              <th className="text-right px-3 py-2 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-2"><div className="h-3 w-24 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2 hidden md:table-cell"><div className="h-3 w-16 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2 hidden lg:table-cell"><div className="h-3 w-20 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2 hidden lg:table-cell"><div className="h-3 w-14 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2"></td>
                </tr>
              ))
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2">
                    <p className="text-white font-medium">{user.username}</p>
                    <p className="text-[10px] text-gray-600">{user.email}</p>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <div className="flex gap-1">
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', user.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
                        {user.is_active ? 'Active' : 'Disabled'}
                      </span>
                      {user.is_verified && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400">
                          Verified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-500 hidden lg:table-cell">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    <span className="text-gray-500">{user.kyc_status} / {user.member_tier}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ChevronRight className="w-3.5 h-3.5 text-gray-700 inline" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <p className="text-center text-[11px] text-gray-600 py-6">No users found</p>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdated={() => { fetchUsers(); setSelectedUser(null); }}
        />
      )}
    </div>
    </RequirePermission>
  );
}
