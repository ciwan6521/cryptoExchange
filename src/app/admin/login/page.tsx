'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, ArrowRight, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore } from '@/stores/admin-store';
import { adminAuthApi, AdminApiError } from '@/lib/admin-api';

// ============================================
// Admin Login Page
// Separate auth flow from user login.
// Supports 2FA verification step (mock).
// ============================================

export default function AdminLoginPage() {
  const router = useRouter();
  const { adminLogin, addAuditEntry, set2FAPending } = useAdminStore();

  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{ access_token: string; admin: { id: string; email: string; username: string; role: string; totp_enabled: boolean } } | null>(null);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await adminAuthApi.login({ email: email.trim().toLowerCase(), password });

      // If 2FA is enabled, go to 2FA step
      if (res.admin.totp_enabled) {
        setPendingLogin(res);
        set2FAPending(true);
        setStep('2fa');
        setLoading(false);
        return;
      }

      // Direct login — store token + admin profile
      const adminUser = {
        id: res.admin.id,
        email: res.admin.email,
        name: res.admin.username,
        role: res.admin.role as any,
        twoFactorEnabled: res.admin.totp_enabled,
        lastLogin: Date.now(),
        ipAllowlist: [],
      };
      adminLogin(adminUser, res.access_token);
      router.push('/admin');
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.detail : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // TODO: real TOTP verification via backend when implemented
    // For now accept any 6-digit code (backend does not verify TOTP yet)
    if (!/^\d{6}$/.test(twoFactorCode)) {
      setError('Enter a valid 6-digit code');
      setLoading(false);
      return;
    }

    if (pendingLogin) {
      const adminUser = {
        id: pendingLogin.admin.id,
        email: pendingLogin.admin.email,
        name: pendingLogin.admin.username,
        role: pendingLogin.admin.role as any,
        twoFactorEnabled: pendingLogin.admin.totp_enabled,
        lastLogin: Date.now(),
        ipAllowlist: [],
      };
      adminLogin(adminUser, pendingLogin.access_token);
    }
    router.push('/admin');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">Admin Panel</h1>
          <p className="text-xs text-gray-600 mt-1">Nexus Exchange — Restricted Access</p>
        </div>

        {/* Credentials Step */}
        {step === 'credentials' && (
          <form onSubmit={handleCredentials} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@nexus.com"
                  required
                  autoFocus
                  className="w-full h-9 pl-9 pr-3 text-sm bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full h-9 pl-9 pr-3 text-sm bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full h-9 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
                'bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        )}

        {/* 2FA Step */}
        {step === '2fa' && (
          <form onSubmit={handle2FA} className="space-y-3">
            <div className="text-center mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
              </div>
              <p className="text-xs text-gray-400">Enter the 6-digit code from your authenticator app</p>
            </div>

            <div>
              <input
                type="text"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                className="w-full h-12 text-center text-2xl font-mono tracking-[0.5em] bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full h-9 flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
                'bg-amber-500/80 text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Verify'
              )}
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setError(''); set2FAPending(false); }}
              className="w-full text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Back to login
            </button>
          </form>
        )}

        {/* Test accounts hint */}
        <div className="mt-6 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
          <p className="text-[10px] font-medium text-gray-600 mb-2">Test Accounts</p>
          <div className="space-y-1 text-[10px] text-gray-700 font-mono">
            <p>admin@nexus.com / Admin123! <span className="text-red-400">(Super Admin, 2FA)</span></p>
            <p>operator@nexus.com / Operator123!</p>
            <p>finance@nexus.com / Finance123!</p>
            <p>viewer@nexus.com / Viewer123!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
