'use client';

import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, AlertCircle, Loader2, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { authApi, ApiError } from '@/lib/api';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

function LinkVerifyFallback() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    authApi.verifyEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('Your email has been verified successfully!');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof ApiError ? err.detail : 'Verification failed');
      });
  }, [token]);

  if (status === 'loading') return <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto" />;
  if (status === 'success') return (
    <div className="text-center">
      <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
      <p className="text-white font-semibold mb-2">Email Verified</p>
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  );
  return (
    <div className="text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
      <p className="text-white font-semibold mb-2">Verification Failed</p>
      <p className="text-gray-400 text-sm">{message}</p>
    </div>
  );
}

function OTPInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusInput = (index: number) => {
    if (index >= 0 && index < CODE_LENGTH) {
      inputRefs.current[index]?.focus();
    }
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];

    if (value.length > 1) {
      const chars = value.slice(0, CODE_LENGTH - index).split('');
      chars.forEach((char, i) => {
        if (index + i < CODE_LENGTH) {
          newDigits[index + i] = char;
        }
      });
      setDigits(newDigits);
      const nextIndex = Math.min(index + chars.length, CODE_LENGTH - 1);
      focusInput(nextIndex);
      const full = newDigits.join('');
      if (full.length === CODE_LENGTH && newDigits.every(d => d !== '')) {
        onComplete(full);
      }
      return;
    }

    newDigits[index] = value;
    setDigits(newDigits);

    if (value && index < CODE_LENGTH - 1) {
      focusInput(index + 1);
    }

    const full = newDigits.join('');
    if (full.length === CODE_LENGTH && newDigits.every(d => d !== '')) {
      onComplete(full);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      focusInput(index - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!paste) return;

    const newDigits = [...digits];
    paste.split('').forEach((char, i) => {
      if (i < CODE_LENGTH) newDigits[i] = char;
    });
    setDigits(newDigits);
    focusInput(Math.min(paste.length, CODE_LENGTH - 1));

    const full = newDigits.join('');
    if (full.length === CODE_LENGTH && newDigits.every(d => d !== '')) {
      onComplete(full);
    }
  };

  useEffect(() => {
    focusInput(0);
  }, []);

  return (
    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-12 h-14 text-center text-xl font-bold rounded-xl bg-[#111317] border border-[#1f2937] text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}

function VerifyEmailCodeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleCodeComplete = useCallback(async (code: string) => {
    setStatus('verifying');
    setError('');
    try {
      await authApi.verifyEmailCode(code);
      setStatus('success');
      setTimeout(() => router.push('/kyc'), 1500);
    } catch (err) {
      setStatus('error');
      setError(err instanceof ApiError ? err.detail : 'Verification failed. Please try again.');
    }
  }, [router]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      await authApi.resendVerificationCode();
      setCooldown(RESEND_COOLDOWN);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  }, [cooldown, resending]);

  if (token) {
    return <LinkVerifyFallback />;
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-white mb-2">Email Verified!</h2>
        <p className="text-gray-400 mb-4">Redirecting to identity verification...</p>
        <Loader2 className="w-5 h-5 text-brand-400 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-6">
        <Mail className="w-8 h-8 text-brand-400" />
      </div>

      <h2 className="text-2xl font-display font-bold text-white mb-2">Verify Your Email</h2>
      <p className="text-gray-400 mb-8">
        We sent a 6-digit verification code to your email. Enter it below to verify your account.
      </p>

      <OTPInput onComplete={handleCodeComplete} />

      {status === 'verifying' && (
        <div className="flex items-center justify-center gap-2 mt-6 text-brand-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Verifying...</span>
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-center gap-2 justify-center text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-8 pt-6 border-t border-[#1f2937]">
        <p className="text-gray-500 text-sm mb-3">Didn&apos;t receive the code?</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="gap-2"
        >
          {resending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
        </Button>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-400">Loading...</div>}>
      <VerifyEmailCodeContent />
    </Suspense>
  );
}
