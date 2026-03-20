'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, Check, X, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useAdminStore } from '@/stores/admin-store';
import { ApiError } from '@/lib/api';

// ============================================
// Register Page
// New user registration with validation
// ============================================

const passwordRequirements = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
  { label: 'One special character', test: (p: string) => /[!@#$%^&*]/.test(p) },
];

// Stricter email regex — requires proper TLD
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
const USERNAME_MAX_LENGTH = 20;

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const { registrationEnabled } = useAdminStore((s) => s.systemFlags);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Focus management refs
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Auto-focus on step change
  useEffect(() => {
    if (step === 1) emailRef.current?.focus();
    if (step === 2) passwordRef.current?.focus();
  }, [step]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    const email = formData.email.trim();
    const username = formData.username.trim();

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!EMAIL_REGEX.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!username) {
      newErrors.username = 'Username is required';
    } else if (username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (username.length > USERNAME_MAX_LENGTH) {
      newErrors.username = `Username must be at most ${USERNAME_MAX_LENGTH} characters`;
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      newErrors.username = 'Username can only contain letters, numbers, and underscores';
    } else if (/^_|_$/.test(username)) {
      newErrors.username = 'Username cannot start or end with an underscore';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else {
      const failedReqs = passwordRequirements.filter(req => !req.test(formData.password));
      if (failedReqs.length > 0) {
        newErrors.password = 'Password does not meet requirements';
      }
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.agreeTerms) {
      newErrors.agreeTerms = 'You must agree to the terms';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (!registrationEnabled) return;
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registrationEnabled) return;

    if (!validateStep2()) return;

    setIsLoading(true);

    try {
      await register({
        email: formData.email.trim(),
        username: formData.username.trim(),
        password: formData.password,
      });
      router.push('/dashboard');
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.detail : 'Registration failed. Please try again.';
      setErrors({ form: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* Mobile logo */}
      <div className="lg:hidden mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2">
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

      {/* Registration disabled banner */}
      {!registrationEnabled && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Registration Temporarily Disabled</p>
            <p className="text-xs text-gray-500 mt-0.5">New account registration is currently unavailable. Please try again later.</p>
          </div>
        </div>
      )}

      {/* Backend error banner */}
      {errors.form && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {errors.form}
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className="flex-1 h-1 rounded-full bg-brand-500" />
        <div className={cn(
          'flex-1 h-1 rounded-full transition-colors',
          step >= 2 ? 'bg-brand-500' : 'bg-surface-100'
        )} />
      </div>

      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-white mb-2">
          {step === 1 ? 'Create your account' : 'Set your password'}
        </h2>
        <p className="text-gray-400">
          {step === 1
            ? 'Start trading in under 5 minutes'
            : 'Choose a strong password to secure your account'}
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {step === 1 ? (
          <>
            <Input
              ref={emailRef}
              label="Email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              leftIcon={<Mail className="w-4 h-4" />}
              autoComplete="email"
              maxLength={254}
            />

            <Input
              label="Username"
              name="username"
              type="text"
              placeholder="your_username"
              value={formData.username}
              onChange={handleChange}
              error={errors.username}
              leftIcon={<User className="w-4 h-4" />}
              hint="This will be your public display name"
              autoComplete="username"
            />

            <Button
              type="button"
              fullWidth
              size="lg"
              onClick={handleContinue}
              icon={<ArrowRight className="w-5 h-5" />}
              iconPosition="right"
            >
              Continue
            </Button>
          </>
        ) : (
          <>
            <div>
              <Input
                ref={passwordRef}
                label="Password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                error={errors.password}
                leftIcon={<Lock className="w-4 h-4" />}
                autoComplete="new-password"
                maxLength={128}
              />

              {/* Password strength indicator */}
              {formData.password && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 space-y-2"
                >
                  {passwordRequirements.map((req) => {
                    const passed = req.test(formData.password);
                    return (
                      <div
                        key={req.label}
                        className={cn(
                          'flex items-center gap-2 text-xs transition-colors',
                          passed ? 'text-green-400' : 'text-gray-500'
                        )}
                      >
                        {passed ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                        {req.label}
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </div>

            <Input
              label="Confirm Password"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              error={errors.confirmPassword}
              leftIcon={<Lock className="w-4 h-4" />}
              autoComplete="new-password"
            />

            {/* Terms checkbox */}
            <label className={cn(
              'flex items-start gap-3 cursor-pointer',
              errors.agreeTerms && 'text-red-400'
            )}>
              <input
                type="checkbox"
                name="agreeTerms"
                checked={formData.agreeTerms}
                onChange={handleChange}
                className="mt-1 w-4 h-4 rounded border-glass-border bg-surface-100 text-brand-500 focus:ring-brand-500/20"
              />
              <span className="text-sm text-gray-400">
                I agree to the{' '}
                <Link href="/terms" className="text-brand-400 hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-brand-400 hover:underline">
                  Privacy Policy
                </Link>
              </span>
            </label>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={isLoading}
                icon={<ArrowRight className="w-5 h-5" />}
                iconPosition="right"
              >
                Create Account
              </Button>
            </div>
          </>
        )}
      </form>

      {/* Login link */}
      <p className="mt-8 text-center text-sm text-gray-400">
        Already have an account?{' '}
        <Link
          href="/auth/login"
          className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
        >
          Sign in
        </Link>
      </p>

      {/* Referral notice */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 p-4 rounded-lg bg-brand-500/10 border border-brand-500/20"
        >
          <p className="text-sm text-brand-400">
            🎁 New users get <span className="font-semibold">10% off trading fees</span> for the first 30 days!
          </p>
        </motion.div>
      )}
    </div>
  );
}

