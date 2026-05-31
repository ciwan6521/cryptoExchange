/**
 * T4PRO token ICO page content & social links.
 * Update URLs via NEXT_PUBLIC_T4PRO_* env vars on deploy.
 */

export interface T4ProSocialLink {
  name: string;
  label: string;
  href: string;
  description: string;
}

function envUrl(key: string, fallback: string): string {
  const val = process.env[key];
  return val && val.trim() !== '' ? val.trim() : fallback;
}

export const t4proIco = {
  token: {
    symbol: 'T4PRO',
    name: 'T4Pro Token',
    tagline: 'The native utility token powering the Crypto4Pro ecosystem',
    network: 'BSC',
    standard: 'BEP-20',
  },
  sale: {
    status: envUrl('NEXT_PUBLIC_T4PRO_ICO_STATUS', 'live') as 'live' | 'upcoming' | 'ended',
    priceUsd: envUrl('NEXT_PUBLIC_T4PRO_ICO_PRICE', '0.05'),
    hardCapUsd: envUrl('NEXT_PUBLIC_T4PRO_ICO_HARD_CAP', '2,500,000'),
    softCapUsd: envUrl('NEXT_PUBLIC_T4PRO_ICO_SOFT_CAP', '500,000'),
    minBuyUsd: envUrl('NEXT_PUBLIC_T4PRO_ICO_MIN_BUY', '50'),
    accepted: ['USDT', 'BNB'],
  },
  social: {
    telegram: envUrl('NEXT_PUBLIC_T4PRO_TELEGRAM', 'https://t.me/crypto4pro'),
    twitter: envUrl('NEXT_PUBLIC_T4PRO_TWITTER', 'https://twitter.com/crypto4pro'),
    instagram: envUrl('NEXT_PUBLIC_T4PRO_INSTAGRAM', 'https://instagram.com/crypto4pro'),
  },
  links: {
    whitepaper: envUrl('NEXT_PUBLIC_T4PRO_WHITEPAPER', ''),
    buyUrl: envUrl('NEXT_PUBLIC_T4PRO_BUY_URL', ''),
  },
} as const;

export const t4proSocialLinks: T4ProSocialLink[] = [
  {
    name: 'telegram',
    label: 'Telegram',
    href: t4proIco.social.telegram,
    description: 'Announcements, whitelist & community support',
  },
  {
    name: 'twitter',
    label: 'Twitter / X',
    href: t4proIco.social.twitter,
    description: 'News, updates & AMA sessions',
  },
  {
    name: 'instagram',
    label: 'Instagram',
    href: t4proIco.social.instagram,
    description: 'Visual updates & behind the scenes',
  },
];

export const t4proUtilities = [
  {
    title: 'Trading Fee Discounts',
    desc: 'Hold T4PRO to unlock reduced maker/taker fees on spot and futures markets.',
  },
  {
    title: 'Staking Boost',
    desc: 'Stake T4PRO alongside other assets for enhanced Earn rewards on Crypto4Pro.',
  },
  {
    title: 'Governance',
    desc: 'Vote on new listings, fee tiers, and ecosystem initiatives.',
  },
  {
    title: 'Launchpad Access',
    desc: 'Priority allocation for upcoming token sales and partner projects.',
  },
];

export const t4proTokenomics = [
  { label: 'Public ICO', percent: 15, color: 'bg-brand-500' },
  { label: 'Ecosystem & Rewards', percent: 35, color: 'bg-emerald-500' },
  { label: 'Liquidity & MM', percent: 20, color: 'bg-blue-500' },
  { label: 'Team & Advisors', percent: 10, color: 'bg-amber-500' },
  { label: 'Treasury', percent: 12, color: 'bg-purple-500' },
  { label: 'Partnerships', percent: 8, color: 'bg-pink-500' },
];

export const t4proRoadmap = [
  { phase: 'Q2 2026', title: 'ICO & TGE', items: ['Public sale opens', 'Initial DEX liquidity', 'Exchange utility live'] },
  { phase: 'Q3 2026', title: 'Ecosystem Growth', items: ['Staking boost program', 'Governance portal', 'CEX integrations'] },
  { phase: 'Q4 2026', title: 'Expansion', items: ['Launchpad v1', 'Cross-chain bridge', 'Mobile app rewards'] },
  { phase: '2027+', title: 'Global Scale', items: ['Institutional products', 'Regional partnerships', 'Deflationary burn mechanism'] },
];

export const t4proSteps = [
  { step: '01', title: 'Join the community', desc: 'Follow our Telegram, Twitter and Instagram for sale dates and whitelist info.' },
  { step: '02', title: 'Verify your account', desc: 'Complete KYC on Crypto4Pro to participate in the token sale when it opens.' },
  { step: '03', title: 'Fund your wallet', desc: 'Deposit USDT or BNB to your Crypto4Pro wallet before the sale window.' },
  { step: '04', title: 'Purchase T4PRO', desc: 'Buy during the ICO period. Tokens are credited to your exchange balance at TGE.' },
];
