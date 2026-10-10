import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('crossfade : jamais le réglage inerte (#2211)', () => {
  it('aucun écran ne propose le réglage inerte', () => {
    const nowPlaying = read('src/components/partages/NowPlaying.svelte');
    // ÉTENDU le 04/09/2026 : l'écran des Réglages du NOUVEAU client avait été
    // écrit avant cette suppression et reproduisait le réglage inerte. Le
    // garde ne visait que les deux écrans du client actuel, il ne l'a donc pas
    // vu arriver — c'est la fusion des deux lignes qui l'a révélé.
    const settingsV2 = read('src/components/v2/SettingsV2.svelte');

    expect(nowPlaying).not.toContain('toggleCrossfade');
    expect(nowPlaying).not.toContain('setCrossfade');
    expect(settingsV2).not.toContain('settings.crossfadeHint');
    expect(settingsV2).not.toContain('applyCrossfade');
  });
});

/**
 * #2211 — le VRAI fondu enchaîné existe désormais côté serveur, sur la sortie
 * LOCALE seulement : deux pistes décodées superposées, durée de 0 à 12 s.
 * L'ancien garde interdisait toute API vers `/zones/{id}/crossfade` parce que
 * la route mentait (préférence enregistrée, aucun effet). Elle répond
 * maintenant 200 pour une zone locale et un refus motivé ailleurs : l'API
 * revient, sous un nom neuf, avec le contrat neuf (`duration`, 0 = désactivé).
 */
describe('fondu enchaîné de zone locale (#2211)', () => {
  const api = read('src/lib/api.ts');
  const modal = read('src/components/partages/ZoneConfigModal.svelte');

  it("l'API porte le contrat réel : une durée, 0 = désactivé", () => {
    expect(api).toContain('export function getZoneCrossfade(');
    expect(api).toContain('export function setZoneCrossfade(');
    expect(api).toContain('body: JSON.stringify({ duration: durationSeconds })');
    // L'ancien contrat `enabled` (faux succès) ne revient pas.
    expect(api).not.toContain('export function setCrossfade(');
  });

  it('le panneau de zone ne propose le réglage que pour une zone LOCALE', () => {
    const debutLocal = modal.indexOf('{#if zoneLocale}');
    const sinon = modal.indexOf('{:else}', debutLocal);
    const curseur = modal.indexOf("$t('zoneConfig.crossfadeLabel')");
    expect(debutLocal).toBeGreaterThan(-1);
    expect(curseur).toBeGreaterThan(debutLocal);
    expect(curseur).toBeLessThan(sinon);
    // Une seule occurrence : pas de copie hors de la garde locale.
    expect(modal.split("$t('zoneConfig.crossfadeLabel')").length).toBe(2);
    // La lecture du serveur est elle aussi gardée par `zoneLocale`.
    expect(modal).toContain("if (!zoneLocale || zone.id === null || fonduCharge) return;");
  });

  // Décision du 07/10 : une zone locale en mode EXCLUSIF refuse le fondu
  // (501 `crossfade_unavailable_exclusive`). Le curseur est grisé, et l'écran
  // dit « indisponible en mode exclusif ».
  it('en mode exclusif, le curseur est grisé et dit pourquoi', () => {
    expect(modal).toContain('fonduExclusif = r?.exclusive === true;');
    expect(modal).toContain('disabled={fonduSaving || !fonduCharge || fonduExclusif || zone.id === null}');
    expect(modal).toContain("{#if fonduExclusif}<p class=\"zc-note\">{$t('zoneConfig.crossfadeExclusive')}</p>{/if}");
    const fr = read('src/lib/locales/fr.ts');
    expect(fr).toMatch(/"zoneConfig\.crossfadeExclusive": "Indisponible en mode exclusif/);
  });

  it('le curseur va de 0 à 12 s', () => {
    expect(modal).toContain('const FONDU_MAX_S = 12;');
    expect(modal).toMatch(/type="range" min="0" max=\{FONDU_MAX_S\}/);
  });

  it('les onze langues nomment le réglage', () => {
    for (const lang of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu']) {
      const src = read(`src/lib/locales/${lang}.ts`);
      for (const cle of ['crossfadeLabel', 'crossfadeHint', 'crossfadeSeconds', 'crossfadeOff', 'crossfadeExclusive']) {
        expect(src, `${lang} : zoneConfig.${cle}`).toContain(`"zoneConfig.${cle}"`);
      }
    }
  });
});
