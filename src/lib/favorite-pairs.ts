const STORAGE_KEY = 'favorite-pairs';

export function getFavoritePairs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isFavoritePair(symbol: string): boolean {
  return getFavoritePairs().includes(symbol);
}

export function toggleFavoritePair(symbol: string): string[] {
  const current = getFavoritePairs();
  const next = current.includes(symbol)
    ? current.filter((s) => s !== symbol)
    : [...current, symbol];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
