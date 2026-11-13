/**
 * tune-server-rust#8580 — `session_error` du récepteur Spotify Connect porte
 * des codes stables : `exposed_zone_missing`, `zone_cap_reached` (plafond de
 * zones de l'offre gratuite), `parental_refused` (contrôle parental). L'écran
 * les traduit dans les quinze langues ; un autre motif passe tel quel.
 */
import { describe, it, expect } from 'vitest';
import { CLES_ERREUR_SESSION_SPOTIFY, erreurDeSessionSpotify } from '../erreurSessionSpotify';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

describe('#8580 — erreur de session Spotify Connect traduite', () => {
  it('🔴 les trois codes stables donnent leur phrase, dans les quinze langues', () => {
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const [code, cle] of Object.entries(CLES_ERREUR_SESSION_SPOTIFY)) {
        const phrase = erreurDeSessionSpotify(code, (k) => d[k]);
        expect(phrase, `${code} en ${langue}`).toBeTruthy();
        expect(phrase, `${code} en ${langue}`).toBe(d[cle]);
        expect(phrase).not.toBe(code);
      }
    }
    expect(Object.keys(CLES_ERREUR_SESSION_SPOTIFY)).toEqual(
      expect.arrayContaining(['exposed_zone_missing', 'zone_cap_reached', 'parental_refused']),
    );
  });

  it('contre-épreuve : un motif inconnu passe tel quel', () => {
    expect(erreurDeSessionSpotify('sortie absente', (k) => `T:${k}`)).toBe('sortie absente');
    expect(erreurDeSessionSpotify('free_zone_cap:2:1', (k) => `T:${k}`)).toBe('free_zone_cap:2:1');
  });
});
