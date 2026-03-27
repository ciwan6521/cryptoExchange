'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Header, Sidebar } from '@/components/layout';

export default function PrivacyPolicyPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="py-6 border-b border-glass-border">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-display font-bold text-white mb-1">Privacy Policy</h1>
              <p className="text-gray-400 text-sm">
                Crypto4Pro — Last updated: March 2026
              </p>
            </motion.div>
          </div>

          <article className="py-8 space-y-10 text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Information We Collect</h2>
              <p className="text-gray-400 mb-4">
                We collect information you provide when you register, complete verification, trade, contact support, or use our services—such as name, contact details, government-issued identification where required, financial information, and device or session data. We also collect technical data including IP address, browser type, and usage logs to operate and secure the Platform.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">How We Use Information</h2>
              <p className="text-gray-400 mb-4">
                We use your information to provide and improve our services, process transactions, comply with legal and regulatory obligations (including anti-money laundering and sanctions screening), detect and prevent fraud, communicate with you about your account and security, and analyze usage in aggregated or de-identified form. We do not sell your personal information.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Data Retention</h2>
              <p className="text-gray-400 mb-4">
                We retain personal data for as long as needed to fulfill the purposes described in this policy, meet legal, tax, and regulatory requirements, and resolve disputes. Retention periods may vary by data category and jurisdiction. When retention is no longer required, we delete or anonymize information in accordance with our internal policies and applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Cookies</h2>
              <p className="text-gray-400 mb-4">
                We use cookies and similar technologies to maintain sessions, remember preferences, measure performance, and enhance security. You can control cookies through your browser settings; disabling certain cookies may limit functionality of the Platform. Essential cookies required for security and core features may not be optional.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Third-Party Services</h2>
              <p className="text-gray-400 mb-4">
                We may share information with service providers who assist with hosting, analytics, identity verification, payment processing, or communications, subject to contractual safeguards. Some providers may process data in other countries. We may also disclose information when required by law, to protect rights and safety, or in connection with a business transfer as permitted by law.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Security</h2>
              <p className="text-gray-400 mb-4">
                We implement administrative, technical, and organizational measures designed to protect personal data against unauthorized access, alteration, disclosure, or destruction. No method of transmission or storage is completely secure; you should use strong passwords, enable two-factor authentication where available, and report suspicious activity promptly.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Your Rights</h2>
              <p className="text-gray-400 mb-4">
                Depending on your location, you may have rights to access, correct, delete, or restrict processing of your personal data, to object to certain processing, or to data portability. You may withdraw consent where processing is consent-based, subject to legal exceptions. To exercise these rights, contact us through the channels provided on the Platform. You may also lodge a complaint with a supervisory authority where applicable.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Changes to Policy</h2>
              <p className="text-gray-400">
                We may update this Privacy Policy to reflect changes in our practices, technology, or legal requirements. We will post the revised policy with an updated effective date and, where appropriate, notify you by email or through the Platform. Continued use after the effective date constitutes acceptance of the updated policy where permitted by law.
              </p>
            </section>
          </article>
        </div>
      </main>
    </div>
  );
}
