'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Shield } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { isEnabled } from '@/lib/feature-flags';

// ============================================
// Login Page
// User authentication with smooth transitions
// ============================================

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [isLoading, setIsLoading] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    // Clear error on change
    if (errors[e.target.name]) {
      setErrors(prev => ({ ...prev, [e.target.name]: '' }));
    }
  };
  
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    
    try {
      await login({
        email: formData.email,
        password: formData.password,
        totp_code: needs2FA ? totpCode : undefined,
      });
      router.push('/dashboard');
    } catch (err: any) {
      const detail = err?.detail || err?.message || '';
      if (detail === '2FA code required') {
        setNeeds2FA(true);
        setErrors({});
      } else {
        setErrors({ form: detail || 'Login failed. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div>
      {/* Mobile logo */}
      <div className="lg:hidden mb-8 text-center">
        <Link href="/" className="inline-flex items-center">
          <Image
            src="/Crypto4pro.png"
            alt="Crypto4Pro Logo"
            width={160}
            height={45}
            className="object-contain"
            style={{ width: 'auto', height: '36px' }}
            priority
          />
        </Link>
      </div>
      
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-white mb-2">
          Welcome back
        </h2>
        <p className="text-gray-400">
          Enter your credentials to access your account
        </p>
      </div>
      
      {/* Backend error banner */}
      {errors.form && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {errors.form}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          leftIcon={<Mail className="w-4 h-4" />}
          autoComplete="email"
        />
        
        <Input
          label="Password"
          name="password"
          type="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          leftIcon={<Lock className="w-4 h-4" />}
          autoComplete="current-password"
        />
        
        {/* 2FA Code */}
        {needs2FA && (
          <div className="p-4 rounded-lg bg-brand-500/10 border border-brand-500/20">
            <p className="text-sm text-brand-400 mb-3 font-medium">Enter your 2FA code</p>
            <Input
              label="Authentication Code"
              name="totp_code"
              type="text"
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              leftIcon={<Shield className="w-4 h-4" />}
              autoComplete="one-time-code"
            />
          </div>
        )}

        {/* Remember & Forgot */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-glass-border bg-surface-100 text-brand-500 focus:ring-brand-500/20"
            />
            <span className="text-sm text-gray-400">Remember me</span>
          </label>
          <Link
            href="/auth/forgot-password"
            className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            Forgot password?
          </Link>
        </div>
        
        {/* Submit */}
        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={isLoading}
          icon={<ArrowRight className="w-5 h-5" />}
          iconPosition="right"
        >
          Sign In
        </Button>
      </form>
      
      {isEnabled('ENABLE_SOCIAL_LOGIN') && (
        <div className="mt-8">
          <a
            href="/api/oauth/google"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg bg-surface-100 border border-glass-border text-sm font-medium text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </a>
        </div>
      )}
      
      {/* Register link */}
      <p className="mt-8 text-center text-sm text-gray-400">
        Don&apos;t have an account?{' '}
        <Link
          href="/auth/register"
          className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
        >
          Create one now
        </Link>
      </p>
      
      {/* Security notice */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 p-4 rounded-lg bg-surface-100 border border-glass-border"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
            <Lock className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Secure Login</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Your connection is encrypted and your data is never shared.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

