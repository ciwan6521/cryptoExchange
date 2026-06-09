'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2, AlertTriangle } from 'lucide-react';
import { adminOptionsApi, type AdminOptionPosition } from '@/lib/admin-api';

export default function AdminOptionsPage() {
  const [positions, setPositions] = useState<AdminOptionPosition[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminOptionsApi.listOpenPositions();
      setPositions(res.positions);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load options positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return (
    <div className="space-y-4">
      <h1 className="text-base font-semibold text-white flex items-center gap-2">
        <BarChart3 className="w-4 h-4" />
        Open Options Positions
        {!loading && (
          <span className="text-[10px] font-normal text-gray-600">({total})</span>
        )}
      </h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 space-y-2">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchPositions} className="text-xs underline text-gray-500">Retry</button>
        </div>
      ) : positions.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-600">No open options positions</div>
      ) : (
        <div className="rounded-lg border border-white/10 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-600">
                <th className="px-3 py-2 text-left font-medium">Asset</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Strike</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Premium</th>
                <th className="px-3 py-2 text-left font-medium">Expiry</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {positions.map((pos) => (
                <tr key={pos.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-white font-medium">{pos.asset}</td>
                  <td className="px-3 py-2 capitalize text-gray-400">{pos.option_type}</td>
                  <td className="px-3 py-2 text-right text-white font-mono">{pos.strike_price}</td>
                  <td className="px-3 py-2 text-right text-gray-300 font-mono">{pos.quantity}</td>
                  <td className="px-3 py-2 text-right text-gray-300 font-mono">{pos.premium_usdt}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {new Date(pos.expiry_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-gray-600 font-mono truncate max-w-[120px]">
                    {pos.user_id.slice(0, 8)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
