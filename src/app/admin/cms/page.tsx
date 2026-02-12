'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Plus,
  Megaphone,
  AlertTriangle,
  Image,
  MessageSquare,
  X,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  Eye,
  Clock,
  Search,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminCMSApi, AdminApiError, type AdminCMSItem } from '@/lib/admin-api';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// CMS & Content Management — wired to real backend
// ============================================

const CONTENT_TYPES = [
  { value: 'announcement', label: 'Announcement', icon: Megaphone, color: 'text-blue-400 bg-blue-500/10', desc: 'Site-wide notification bar' },
  { value: 'maintenance', label: 'Maintenance', icon: AlertTriangle, color: 'text-amber-400 bg-amber-500/10', desc: 'Scheduled maintenance notice' },
  { value: 'banner', label: 'Banner', icon: Image, color: 'text-green-400 bg-green-500/10', desc: 'Promotional banner on pages' },
  { value: 'popup', label: 'Popup', icon: MessageSquare, color: 'text-purple-400 bg-purple-500/10', desc: 'Modal popup for users' },
] as const;

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-gray-400 bg-gray-500/10',
  medium: 'text-blue-400 bg-blue-500/10',
  high: 'text-amber-400 bg-amber-500/10',
  critical: 'text-red-400 bg-red-500/10',
};

const inputCls = 'w-full h-8 px-3 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15]';

function toLocalDatetime(iso: string) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + 'T' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function getScheduleStatus(content: AdminCMSItem): { label: string; color: string } {
  const now = Date.now();
  if (!content.is_active) return { label: 'Inactive', color: 'text-gray-500 bg-gray-500/10' };
  if (new Date(content.start_date).getTime() > now) return { label: 'Scheduled', color: 'text-blue-400 bg-blue-500/10' };
  if (content.end_date && new Date(content.end_date).getTime() < now) return { label: 'Expired', color: 'text-red-400 bg-red-500/10' };
  return { label: 'Live', color: 'text-green-400 bg-green-500/10' };
}

// ── Preview Component ──
function ContentPreview({ content }: { content: { content_type: string; title: string; body: string | null } }) {
  const typeConfig = CONTENT_TYPES.find((t) => t.value === content.content_type);

  if (content.content_type === 'announcement' || content.content_type === 'maintenance') {
    const bgColor = content.content_type === 'maintenance' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20';
    const textColor = content.content_type === 'maintenance' ? 'text-amber-400' : 'text-blue-400';
    return (
      <div className={cn('rounded-lg border p-3', bgColor)}>
        <div className="flex items-center gap-2 mb-1">
          {typeConfig && <typeConfig.icon className={cn('w-4 h-4', textColor)} />}
          <span className={cn('text-xs font-semibold', textColor)}>{content.title}</span>
        </div>
        <p className="text-[11px] text-gray-300">{content.body}</p>
      </div>
    );
  }

  if (content.content_type === 'banner') {
    return (
      <div className="rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/20 p-4">
        <h3 className="text-sm font-bold text-white mb-1">{content.title}</h3>
        <p className="text-[11px] text-gray-300">{content.body}</p>
      </div>
    );
  }

  // popup
  return (
    <div className="rounded-xl bg-[#0f0f18] border border-white/[0.08] max-w-xs mx-auto">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-xs font-semibold text-white">{content.title}</span>
        <X className="w-3 h-3 text-gray-600" />
      </div>
      <div className="p-4">
        <p className="text-[11px] text-gray-300">{content.body}</p>
      </div>
      <div className="px-4 pb-3">
        <div className="h-7 rounded-md bg-blue-500/80 flex items-center justify-center text-[11px] font-medium text-white">Got it</div>
      </div>
    </div>
  );
}

