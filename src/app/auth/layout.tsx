'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';

// ============================================
// Auth Layout
// Shared layout for login/register pages
// ============================================

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-500 flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-500 to-teal-400" />

        {/* Pattern overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/Crypto4pro.png"
              alt="Crypto4Pro Logo"
              width={180}
              height={50}
              className="object-contain"
              style={{ width: 'auto', height: '48px' }}
              priority
            />
          </Link>

          {/* Main content */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h1 className="text-4xl lg:text-5xl font-display font-bold mb-6">
                Trade the Future
                <br />
                of Finance
              </h1>
              <p className="text-lg text-white/80 max-w-md">
                Join millions of traders worldwide. Access 200+ cryptocurrencies
                with industry-leading security and performance.
              </p>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-12 grid grid-cols-3 gap-8"
            >
              <div>
                <div className="text-3xl font-bold">$128B+</div>
                <div className="text-white/60 text-sm">24h Volume</div>
              </div>
              <div>
                <div className="text-3xl font-bold">5.2M+</div>
                <div className="text-white/60 text-sm">Users</div>
              </div>
              <div>
                <div className="text-3xl font-bold">200+</div>
                <div className="text-white/60 text-sm">Assets</div>
              </div>
            </motion.div>
          </div>

          {/* Footer */}
          <div className="text-sm text-white/60">
            © {new Date().getFullYear()} Crypto4Pro. All rights reserved.
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-teal-300/20 rounded-full blur-[80px]" />
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Top Center Logo */}
        <div className="mb-8">
          <Link href="/">
            <Image
              src="/Crypto4pro.png"
              alt="Crypto4Pro Logo"
              width={200}
              height={56}
              className="object-contain"
              style={{ width: 'auto', height: '50px' }}
              priority
            />
          </Link>
        </div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

