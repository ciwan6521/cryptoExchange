'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { X, Megaphone, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore, type CMSContent } from '@/stores/admin-store';

// ============================================
// CMS Content Renderer
// Renders active CMS content on user-facing pages:
//   - Announcements → top bar below header
//   - Maintenance notices → amber warning bar
//   - Banners → promotional section (used in dashboard)
//   - Popups → modal overlay (dismissable, once per session)
// Admin routes (/admin/*) are excluded.
// ============================================

function isLive(content: CMSContent): boolean {
  if (!content.active) return false;
  const now = Date.now();
  if (content.startDate > now) return false;
  if (content.endDate && content.endDate < now) return false;
  return true;
}

// ── Announcement Bar ──
export const AnnouncementBar: React.FC = () => {
  const cmsContent = useAdminStore((s) => s.cmsContent);
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (pathname.startsWith('/admin')) return null;

  const announcements = cmsContent
    .filter((c) => c.type === 'announcement' && isLive(c) && !dismissed.has(c.id))
    .sort((a, b) => {
      const prio = { critical: 0, high: 1, medium: 2, low: 3 };
      return prio[a.priority] - prio[b.priority];
    });

  if (announcements.length === 0) return null;

  const top = announcements[0];
  const priorityStyles: Record<string, string> = {
    critical: 'bg-red-500/10 border-red-500/20 text-red-400',
    high: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    medium: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    low: 'bg-white/[0.03] border-white/[0.06] text-gray-400',
  };

  return (
    <div className={cn('border-b px-4 py-2 flex items-center justify-center gap-2 text-xs', priorityStyles[top.priority])}>
      <Megaphone className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium">{top.title}</span>
      {top.body && <span className="hidden sm:inline opacity-80">— {top.body}</span>}
      {announcements.length > 1 && (
        <span className="opacity-60 shrink-0">+{announcements.length - 1} more</span>
      )}
      <button
        onClick={() => setDismissed((prev) => new Set(prev).add(top.id))}
        className="ml-auto p-0.5 rounded hover:bg-white/[0.1] transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

// ── Maintenance Notice Bar ──
export const MaintenanceNoticeBar: React.FC = () => {
  const cmsContent = useAdminStore((s) => s.cmsContent);
  const pathname = usePathname();

  if (pathname.startsWith('/admin')) return null;

  const notices = cmsContent.filter((c) => c.type === 'maintenance' && isLive(c));
  if (notices.length === 0) return null;

  const top = notices.sort((a, b) => {
    const prio = { critical: 0, high: 1, medium: 2, low: 3 };
    return prio[a.priority] - prio[b.priority];
  })[0];

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 flex items-center justify-center gap-2 text-xs text-amber-400">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium">{top.title}</span>
      {top.body && <span className="hidden sm:inline opacity-80">— {top.body}</span>}
    </div>
  );
};

// ── CMS Popup ──
export const CMSPopup: React.FC = () => {
  const cmsContent = useAdminStore((s) => s.cmsContent);
  const pathname = usePathname();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Load dismissed popups from sessionStorage
    try {
      const stored = sessionStorage.getItem('crypto4pro-dismissed-popups');
      if (stored) setDismissedIds(new Set(JSON.parse(stored)));
    } catch { /* ignore */ }
    setSessionReady(true);
  }, []);

  if (!sessionReady) return null;
  if (pathname.startsWith('/admin')) return null;

  const popups = cmsContent
    .filter((c) => c.type === 'popup' && isLive(c) && !dismissedIds.has(c.id))
    .sort((a, b) => {
      const prio = { critical: 0, high: 1, medium: 2, low: 3 };
      return prio[a.priority] - prio[b.priority];
    });

  if (popups.length === 0) return null;

  const popup = popups[0];

  const handleDismiss = () => {
    const next = new Set(dismissedIds).add(popup.id);
    setDismissedIds(next);
    try {
      sessionStorage.setItem('crypto4pro-dismissed-popups', JSON.stringify(Array.from(next)));
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={handleDismiss}>
      <div className="w-full max-w-sm bg-[#0f0f18] border border-white/[0.08] rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">{popup.title}</h3>
          </div>
          <button onClick={handleDismiss} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{popup.body}</p>
        </div>
        <div className="px-5 pb-4">
          <button onClick={handleDismiss}
            className="w-full h-9 rounded-lg text-xs font-medium bg-blue-500/80 text-white hover:bg-blue-500 transition-colors">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

// ── CMS Banner (for embedding in pages like dashboard) ──
export const CMSBanners: React.FC = () => {
  const cmsContent = useAdminStore((s) => s.cmsContent);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const banners = cmsContent
    .filter((c) => c.type === 'banner' && isLive(c) && !dismissed.has(c.id))
    .sort((a, b) => {
      const prio = { critical: 0, high: 1, medium: 2, low: 3 };
      return prio[a.priority] - prio[b.priority];
    });

  if (banners.length === 0) return null;

  return (
    <div className="space-y-2">
      {banners.map((banner) => (
        <div key={banner.id} className="relative rounded-lg bg-gradient-to-r from-brand-500/10 to-purple-500/10 border border-brand-500/15 p-4">
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(banner.id))}
            className="absolute top-2 right-2 p-1 rounded hover:bg-white/[0.1] text-gray-500 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
          <h3 className="text-sm font-semibold text-white mb-1 pr-6">{banner.title}</h3>
          <p className="text-xs text-gray-400 leading-relaxed">{banner.body}</p>
        </div>
      ))}
    </div>
  );
};
