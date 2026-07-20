import type { TrackCredit } from '../types';

/**
 * Group a flat list of track credits by their `role` (defaulting to
 * `performer` when a credit carries no role), preserving insertion order
 * within each group. Extracted from LibraryView so it can be unit-tested and
 * reused by the credits UI without pulling in the whole component.
 */
export function groupCreditsByRole(credits: TrackCredit[]): Record<string, TrackCredit[]> {
  const groups: Record<string, TrackCredit[]> = {};
  for (const c of credits) {
    const role = c.role || 'performer';
    if (!groups[role]) groups[role] = [];
    groups[role].push(c);
  }
  return groups;
}

/**
 * The distinct, alphabetically sorted set of instruments mentioned across a
 * track's credits (credits without an instrument are ignored).
 */
export function uniqueInstruments(credits: TrackCredit[]): string[] {
  const set = new Set<string>();
  for (const c of credits) {
    if (c.instrument) set.add(c.instrument);
  }
  return [...set].sort();
}
