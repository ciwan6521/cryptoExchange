'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Header, Sidebar } from '@/components/layout';

export default function TermsOfServicePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="py-6 border-b border-glass-border">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-display font-bold text-white mb-1">Terms of Service</h1>
              <p className="text-gray-400 text-sm">
                Crypto4Pro — Last updated: March 2026
              </p>
            </motion.div>
          </div>

          <article className="py-8 space-y-10 text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Acceptance of Terms</h2>
              <p className="text-gray-400 mb-4">
                By accessing or using Crypto4Pro (&quot;the Platform,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service. If you do not agree, you must not use the Platform. We may update these terms from time to time; continued use after changes constitutes acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Eligibility</h2>
              <p className="text-gray-400 mb-4">
                You must be at least 18 years of age (or the age of majority in your jurisdiction) and have the legal capacity to enter into a binding agreement. You represent that you are not located in, or a resident of, any jurisdiction where use of the Platform would violate applicable law. You are solely responsible for ensuring that your use of Crypto4Pro complies with the laws of your country or region.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Account Registration</h2>
              <p className="text-gray-400 mb-4">
                You must provide accurate, complete, and current information when registering. You are responsible for safeguarding your credentials and for all activity under your account. You must notify us promptly of any unauthorized access. We may require identity verification, enhanced due diligence, or suspension of accounts that appear fraudulent, non-compliant, or high-risk.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Trading Rules</h2>
              <p className="text-gray-400 mb-4">
                Orders placed on Crypto4Pro are subject to our matching engine, risk controls, and market rules. All trades are final once executed, subject to applicable law and our policies on errors, outages, or market disruption. You acknowledge that digital asset markets are volatile and that prices may change rapidly. You are solely responsible for your trading decisions.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Fees</h2>
              <p className="text-gray-400 mb-4">
                Trading, withdrawal, and other fees are described on our Fee Schedule and may change with notice as permitted by these terms. Fees are deducted as disclosed at the time of the relevant transaction. Failure to maintain sufficient balances may result in rejected orders or delayed withdrawals.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Prohibited Activities</h2>
              <p className="text-gray-400 mb-4">
                You may not use Crypto4Pro for money laundering, terrorist financing, fraud, market manipulation, unauthorized automated access, or any illegal purpose. You may not circumvent security, abuse APIs, impersonate others, or interfere with the Platform. We may investigate violations and cooperate with law enforcement and regulators.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Disclaimers</h2>
              <p className="text-gray-400 mb-4">
                The Platform and all services are provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted or error-free operation. Digital assets involve substantial risk of loss; past performance does not indicate future results.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Limitation of Liability</h2>
              <p className="text-gray-400 mb-4">
                To the fullest extent permitted by law, Crypto4Pro and its affiliates, officers, and employees shall not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill, arising from your use of the Platform. Our aggregate liability for any claim relating to the services shall not exceed the fees you paid to us in the twelve months preceding the claim, except where prohibited by law.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Governing Law</h2>
              <p className="text-gray-400">
                These terms are governed by the laws designated in your account agreement or, where not specified, by the laws applicable to Crypto4Pro&apos;s operating entity, without regard to conflict-of-law principles. Disputes shall be resolved in the courts or forums specified in your agreement, or as otherwise required by applicable regulation.
              </p>
            </section>
          </article>
        </div>
      </main>
    </div>
  );
}
