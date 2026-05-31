'use client';

import React, { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, Check, X, AlertTriangle, Phone, UserCircle } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useAdminStore } from '@/stores/admin-store';
import { ApiError } from '@/lib/api';

const passwordRequirements = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
  { label: 'One special character', test: (p: string) => /[!@#$%^&*]/.test(p) },
];

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
const USERNAME_MAX_LENGTH = 20;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface-500 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralFromUrl = searchParams.get('ref')?.trim() || '';
  const register = useAuthStore((s) => s.register);
  const { registrationEnabled } = useAdminStore((s) => s.systemFlags);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
    referralCode: referralFromUrl,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const firstNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (referralFromUrl) {
      setFormData(prev => ({ ...prev, referralCode: referralFromUrl }));
    }
  }, [referralFromUrl]);

  useEffect(() => {
    if (step === 1) firstNameRef.current?.focus();
    if (step === 2) emailRef.current?.focus();
    if (step === 3) passwordRef.current?.focus();
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
    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!PHONE_REGEX.test(formData.phone.trim())) {
      newErrors.phone = 'Please enter a valid phone number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
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

  const validateStep3 = () => {
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
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registrationEnabled) return;
    if (!validateStep3()) return;

    setIsLoading(true);
    try {
      await register({
        email: formData.email.trim(),
        username: formData.username.trim(),
        password: formData.password,
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        phone: formData.phone.trim(),
        ...(formData.referralCode.trim() ? { referral_code: formData.referralCode.trim() } : {}),
      });
      router.push('/auth/verify-email');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : 'Registration failed. Please try again.';
      setErrors({ form: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const stepTitles = [
    { title: 'Personal information', subtitle: 'Tell us about yourself' },
    { title: 'Account details', subtitle: 'Set up your login credentials' },
    { title: 'Set your password', subtitle: 'Choose a strong password to secure your account' },
  ];

  const current = stepTitles[step - 1];

  return (
    <div>
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

      {!registrationEnabled && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Registration Temporarily Disabled</p>
            <p className="text-xs text-gray-500 mt-0.5">New account registration is currently unavailable. Please try again later.</p>
          </div>
        </div>
      )}

      {errors.form && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {errors.form}
        </div>
      )}

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className={cn(
            'flex-1 h-1 rounded-full transition-colors',
            step >= s ? 'bg-brand-500' : 'bg-surface-100'
          )} />
        ))}
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-white mb-2">{current.title}</h2>
        <p className="text-gray-400">{current.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Input
                ref={firstNameRef}
                label="First Name"
                name="firstName"
                type="text"
                placeholder="John"
                value={formData.firstName}
                onChange={handleChange}
                error={errors.firstName}
                leftIcon={<UserCircle className="w-4 h-4" />}
                autoComplete="given-name"
                maxLength={100}
              />
              <Input
                label="Last Name"
                name="lastName"
                type="text"
                placeholder="Doe"
                value={formData.lastName}
                onChange={handleChange}
                error={errors.lastName}
                leftIcon={<UserCircle className="w-4 h-4" />}
                autoComplete="family-name"
                maxLength={100}
              />
            </div>

            <Input
              label="Phone Number"
              name="phone"
              type="tel"
              placeholder="+90 555 123 4567"
              value={formData.phone}
              onChange={handleChange}
              error={errors.phone}
              leftIcon={<Phone className="w-4 h-4" />}
              autoComplete="tel"
              maxLength={20}
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
        )}

        {step === 2 && (
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

            <Input
              label="Referral Code (optional)"
              name="referralCode"
              type="text"
              placeholder="Enter referral code"
              value={formData.referralCode}
              onChange={handleChange}
              leftIcon={<User className="w-4 h-4" />}
              hint={referralFromUrl ? 'Referral code applied from invite link' : 'Have a referral code? Enter it here'}
              autoComplete="off"
            />

            <div className="flex gap-3">
              <Button type="button" variant="secondary" size="lg" onClick={() => setStep(1)}>
                Back
              </Button>
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
            </div>
          </>
        )}

        {step === 3 && (
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
                        {passed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
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
                <Link href="/terms" className="text-brand-400 hover:underline">Terms of Service</Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-brand-400 hover:underline">Privacy Policy</Link>
              </span>
            </label>

            <div className="flex gap-3">
              <Button type="button" variant="secondary" size="lg" onClick={() => setStep(2)}>
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

      <p className="mt-8 text-center text-sm text-gray-400">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
          Sign in
        </Link>
      </p>

      {step === 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-8 p-4 rounded-lg bg-brand-500/10 border border-brand-500/20"
        >
          <p className="text-sm text-brand-400">
            New users get <span className="font-semibold">10% off trading fees</span> for the first 30 days!
          </p>
        </motion.div>
      )}
    </div>
  );
}
