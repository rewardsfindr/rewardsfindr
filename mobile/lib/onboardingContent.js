// ─────────────────────────────────────────────
// FIRST-RUN ONBOARDING COPY (pure — unit tested)
// ─────────────────────────────────────────────
import { summarizeSyncCards } from './savedOffers.js';

export const ONBOARDING_PAGES = [
  {
    key: 'value',
    title: 'Never miss the best reward again',
    body: 'RewardsFindr tracks your bank offers and shows which card to use at any store.',
    visual: 'cards',
    cta: 'Next',
  },
  {
    key: 'sync',
    title: 'Sync your bank offers',
    body: 'Securely pull Chase, Amex, Wells Fargo, and Citi offers in the app. No manual entry. We never store your bank password.',
    visual: 'banks',
    cta: 'Next',
  },
  {
    key: 'search',
    title: 'Search any store',
    body: 'Before you shop, search Target, Amazon, gas, or dining — see your best card in seconds.',
    visual: 'search',
    cta: 'Get started',
  },
];

export const CONNECT_BANK_COPY = {
  title: 'Connect a bank to start',
  subtitle: 'Your home screen gets useful once offers are synced. Takes about a minute.',
  chaseCta: 'Sync Chase',
  amexCta: 'Sync Amex',
  skip: 'Skip for now →',
  footnote: 'Capital One, Discover & more coming soon',
};

export function getOnboardingCta(index, pages = ONBOARDING_PAGES) {
  if (index < 0 || index >= pages.length) return null;
  return index >= pages.length - 1 ? pages[index].cta : pages[index].cta;
}

export function nextOnboardingIndex(index, pages = ONBOARDING_PAGES) {
  if (index >= pages.length - 1) return null; // finished → connect-bank
  return index + 1;
}

/**
 * Persist synced-bank metadata using the same Amex phase collapse as Home.
 */
export function buildSyncedBanksUpdate(prev, bank, cardResults, now = Date.now()) {
  const summary = summarizeSyncCards(cardResults);
  const next = { ...(prev || {}) };
  next[bank] = {
    cards: summary.cardCount,
    lastSyncedAt: now,
  };
  return next;
}

export function formatConnectSyncMessage(cardResults) {
  return summarizeSyncCards(cardResults).lines;
}
