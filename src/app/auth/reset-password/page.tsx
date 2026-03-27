'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { Lock, CheckCircle, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { authApi, ApiError } from '@/lib/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-white mb-2">Invalid Link</h2>
        <p className="text-gray-400 mb-6">This reset link is invalid or has expired.</p>
        <Link href="/auth/forgot-password">
          <Button>Request New Link</Button>
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-white mb-2">Password Reset</h2>
        <p className="text-gray-400 mb-6">Your password has been reset. You can now log in.</p>
        <Link href="/auth/login">
          <Button>Go to Login</Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setIsLoading(true);
    setError('');

    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Reset failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="lg:hidden mb-8 text-center">
        <Link href="/" className="inline-flex items-center">
          <Image src="/Crypto4pro.png" alt="Crypto4Pro" width={160} height={45} className="object-contain" style={{ width: 'auto', height: '36px' }} priority />
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-white mb-2">Set New Password</h2>
        <p className="text-gray-400">Choose a strong password for your account.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="New Password"
          name="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          leftIcon={<Lock className="w-4 h-4" />}
          autoComplete="new-password"
        />
        <Input
          label="Confirm Password"
          name="confirm"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(''); }}
          leftIcon={<Lock className="w-4 h-4" />}
          autoComplete="new-password"
        />
        <Button type="submit" fullWidth size="lg" loading={isLoading}>
          Reset Password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-400">
        <Link href="/auth/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
          <ArrowLeft className="w-3 h-3 inline mr-1" />
          Back to Login
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-400">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
