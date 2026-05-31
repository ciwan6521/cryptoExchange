import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'T4PRO Token ICO',
  description:
    'Official T4PRO token sale page. Join the Crypto4Pro ecosystem — trading fee discounts, staking boosts, governance and more.',
  openGraph: {
    title: 'T4PRO Token ICO | Crypto4Pro',
    description: 'The native utility token of Crypto4Pro. Join our community on Telegram, Twitter and Instagram.',
  },
};

export default function T4ProIcoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
