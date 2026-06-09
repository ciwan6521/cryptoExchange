'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, ArrowRight, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore } from '@/stores/admin-store';
import { adminAuthApi, AdminApiError } from '@/lib/admin-api';

// ============================================
// Admin Login Page
// Separate auth flow from user login.
// Supports real 2FA (TOTP) verification.
// Token is set as httpOnly cookie by backend.
// ============================================

export default function AdminLoginPage() {
  const router = useRouter();
  const { adminLogin, set2FAPending, adminLogout } = useAdminStore();

  // Clear stale persisted admin session so layout hook order stays stable
  useEffect(() => {
    adminLogout();
  }, [adminLogout]);

  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await adminAuthApi.login({ email: email.trim().toLowerCase(), password });

      // Login succeeded — httpOnly cookie is set by backend
      const adminUser = {
        id: res.admin.id,
        email: res.admin.email,
        name: res.admin.username,
        role: res.admin.role as any,
        twoFactorEnabled: res.admin.totp_enabled,
        lastLogin: Date.now(),
      };
      adminLogin(adminUser);
      router.push('/admin');
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.detail : 'Login failed';
      // If backend says TOTP required, show 2FA step
      if (msg === 'TOTP code required') {
        set2FAPending(true);
        setStep('2fa');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!/^\d{6}$/.test(twoFactorCode)) {
      setError('Enter a valid 6-digit code');
      setLoading(false);
      return;
    }

    try {
      // Re-send login with TOTP code — backend verifies
      const res = await adminAuthApi.login({
        email: email.trim().toLowerCase(),
        password,
        totp_code: twoFactorCode,
      });

      const adminUser = {
        id: res.admin.id,
        email: res.admin.email,
        name: res.admin.username,
        role: res.admin.role as any,
        twoFactorEnabled: res.admin.totp_enabled,
        lastLogin: Date.now(),
      };
      adminLogin(adminUser);
      router.push('/admin');
    } catch (err) {
      const msg = err instanceof AdminApiError ? err.detail : 'Verification failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
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
          <p className="text-xs text-gray-600 mt-1">Crypto4Pro — Restricted Access</p>
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
                  placeholder="admin@crypto4.io"
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
      </div>
    </div>
  );
}
