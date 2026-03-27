'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Chrome, Shield } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';

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
      
      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-glass-border" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 text-gray-500 bg-surface-500">
            Or continue with
          </span>
        </div>
      </div>
      
      {/* Social login */}
      <div className="grid grid-cols-2 gap-4">
        <Button variant="secondary" className="gap-2">
          <Chrome className="w-4 h-4" />
          Google
        </Button>
        <Button variant="secondary" className="gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.26.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
          </svg>
          GitHub
        </Button>
      </div>
      
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

