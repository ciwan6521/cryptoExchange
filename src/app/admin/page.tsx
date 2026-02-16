'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore } from '@/stores/admin-store';

// ============================================
// Admin Dashboard
// System overview with health indicators,
// key metrics, and alert area.
// ============================================

function HealthIndicator({ label, status }: {
  label: string;
  status: 'healthy' | 'degraded' | 'down';
}) {
  const config = {
    healthy: { color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2, text: 'Healthy' },
    degraded: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: AlertTriangle, text: 'Degraded' },
    down: { color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle, text: 'Down' },
  }[status];

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium', config.bg, config.color)}>
        <config.icon className="w-3 h-3" />
        {config.text}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { systemFlags } = useAdminStore();

  const alerts: { type: 'warning' | 'error' | 'info'; message: string }[] = [];
  if (systemFlags.maintenanceMode) alerts.push({ type: 'error', message: 'Maintenance mode is ACTIVE — all user operations are paused.' });
  if (!systemFlags.tradingEnabled) alerts.push({ type: 'warning', message: 'Trading is currently DISABLED.' });
  if (!systemFlags.newOrdersEnabled) alerts.push({ type: 'warning', message: 'New order submission is DISABLED.' });
  if (!systemFlags.depositsEnabled) alerts.push({ type: 'warning', message: 'Deposits are DISABLED.' });
  if (!systemFlags.withdrawalsEnabled) alerts.push({ type: 'warning', message: 'Withdrawals are DISABLED.' });

  return (
    <div className="space-y-4">
      <h1 className="text-base font-semibold text-white">System Overview</h1>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border',
                alert.type === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400',
                alert.type === 'warning' && 'bg-amber-500/10 border-amber-500/20 text-amber-400',
                alert.type === 'info' && 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* System Health */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
          <h2 className="text-xs font-semibold text-white mb-2">System Health</h2>
          <div className="divide-y divide-white/[0.04]">
            <HealthIndicator label="REST API" status="healthy" />
            <HealthIndicator label="WebSocket" status="healthy" />
            <HealthIndicator label="Price Feed" status="healthy" />
            <HealthIndicator label="Matching Engine" status={systemFlags.tradingEnabled ? 'healthy' : 'down'} />
            <HealthIndicator label="Withdrawal Service" status={systemFlags.withdrawalsEnabled ? 'healthy' : 'degraded'} />
          </div>
        </div>

        {/* System Flags Quick View */}
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
          <h2 className="text-xs font-semibold text-white mb-2">System Flags</h2>
          <div className="space-y-1.5">
            {Object.entries(systemFlags).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-1">
                <span className="text-[11px] text-gray-400">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())}
                </span>
                <span className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded',
                  key === 'maintenanceMode'
                    ? (value ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400')
                    : (value ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')
                )}>
                  {key === 'maintenanceMode' ? (value ? 'ACTIVE' : 'OFF') : (value ? 'ON' : 'OFF')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
