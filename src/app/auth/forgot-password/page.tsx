'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { authApi, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Email is required'); return; }
    setIsLoading(true);
    setError('');

    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : 'Something went wrong';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-white mb-2">Check your email</h2>
        <p className="text-gray-400 mb-6">
          If an account with that email exists, we&apos;ve sent a password reset link.
        </p>
        <Link href="/auth/login">
          <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Login
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="lg:hidden mb-8 text-center">
        <Link href="/" className="inline-flex items-center">
          <Image src="/Crypto4pro.png" alt="Crypto4Pro" width={160} height={45} className="object-contain" style={{ width: 'auto', height: '36px' }} priority />
        </Link>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-white mb-2">Forgot password?</h2>
        <p className="text-gray-400">Enter your email and we&apos;ll send you a reset link.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); }}
          leftIcon={<Mail className="w-4 h-4" />}
          autoComplete="email"
        />

        <Button type="submit" fullWidth size="lg" loading={isLoading}>
          Send Reset Link
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
