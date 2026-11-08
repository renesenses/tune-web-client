/**
 * tune-server-rust#7840 — le recul à la reprise d'un podcast est borné à
 * 0–60 s (décision du 04/11). Le champ des Réglages refuse 61 et accepte 0
 * et 60, sa borne `max` est 60, et l'aide le dit dans chaque langue.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RECUL_PODCAST_MAX, RECUL_PODCAST_MIN, reculPodcastSaisi } from '../reculPodcast';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

describe('#7840 — recul à la reprise des podcasts borné à 0–60 s', () => {
  it('🔴 la saisie accepte 0 et 60, refuse 61 et 300', () => {
    expect(RECUL_PODCAST_MIN).toBe(0);
    expect(RECUL_PODCAST_MAX).toBe(60);
    expect(reculPodcastSaisi('0')).toBe(0);
    expect(reculPodcastSaisi('10')).toBe(10);
    expect(reculPodcastSaisi('60')).toBe(60);
    expect(reculPodcastSaisi('61'), '61 s dépasse la borne de 60 s').toBeNull();
    expect(reculPodcastSaisi('300'), 'l’ancienne borne de 300 s est refusée').toBeNull();
    expect(reculPodcastSaisi('-1')).toBeNull();
    expect(reculPodcastSaisi('1.5')).toBeNull();
    expect(reculPodcastSaisi('')).toBeNull();
  });

  it('🔴 le champ des Réglages est borné par ces constantes, pas par 300', () => {
    const ecran = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8');
    expect(ecran).toContain('min={RECUL_PODCAST_MIN} max={RECUL_PODCAST_MAX}');
    expect(ecran).toContain('const value = reculPodcastSaisi(raw);');
    expect(ecran).not.toMatch(/max="300"/);
  });

  it.each(ONZE_LANGUES)('🔴 l’aide en %s annonce 60 s et plus 300 s', (code) => {
    const aide = dictionnaire(code)['settings.podcastRewindHint'];
    expect(aide).toMatch(/60/);
    expect(aide).not.toMatch(/300/);
  });
});
