'use client';

import React from 'react';
import { ShieldX } from 'lucide-react';
import { useAdminStore, type AdminPermissions } from '@/stores/admin-store';

// ============================================
// Page-level permission gate for admin pages.
// Renders an explicit "Unauthorized" state if
// the current admin lacks the required permission.
// This is a UX safety layer — backend enforces
// the actual access control via 403.
// ============================================

export function RequirePermission({
  permission,
  children,
}: {
  permission: keyof AdminPermissions;
  children: React.ReactNode;
}) {
  const hasPermission = useAdminStore((s) => s.hasPermission);
  const adminUser = useAdminStore((s) => s.adminUser);

  if (!hasPermission(permission)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-4">
          <ShieldX className="w-6 h-6 text-red-400" />
        </div>
        <h2 className="text-sm font-semibold text-white mb-1">Unauthorized</h2>
        <p className="text-xs text-gray-500 text-center max-w-xs">
          Your role <span className="text-white font-medium">({adminUser?.role || 'unknown'})</span> does
          not have permission to access this page.
        </p>
        <p className="text-[10px] text-gray-700 mt-3">
          Required: <code className="text-gray-500">{permission}</code>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
