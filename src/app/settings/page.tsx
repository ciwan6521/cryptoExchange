'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import {
  User,
  Shield,
  Bell,
  Palette,
  Key,
  Smartphone,
  LogOut,
  Check,
  AlertTriangle,
  Monitor,
  Lock,
  ScanFace,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Card, CardHeader, Button, Input, Badge, Modal } from '@/components/ui';
import { cn, formatTime } from '@/lib/utils';
import { authApi, ApiError, type SessionItem } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { isEnabled } from '@/lib/feature-flags';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'appearance';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const;

export default function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('security');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/';
    } catch {
      toast.error('Logout failed');
    }
  };

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="py-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-display font-bold text-white mb-1">Settings</h1>
              <p className="text-gray-400">Manage your account settings and preferences</p>
            </motion.div>
          </div>

          <div className="grid lg:grid-cols-4 gap-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-1">
              <Card padding="sm">
                <nav className="space-y-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200',
                        activeTab === tab.id
                          ? 'bg-brand-500/10 text-brand-400'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  ))}
                </nav>
                <div className="mt-4 pt-4 border-t border-glass-border">
                  <button
                    onClick={() => setShowLogoutModal(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-3 space-y-6">
              {activeTab === 'security' && <SecuritySettings />}
              {activeTab === 'profile' && <ProfileSettings />}
              {activeTab === 'notifications' && <NotificationSettings />}
              {activeTab === 'appearance' && <AppearanceSettings />}
            </motion.div>
          </div>
        </div>
      </main>

      <Modal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} title="Sign Out" size="sm">
        <p className="text-gray-400 mb-6">Are you sure you want to sign out of your account?</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setShowLogoutModal(false)}>Cancel</Button>
          <Button className="bg-red-500 hover:bg-red-400" onClick={handleLogout}>Sign Out</Button>
        </div>
      </Modal>
    </div>
  );
}

