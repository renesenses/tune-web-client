import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleBanniereEnrichissementApresScan } from '../enrichissementApresScan';

import fr from '../locales/fr';
import en from '../locales/en';


describe('motif d\'enrichissement publié à la fin du scan (#2507)', () => {
  it('rend visible le refus Premium et indique le chemin manuel', () => {
    const key = cleBanniereEnrichissementApresScan({
      started: false,
      skipped_reason: 'premium_required',
    });

    expect(key).toBe('app.scanArtistImagesPremiumSkipped');
    expect(fr[key!]).toContain('Réglages > Bibliothèque');
    expect(en[key!]).toContain('Settings > Library');
  });

  it('distingue un réglage désactivé d\'un refus de licence', () => {
    expect(cleBanniereEnrichissementApresScan({
      started: false,
      skipped_reason: 'disabled_by_setting',
    })).toBe('app.scanArtistImagesDisabled');
  });

  it('n\'invente rien quand la passe a démarré ou quand le serveur est ancien', () => {
    expect(cleBanniereEnrichissementApresScan({ started: true, skipped_reason: null })).toBeNull();
    expect(cleBanniereEnrichissementApresScan(undefined)).toBeNull();
    expect(cleBanniereEnrichissementApresScan({
      started: false,
      skipped_reason: 'future_reason',
    })).toBeNull();
  });

});
