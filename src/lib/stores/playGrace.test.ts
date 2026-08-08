import { describe, it, expect, beforeEach } from 'vitest';
import { playPendingUntil, suppressedByPlayGrace } from './zones';

/**
 * The grace window exists so a slow HI-RES pre-transcode reads as "chargement…"
 * rather than a failure (#1146). It must not swallow a failure that will never
 * resolve — the case that cost a full support morning on 8 Aug 2026, where a
 * DAC the account could not open left the UI showing a track advancing in
 * silence.
 */
describe('suppressedByPlayGrace', () => {
  const ZONE = 7;

  beforeEach(() => {
    playPendingUntil.clear();
  });

  it('suppresses a transient error inside the window', () => {
    playPendingUntil.set(ZONE, Date.now() + 30_000);
    expect(suppressedByPlayGrace(ZONE, false)).toBe(true);
  });

  it('never suppresses a fatal error, even inside the window', () => {
    playPendingUntil.set(ZONE, Date.now() + 30_000);
    expect(suppressedByPlayGrace(ZONE, true)).toBe(false);
  });

  it('shows a transient error once the window has closed', () => {
    playPendingUntil.set(ZONE, Date.now() - 1);
    expect(suppressedByPlayGrace(ZONE, false)).toBe(false);
  });

  it('shows an error for a zone that never opened a window', () => {
    expect(suppressedByPlayGrace(ZONE, false)).toBe(false);
  });

  it('shows an error when the zone is unknown', () => {
    expect(suppressedByPlayGrace(null, false)).toBe(false);
    expect(suppressedByPlayGrace(undefined, false)).toBe(false);
  });

  it('defaults to treating an error as transient when fatal is absent', () => {
    playPendingUntil.set(ZONE, Date.now() + 30_000);
    expect(suppressedByPlayGrace(ZONE)).toBe(true);
  });
});
