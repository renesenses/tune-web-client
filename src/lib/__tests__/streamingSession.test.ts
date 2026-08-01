/**
 * Tests for expired-session detection in the streaming services store.
 *
 * The server drops a streaming token once the provider rejects it, so
 * `authenticated` flips to false with no user action behind it. The store is
 * the single place that notices, and getting the edges wrong is what makes a
 * prompt either miss its moment or nag: a first load must not look like an
 * expiry, and a service the user signed out of deliberately must stay quiet.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';

import {
  expiredStreamingSession,
  streamingServices,
} from '../stores/streaming';

const connected = { enabled: true, authenticated: true, username: 'JeanPhil' };
const dropped = { enabled: true, authenticated: false, username: 'JeanPhil' };

describe('expired streaming session detection', () => {
  beforeEach(() => {
    // Wipe both the store and the memory of the previous snapshot.
    streamingServices.set({});
    expiredStreamingSession.set(null);
  });

  it('flags a service whose session drops while connected', () => {
    streamingServices.set({ qobuz: connected });
    streamingServices.set({ qobuz: dropped });

    expect(get(expiredStreamingSession)).toEqual({
      service: 'qobuz',
      username: 'JeanPhil',
    });
  });

  it('stays quiet on the first snapshot', () => {
    // Opening the app on a service that was never signed in is not an expiry.
    streamingServices.set({ qobuz: { enabled: true, authenticated: false } });

    expect(get(expiredStreamingSession)).toBeNull();
  });

  it('ignores a disabled service', () => {
    streamingServices.set({ qobuz: connected });
    streamingServices.set({ qobuz: { ...dropped, enabled: false } });

    expect(get(expiredStreamingSession)).toBeNull();
  });

  it('keeps the account name when the server stops sending it', () => {
    streamingServices.set({ qobuz: connected });
    streamingServices.set({ qobuz: { enabled: true, authenticated: false } });

    expect(get(expiredStreamingSession)?.username).toBe('JeanPhil');
  });

  it('clears itself once the service is authenticated again', () => {
    streamingServices.set({ qobuz: connected });
    streamingServices.set({ qobuz: dropped });
    expect(get(expiredStreamingSession)).not.toBeNull();

    streamingServices.set({ qobuz: connected });
    expect(get(expiredStreamingSession)).toBeNull();
  });

  it('leaves another service’s prompt alone when a different one reconnects', () => {
    streamingServices.set({ qobuz: connected, tidal: connected });
    streamingServices.set({ qobuz: dropped, tidal: dropped });
    // Tidal was flagged last; reconnecting Qobuz must not dismiss it.
    streamingServices.set({ qobuz: connected, tidal: dropped });

    expect(get(expiredStreamingSession)?.service).toBe('tidal');
  });

  it('does not fire for a service that disappears from the payload', () => {
    streamingServices.set({ qobuz: connected });
    streamingServices.set({});

    expect(get(expiredStreamingSession)).toBeNull();
  });
});
