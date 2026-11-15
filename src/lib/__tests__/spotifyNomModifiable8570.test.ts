/**
 * tune-server-rust#8570 / #8565 (fil forum 2778, Jon) — le nom du récepteur
 * Spotify Connect saisi avant l'activation était ignoré par le serveur, et
 * le champ disparaissait une fois le récepteur actif : impossible de le
 * corriger. Décision de Bertrand (12/11/2026) : le champ « Nom affiché »
 * reste modifiable à tout moment (le serveur relance librespot sous le
 * nouveau nom), avec une aide qui prévient qu'un nouvel appareil apparaît
 * dans l'application Spotify.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const source = readFileSync(resolve(process.cwd(), 'src/components/v2/SettingsV2.svelte'), 'utf-8')
  .replace(/<!--[\s\S]*?-->/g, '');

describe('#8570 — le nom du récepteur Spotify Connect se change à tout moment', () => {
  it('🔴 la ligne « Nom affiché » n’est plus réservée au récepteur désactivé', () => {
    const debut = source.indexOf('{#if !spc?.enabled}');
    expect(debut).toBeGreaterThan(0);
    const fin = source.indexOf('{/if}', debut);
    const ligne = source.indexOf('data-reglage="spotify-nom"');
    expect(ligne).toBeGreaterThan(0);
    expect(ligne > debut && ligne < fin, 'la ligne du nom est hors du bloc « désactivé »').toBe(false);
  });

  it('🔴 un nom changé, récepteur actif, part au serveur', () => {
    expect(source).toMatch(/bind:value=\{spcName\}[\s\S]{0,80}onchange=\{renommerSpc\}/);
    expect(source).toMatch(/async function renommerSpc\(\)[\s\S]{0,400}api\.enableSpotifyConnect\(/);
    // Un nom vidé revient au nom par défaut : '' part, pas null (qui garde l'ancien).
    expect(source).toContain('api.enableSpotifyConnect(spcZone, spcName.trim());');
  });

  it('l’aide et l’erreur de session existent dans les quinze langues', () => {
    for (const langue of ONZE_LANGUES) {
      for (const cle of ['settings.spotifyNameChangeHint', 'settings.spotifySessionZoneMissing', 'settings.spotifyPremiumRequired']) {
        expect(dictionnaire(langue)[cle], `${cle} en ${langue}`).toBeTruthy();
      }
    }
    expect(source).toContain("$t('settings.spotifyNameChangeHint' as any)");
    expect(source).toContain('erreurDeSessionSpotify(code,');
    // Compte gratuit : un message clair, pas un silence.
    expect(source).toContain("spc?.receiver_error_code === 'spotify_premium_required'");
  });
});