// ── Content Modal (Create / Edit) ──
function ContentModal({ content, onClose, onDone }: { content?: AdminCMSItem; onClose: () => void; onDone: () => void }) {
  const isEdit = !!content;
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    type: content?.content_type || 'announcement',
    title: content?.title || '',
    body: content?.body || '',
    priority: content?.priority || 'medium',
    active: content?.is_active ?? true,
    startDate: content ? toLocalDatetime(content.start_date) : '',
    endDate: content?.end_date ? toLocalDatetime(content.end_date) : '',
  });
  const set = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));

  const handleSave = async () => {
    if (!form.title || !form.body) return;
    setSaving(true);
    setError(null);
    try {
      const data = {
        content_type: form.type,
        title: form.title,
        body: form.body,
        priority: form.priority,
        is_active: form.active,
        start_date: form.startDate ? new Date(form.startDate).toISOString() : new Date().toISOString(),
        end_date: form.endDate ? new Date(form.endDate).toISOString() : undefined,
      };
      if (isEdit && content) {
        await adminCMSApi.update(content.id, data);
      } else {
        await adminCMSApi.create(data);
      }
      onDone();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const previewContent = { content_type: form.type, title: form.title || 'Untitled', body: form.body || 'Content body...' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0f0f18] border border-white/[0.08] rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#0f0f18] px-4 py-3 border-b border-white/[0.06] flex items-center justify-between z-10">
          <h2 className="text-sm font-semibold text-white">{isEdit ? 'Edit Content' : 'Create Content'}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPreview(!showPreview)}
              className={cn('flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                showPreview ? 'bg-blue-500/10 text-blue-400' : 'text-gray-600 hover:text-gray-400')}>
              <Eye className="w-3 h-3" /> Preview
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.05] text-gray-500"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex">
          <div className={cn('p-4 space-y-3', showPreview ? 'w-1/2 border-r border-white/[0.06]' : 'w-full')}>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Type</label>
              <div className="grid grid-cols-4 gap-1">
                {CONTENT_TYPES.map((t) => (
                  <button key={t.value} onClick={() => set({ type: t.value })}
                    className={cn('flex flex-col items-center gap-1 py-2 rounded-md text-[10px] font-medium border transition-colors',
                      form.type === t.value ? `${t.color} border-current` : 'text-gray-600 border-white/[0.06]')}>
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Title *</label>
              <input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })}
                placeholder="e.g. System Upgrade Notice" className={inputCls} />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Body *</label>
              <textarea value={form.body} onChange={(e) => set({ body: e.target.value })} rows={4}
                placeholder="Write the content that users will see..."
                className="w-full text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15] resize-none" />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Priority</label>
              <div className="flex gap-1">
                {PRIORITY_OPTIONS.map((p) => (
                  <button key={p} onClick={() => set({ priority: p })}
                    className={cn('flex-1 py-1.5 rounded-md text-[10px] font-medium border capitalize transition-colors',
                      form.priority === p ? `${PRIORITY_COLORS[p]} border-current` : 'text-gray-600 border-white/[0.06]')}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-gray-500">Active immediately</label>
              <button onClick={() => set({ active: !form.active })}
                className={cn('relative w-10 h-5 rounded-full transition-colors', form.active ? 'bg-green-500/30' : 'bg-white/[0.1]')}>
                <div className={cn('absolute top-0.5 w-4 h-4 rounded-full transition-all', form.active ? 'left-[22px] bg-green-400' : 'left-0.5 bg-gray-500')} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Start Date</label>
                <input type="datetime-local" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })}
                  className={cn(inputCls, '[color-scheme:dark]')} />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">End Date (optional)</label>
                <input type="datetime-local" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })}
                  className={cn(inputCls, '[color-scheme:dark]')} />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
            )}

            <button onClick={handleSave} disabled={!form.title || !form.body || saving}
              className="w-full h-8 flex items-center justify-center gap-2 rounded-lg text-xs font-medium bg-blue-500/80 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Content')}
            </button>
          </div>

          {showPreview && (
            <div className="w-1/2 p-4">
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-3">Live Preview</p>
              <ContentPreview content={previewContent} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CMSPage() {
  const [content, setContent] = useState<AdminCMSItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editContent, setEditContent] = useState<AdminCMSItem | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<AdminCMSItem | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [previewItem, setPreviewItem] = useState<AdminCMSItem | null>(null);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminCMSApi.list();
      setContent(res.content);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const filtered = useMemo(() => {
    let items = content;
    if (typeFilter !== 'all') items = items.filter((c) => c.content_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((c) => c.title.toLowerCase().includes(q) || (c.body || '').toLowerCase().includes(q));
    }
    return items;
  }, [content, typeFilter, search]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await adminCMSApi.delete(confirmDelete.id);
      setConfirmDelete(null);
      fetchContent();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to delete');
    }
  };

  const handleToggleActive = async (item: AdminCMSItem) => {
    try {
      await adminCMSApi.update(item.id, { is_active: !item.is_active });
      fetchContent();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to update');
    }
  };

  return (
    <RequirePermission permission="canManageCMS">
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">CMS & Content</h1>
          <p className="text-[11px] text-gray-600 mt-0.5">Manage announcements, banners, popups, and maintenance notices.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchContent} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => { setEditContent(undefined); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/80 text-white hover:bg-blue-500 transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Content
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
      )}

      {/* Summary */}
      {content.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-600">Total</p>
            <p className="text-sm font-semibold text-white">{content.length}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-600">Active</p>
            <p className="text-sm font-semibold text-green-400">{content.filter((c) => c.is_active).length}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-600">Inactive</p>
            <p className="text-sm font-semibold text-gray-500">{content.filter((c) => !c.is_active).length}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-600">Critical</p>
            <p className="text-sm font-semibold text-red-400">{content.filter((c) => c.priority === 'critical' && c.is_active).length}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search content..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.12]" />
        </div>
        <div className="flex gap-1">
          <button onClick={() => setTypeFilter('all')}
            className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
              typeFilter === 'all' ? 'bg-white/[0.08] text-white' : 'text-gray-600 hover:text-gray-400')}>All</button>
          {CONTENT_TYPES.map((t) => (
            <button key={t.value} onClick={() => setTypeFilter(t.value)}
              className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1',
                typeFilter === t.value ? `${t.color}` : 'text-gray-600 hover:text-gray-400')}>
              <t.icon className="w-3 h-3" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-white/[0.02] border border-white/[0.06] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-8 text-center">
          <Megaphone className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">{content.length === 0 ? 'No content yet. Create your first content item.' : 'No content matches your filters.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const typeConfig = CONTENT_TYPES.find((t) => t.value === item.content_type);
            const TypeIcon = typeConfig?.icon || Megaphone;
            const schedule = getScheduleStatus(item);

            return (
              <div key={item.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', typeConfig?.color)}>
                      <TypeIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <h3 className="text-xs font-semibold text-white truncate">{item.title}</h3>
                        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0', typeConfig?.color)}>
                          {typeConfig?.label}
                        </span>
                        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0', PRIORITY_COLORS[item.priority])}>
                          {item.priority}
                        </span>
                        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0', schedule.color)}>
                          {schedule.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 line-clamp-2 mb-1">{item.body}</p>
                      <div className="flex items-center gap-3 text-[9px] text-gray-700">
                        <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> {new Date(item.created_at).toLocaleString()}</span>
                        <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" /> {new Date(item.start_date).toLocaleDateString()}{item.end_date ? ` — ${new Date(item.end_date).toLocaleDateString()}` : ' — No end'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-0.5 shrink-0 ml-2">
                    <button onClick={() => setPreviewItem(item)}
                      className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/[0.05] transition-colors" title="Preview">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleToggleActive(item)}
                      className={cn('p-1 rounded transition-colors', item.is_active ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-600 hover:bg-white/[0.05]')}
                      title={item.is_active ? 'Deactivate' : 'Activate'}>
                      {item.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => { setEditContent(item); setShowModal(true); }}
                      className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/[0.05] transition-colors" title="Edit">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(item)}
                      className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && <ContentModal content={editContent} onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); fetchContent(); }} />}

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPreviewItem(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400">Preview: {previewItem.title}</p>
              <button onClick={() => setPreviewItem(null)} className="p-1 rounded hover:bg-white/[0.1] text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <ContentPreview content={{ content_type: previewItem.content_type, title: previewItem.title, body: previewItem.body }} />
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm bg-[#0f0f18] border border-white/[0.08] rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className="text-sm font-medium text-white">Delete Content</p>
            </div>
            <p className="text-xs text-gray-400 mb-1">Are you sure you want to delete <span className="text-white font-medium">&quot;{confirmDelete.title}&quot;</span>?</p>
            <p className="text-[10px] text-gray-600 mb-4">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 h-8 rounded-lg text-xs font-medium text-gray-500 border border-white/[0.06] hover:bg-white/[0.04] transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex-1 h-8 rounded-lg text-xs font-medium text-white bg-red-500/80 hover:bg-red-500 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </RequirePermission>
  );
}