function SecuritySettings() {
  const user = useAuthStore((s) => s.user);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      setSessionsLoading(true);
      const res = await authApi.getSessions();
      setSessions(res.sessions);
    } catch { /* ignore */ } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) { toast.error('Fill in all password fields'); return; }
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      toast.success('Password changed successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to change password');
    } finally { setPwLoading(false); }
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await authApi.revokeSession(id);
      toast.success('Session revoked');
      loadSessions();
    } catch {
      toast.error('Failed to revoke session');
    }
  };

  const handleSendVerification = async () => {
    try {
      await authApi.sendVerification();
      toast.success('Verification email sent');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to send verification email');
    }
  };

  return (
    <>
      <Card>
        <CardHeader title="Security Overview" subtitle="Review your account security status" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Strong</span>
            </div>
            <p className="text-xs text-gray-400">Password strength</p>
          </div>
          <div className={cn('p-4 rounded-xl border', user?.totp_enabled ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20')}>
            <div className="flex items-center gap-2 mb-2">
              {user?.totp_enabled ? (
                <><Check className="w-4 h-4 text-green-400" /><span className="text-sm font-medium text-green-400">Enabled</span></>
              ) : (
                <><AlertTriangle className="w-4 h-4 text-amber-400" /><span className="text-sm font-medium text-amber-400">Disabled</span></>
              )}
            </div>
            <p className="text-xs text-gray-400">Two-factor auth</p>
          </div>
          <div className={cn('p-4 rounded-xl border', user?.email_verified ? 'bg-green-500/10 border-green-500/20' : 'bg-amber-500/10 border-amber-500/20')}>
            <div className="flex items-center gap-2 mb-2">
              {user?.email_verified ? (
                <><Check className="w-4 h-4 text-green-400" /><span className="text-sm font-medium text-green-400">Verified</span></>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <button onClick={handleSendVerification} className="text-sm font-medium text-amber-400 hover:underline">Verify Now</button>
                </>
              )}
            </div>
            <p className="text-xs text-gray-400">Email verified</p>
          </div>
          <KYCStatusCard />
        </div>
      </Card>

      <TwoFactorCard />

      <KYCVerificationCard />

      <Card>
        <CardHeader title="Change Password" subtitle="Update your password regularly for better security" />
        <div className="mt-4 space-y-4 max-w-md">
          <Input label="Current Password" type="password" placeholder="••••••••" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} leftIcon={<Lock className="w-4 h-4" />} />
          <Input label="New Password" type="password" placeholder="••••••••" value={newPw} onChange={(e) => setNewPw(e.target.value)} leftIcon={<Lock className="w-4 h-4" />} />
          <Input label="Confirm New Password" type="password" placeholder="••••••••" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} leftIcon={<Lock className="w-4 h-4" />} />
          <Button onClick={handleChangePassword} loading={pwLoading}>Update Password</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Active Sessions" subtitle="Manage devices that are logged into your account" />
        <div className="mt-4 space-y-3">
          {sessionsLoading ? (
            <p className="text-sm text-gray-500">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500">No active sessions found.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'p-4 rounded-xl border flex items-center justify-between',
                  session.is_current ? 'bg-brand-500/5 border-brand-500/20' : 'bg-surface-100 border-glass-border'
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-50 flex items-center justify-center">
                    <Monitor className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{session.user_agent?.split(' ')[0] || 'Unknown Device'}</span>
                      {session.is_current && <Badge variant="brand" size="sm">Current</Badge>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {session.ip_address || '—'} • {formatTime(new Date(session.created_at).getTime(), 'full')}
                    </div>
                  </div>
                </div>
                {!session.is_current && (
                  <Button variant="ghost" size="sm" onClick={() => handleRevokeSession(session.id)} className="text-red-400">
                    Revoke
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {isEnabled('ENABLE_API_KEYS') && (
        <Card>
          <CardHeader title="API Keys" subtitle="Manage API keys for programmatic access" action={<Button size="sm">Create New Key</Button>} />
          <div className="mt-4 p-6 rounded-xl bg-surface-100 border border-glass-border text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-50 flex items-center justify-center mx-auto mb-3">
              <Key className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-sm text-gray-400">No API keys created yet</p>
          </div>
        </Card>
      )}
    </>
  );
}

function TwoFactorCard() {
  const user = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const [setupData, setSetupData] = useState<{ secret: string; provisioning_uri: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');

  const handleSetup = async () => {
    setLoading(true);
    try {
      const data = await authApi.setup2FA();
      setSetupData(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to setup 2FA');
    } finally { setLoading(false); }
  };

  const handleEnable = async () => {
    if (verifyCode.length !== 6) { toast.error('Enter a 6-digit code'); return; }
    setLoading(true);
    try {
      await authApi.enable2FA(verifyCode);
      toast.success('2FA enabled successfully');
      setSetupData(null);
      setVerifyCode('');
      await restoreSession();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Invalid code');
    } finally { setLoading(false); }
  };

  const handleDisable = async () => {
    if (disableCode.length !== 6) { toast.error('Enter a 6-digit code'); return; }
    if (!disablePassword) { toast.error('Enter your password'); return; }
    setLoading(true);
    try {
      await authApi.disable2FA(disableCode, disablePassword);
      toast.success('2FA disabled');
      setShowDisable(false);
      setDisableCode('');
      setDisablePassword('');
      await restoreSession();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to disable 2FA');
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">Two-Factor Authentication</h3>
            <p className="text-sm text-gray-400 mt-1">
              {user?.totp_enabled
                ? '2FA is enabled on your account. Required for withdrawals.'
                : 'Enable 2FA to secure your account. Required for withdrawals.'}
            </p>
          </div>
        </div>
        {!user?.totp_enabled && !setupData && (
          <Button size="sm" onClick={handleSetup} loading={loading}>Enable</Button>
        )}
        {user?.totp_enabled && !showDisable && (
          <div className="flex items-center gap-2">
            <Badge variant="success" size="sm">Enabled</Badge>
            <Button variant="ghost" size="sm" onClick={() => setShowDisable(true)} className="text-red-400 text-xs">
              Disable
            </Button>
          </div>
        )}
      </div>

      {!user?.totp_enabled && !setupData && (
        <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300 leading-relaxed">
            2FA is required to make withdrawals. Please enable Google Authenticator to secure your account and unlock withdrawal functionality.
          </p>
        </div>
      )}

      {setupData && (
        <div className="mt-6 space-y-4 border-t border-glass-border pt-6">
          <p className="text-sm text-gray-300">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):</p>
          <div className="flex justify-center p-4 bg-white rounded-xl w-fit mx-auto">
            <QRCodeSVG value={setupData.provisioning_uri} size={200} />
          </div>
          <div className="p-3 rounded-lg bg-surface-100 border border-glass-border">
            <p className="text-xs text-gray-500 mb-1">Manual entry key:</p>
            <code className="text-sm text-brand-400 font-mono break-all">{setupData.secret}</code>
          </div>
          <div className="max-w-xs">
            <Input
              label="Enter 6-digit code from your app"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              leftIcon={<Shield className="w-4 h-4" />}
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={handleEnable} loading={loading}>Verify & Enable</Button>
            <Button variant="secondary" onClick={() => setSetupData(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {showDisable && (
        <div className="mt-6 space-y-4 border-t border-glass-border pt-6">
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300 leading-relaxed">
              Disabling 2FA will prevent you from making withdrawals until you re-enable it.
            </p>
          </div>
          <div className="max-w-xs space-y-3">
            <Input
              label="Current Password"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
            />
            <Input
              label="Authenticator Code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              leftIcon={<Shield className="w-4 h-4" />}
            />
          </div>
          <div className="flex gap-3">
            <Button className="bg-red-500 hover:bg-red-400" onClick={handleDisable} loading={loading}>Disable 2FA</Button>
            <Button variant="secondary" onClick={() => { setShowDisable(false); setDisableCode(''); setDisablePassword(''); }}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const [username, setUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.username) setUsername(user.username);
  }, [user?.username]);

  const handleSave = async () => {
    if (!username.trim()) { toast.error('Username cannot be empty'); return; }
    setSaving(true);
    try {
      await authApi.updateProfile({ username });
      toast.success('Profile updated');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Failed to update profile');
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader title="Profile Information" subtitle="Update your personal details" />
      <div className="mt-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{user?.email}</p>
            <p className="text-xs text-gray-500">Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
          <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input label="Email" type="email" value={user?.email || ''} disabled />
        </div>

        <div className="pt-4 border-t border-glass-border">
          <Button onClick={handleSave} loading={saving}>Save Changes</Button>
        </div>
      </div>
    </Card>
  );
}

function NotificationSettings() {
  const [notifications, setNotifications] = useState({
    email: true, push: true, trades: true, price: false, news: true, security: true,
  });
  const toggle = (key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };
  return (
    <Card>
      <CardHeader title="Notification Preferences" subtitle="Choose what notifications you receive" />
      <div className="mt-6 space-y-6 divide-y divide-glass-border">
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300">Channels</h4>
          <NotificationRow title="Email Notifications" description="Receive notifications via email" checked={notifications.email} onChange={() => toggle('email')} />
          <NotificationRow title="Push Notifications" description="Receive push notifications on your devices" checked={notifications.push} onChange={() => toggle('push')} />
        </div>
        <div className="pt-6 space-y-4">
          <h4 className="text-sm font-medium text-gray-300">Types</h4>
          <NotificationRow title="Trade Confirmations" description="Get notified when your orders are filled" checked={notifications.trades} onChange={() => toggle('trades')} />
          <NotificationRow title="Price Alerts" description="Get notified when prices reach your targets" checked={notifications.price} onChange={() => toggle('price')} />
          <NotificationRow title="News & Updates" description="Stay updated with market news and platform updates" checked={notifications.news} onChange={() => toggle('news')} />
          <NotificationRow title="Security Alerts" description="Get notified about security-related events" checked={notifications.security} onChange={() => toggle('security')} />
        </div>
      </div>
    </Card>
  );
}

function NotificationRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-11 h-6 bg-surface-100 rounded-full peer peer-checked:bg-brand-500 transition-colors">
          <div className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform', checked && 'translate-x-5')} />
        </div>
      </label>
    </div>
  );
}

function AppearanceSettings() {
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  return (
    <Card>
      <CardHeader title="Appearance" subtitle="Customize how Crypto4Pro looks" />
      <div className="mt-6 space-y-6">
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-3">Theme</h4>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value as any)}
                className={cn(
                  'p-4 rounded-xl border text-center transition-all',
                  theme === option.value
                    ? 'bg-brand-500/10 border-brand-500/50 text-brand-400'
                    : 'bg-surface-100 border-glass-border text-gray-400 hover:border-glass-hover'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">Light mode coming soon</p>
              <p className="text-xs text-gray-400 mt-1">We&apos;re currently optimizing the light theme for the best experience.</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function KYCStatusCard() {
  const user = useAuthStore((s) => s.user);
  const status = user?.kycStatus || 'none';

  const config: Record<string, { color: string; bg: string; border: string; label: string; icon: React.ElementType }> = {
    none: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Not Started', icon: AlertTriangle },
    pending: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Pending', icon: Clock },
    approved: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Verified', icon: Check },
    rejected: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Rejected', icon: AlertTriangle },
  };

  const cfg = config[status] || config.none;

  return (
    <a href="/kyc" className={cn('block p-4 rounded-xl border transition-all hover:opacity-80', cfg.bg, cfg.border)}>
      <div className="flex items-center gap-2 mb-2">
        <cfg.icon className={cn('w-4 h-4', cfg.color)} />
        <span className={cn('text-sm font-medium', cfg.color)}>{cfg.label}</span>
      </div>
      <p className="text-xs text-gray-400">Identity (KYC)</p>
    </a>
  );
}

function KYCVerificationCard() {
  const user = useAuthStore((s) => s.user);
  const status = user?.kycStatus || 'none';

  return (
    <Card>
      <CardHeader
        title="Identity Verification (KYC)"
        subtitle="Verify your identity to enable trading and withdrawals"
      />
      <div className="mt-4">
        {status === 'approved' ? (
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
            <Check className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-400">Identity Verified</p>
              <p className="text-xs text-gray-400 mt-0.5">Your identity has been verified. All features are enabled.</p>
            </div>
          </div>
        ) : status === 'pending' ? (
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-400">Verification Pending</p>
              <p className="text-xs text-gray-400 mt-0.5">Your documents are being reviewed. This usually takes up to 24 hours.</p>
            </div>
          </div>
        ) : status === 'rejected' ? (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-400">Verification Rejected</p>
                <p className="text-xs text-gray-400 mt-0.5">Your documents were not accepted. Please resubmit with clear, valid photos.</p>
              </div>
            </div>
            <a
              href="/kyc"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium transition-colors"
            >
              <ScanFace className="w-4 h-4" />
              Resubmit Documents
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Verification Required</p>
                <p className="text-xs text-gray-400 mt-0.5">Trading and withdrawals are disabled until you verify your identity. Upload your government-issued ID to get started.</p>
              </div>
            </div>
            <a
              href="/kyc"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-medium transition-colors"
            >
              <ScanFace className="w-4 h-4" />
              Verify Identity
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}
