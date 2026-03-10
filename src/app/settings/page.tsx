'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  User,
  Shield,
  Bell,
  Palette,
  Key,
  Smartphone,
  Globe,
  LogOut,
  ChevronRight,
  Check,
  AlertTriangle,
  Monitor,
  Trash2,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Card, CardHeader, Button, Input, Badge, Modal } from '@/components/ui';
import { cn, formatTime } from '@/lib/utils';
// Session data — will be fetched from backend when sessions API is available
const PLACEHOLDER_SESSIONS = [
  { id: 'current', device: 'Current Browser', ip: '—', location: '—', lastActive: Date.now(), current: true },
];
import { isEnabled } from '@/lib/feature-flags';

// ============================================
// Settings Page
// User settings and security management
// ============================================

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
  
  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <main className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Page header */}
          <div className="py-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-2xl font-display font-bold text-white mb-1">
                Settings
              </h1>
              <p className="text-gray-400">
                Manage your account settings and preferences
              </p>
            </motion.div>
          </div>
          
          <div className="grid lg:grid-cols-4 gap-6">
            {/* Sidebar navigation */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-1"
            >
              <Card padding="sm">
                <nav className="space-y-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                        'transition-colors duration-200',
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
                
                {/* Logout button */}
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
            
            {/* Main content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-3 space-y-6"
            >
              {activeTab === 'security' && <SecuritySettings />}
              {activeTab === 'profile' && <ProfileSettings />}
              {activeTab === 'notifications' && <NotificationSettings />}
              {activeTab === 'appearance' && <AppearanceSettings />}
            </motion.div>
          </div>
        </div>
      </main>
      
      {/* Logout modal */}
      <Modal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        title="Sign Out"
        size="sm"
      >
        <p className="text-gray-400 mb-6">
          Are you sure you want to sign out of your account?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setShowLogoutModal(false)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500 hover:bg-red-400"
            onClick={() => {/* Handle logout */}}
          >
            Sign Out
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// Security Settings Component
function SecuritySettings() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [showRevokeModal, setShowRevokeModal] = useState<string | null>(null);
  
  return (
    <>
      {/* Security overview */}
      <Card>
        <CardHeader
          title="Security Overview"
          subtitle="Review your account security status"
        />
        
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Strong</span>
            </div>
            <p className="text-xs text-gray-400">Password strength</p>
          </div>
          
          <div className={cn(
            'p-4 rounded-xl border',
            twoFactorEnabled
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-amber-500/10 border-amber-500/20'
          )}>
            <div className="flex items-center gap-2 mb-2">
              {twoFactorEnabled ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">Enabled</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-amber-400">Disabled</span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-400">Two-factor auth</p>
          </div>
          
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Verified</span>
            </div>
            <p className="text-xs text-gray-400">Email verified</p>
          </div>
        </div>
      </Card>
      
      {/* Two-Factor Authentication */}
      <Card>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Two-Factor Authentication</h3>
              <p className="text-sm text-gray-400 mt-1">
                Add an extra layer of security to your account using an authenticator app.
              </p>
            </div>
          </div>
          
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={twoFactorEnabled}
              onChange={() => setTwoFactorEnabled(!twoFactorEnabled)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-100 rounded-full peer peer-checked:bg-brand-500 transition-colors">
              <div className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
                twoFactorEnabled && 'translate-x-5'
              )} />
            </div>
          </label>
        </div>
      </Card>
      
      {/* Change Password */}
      <Card>
        <CardHeader
          title="Change Password"
          subtitle="Update your password regularly for better security"
        />
        
        <div className="mt-4 space-y-4 max-w-md">
          <Input
            label="Current Password"
            type="password"
            placeholder="••••••••"
          />
          <Input
            label="New Password"
            type="password"
            placeholder="••••••••"
          />
          <Input
            label="Confirm New Password"
            type="password"
            placeholder="••••••••"
          />
          <Button>Update Password</Button>
        </div>
      </Card>
      
      {/* Active Sessions */}
      <Card>
        <CardHeader
          title="Active Sessions"
          subtitle="Manage devices that are logged into your account"
          action={
            <Button variant="ghost" size="sm" className="text-red-400">
              Revoke All
            </Button>
          }
        />
        
        <div className="mt-4 space-y-3">
          {PLACEHOLDER_SESSIONS.map((session) => (
            <div
              key={session.id}
              className={cn(
                'p-4 rounded-xl border flex items-center justify-between',
                session.current
                  ? 'bg-brand-500/5 border-brand-500/20'
                  : 'bg-surface-100 border-glass-border'
              )}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-surface-50 flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{session.device}</span>
                    {session.current && (
                      <Badge variant="brand" size="sm">Current</Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {session.ip} • {session.location}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Last active: {formatTime(session.lastActive, 'full')}
                  </div>
                </div>
              </div>
              
              {!session.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRevokeModal(session.id)}
                  className="text-red-400"
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
      
      {/* API Keys — feature-flag gated */}
      {isEnabled('ENABLE_API_KEYS') && (
        <Card>
          <CardHeader
            title="API Keys"
            subtitle="Manage API keys for programmatic access"
            action={<Button size="sm">Create New Key</Button>}
          />
          
          <div className="mt-4 p-6 rounded-xl bg-surface-100 border border-glass-border text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-50 flex items-center justify-center mx-auto mb-3">
              <Key className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-sm text-gray-400">No API keys created yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Create an API key to access the Crypto4Pro API
            </p>
          </div>
        </Card>
      )}
    </>
  );
}

// Profile Settings Component
function ProfileSettings() {
  return (
    <Card>
      <CardHeader
        title="Profile Information"
        subtitle="Update your personal details"
      />
      
      <div className="mt-6 space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <Button variant="secondary" size="sm">Upload Photo</Button>
            <p className="text-xs text-gray-500 mt-1">JPG, PNG or GIF. Max 2MB.</p>
          </div>
        </div>
        
        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
          <Input label="Username" defaultValue="johndoe" />
          <Input label="Display Name" defaultValue="John Doe" />
          <Input label="Email" type="email" defaultValue="john@example.com" />
          <Input label="Phone" type="tel" placeholder="+1 (555) 000-0000" />
        </div>
        
        <div className="pt-4 border-t border-glass-border">
          <Button>Save Changes</Button>
        </div>
      </div>
    </Card>
  );
}

// Notification Settings Component
function NotificationSettings() {
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    trades: true,
    price: false,
    news: true,
    security: true,
  });
  
  const toggle = (key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  return (
    <Card>
      <CardHeader
        title="Notification Preferences"
        subtitle="Choose what notifications you receive"
      />
      
      <div className="mt-6 space-y-6 divide-y divide-glass-border">
        {/* Channels */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300">Channels</h4>
          
          <NotificationRow
            title="Email Notifications"
            description="Receive notifications via email"
            checked={notifications.email}
            onChange={() => toggle('email')}
          />
          
          <NotificationRow
            title="Push Notifications"
            description="Receive push notifications on your devices"
            checked={notifications.push}
            onChange={() => toggle('push')}
          />
        </div>
        
        {/* Types */}
        <div className="pt-6 space-y-4">
          <h4 className="text-sm font-medium text-gray-300">Types</h4>
          
          <NotificationRow
            title="Trade Confirmations"
            description="Get notified when your orders are filled"
            checked={notifications.trades}
            onChange={() => toggle('trades')}
          />
          
          <NotificationRow
            title="Price Alerts"
            description="Get notified when prices reach your targets"
            checked={notifications.price}
            onChange={() => toggle('price')}
          />
          
          <NotificationRow
            title="News & Updates"
            description="Stay updated with market news and platform updates"
            checked={notifications.news}
            onChange={() => toggle('news')}
          />
          
          <NotificationRow
            title="Security Alerts"
            description="Get notified about security-related events"
            checked={notifications.security}
            onChange={() => toggle('security')}
          />
        </div>
      </div>
    </Card>
  );
}

function NotificationRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-surface-100 rounded-full peer peer-checked:bg-brand-500 transition-colors">
          <div className={cn(
            'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform',
            checked && 'translate-x-5'
          )} />
        </div>
      </label>
    </div>
  );
}

// Appearance Settings Component
function AppearanceSettings() {
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  
  return (
    <Card>
      <CardHeader
        title="Appearance"
        subtitle="Customize how Crypto4Pro looks"
      />
      
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
              <p className="text-xs text-gray-400 mt-1">
                We&apos;re currently optimizing the light theme for the best experience.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

