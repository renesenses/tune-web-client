// @vitest-environment jsdom
/**
 * tune-server-rust#8446 — le bandeau du démarrage figé (#5522) s'affichait
 * en français dans une interface en vietnamien (fil 2761). Le serveur porte
 * désormais un code stable (`start_stalled`, `start_stalled_out_of_queue`,
 * `start_stalled_retry_failed`) et ses paramètres (`title`, `seconds`,
 * `cause`) ; le client le traduit.
 *
 * Contre-épreuve : retirer les clés `erreursServeur.start_stalled*` d'une
 * locale fait rougir le contrôle de son dictionnaire (le repli de i18n vers
 * une autre langue masquerait l'oubli au premier test).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { lireEvenementErreur } from '../messageServeur';
import { CHARGEURS, type Locale } from '../locales';

const LOCALES: Locale[] = ['de', 'el', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'nb', 'pl', 'ro', 'sv', 'vi', 'zh'];
const FRANCAIS = "Le morceau n'a pas démarré : « Hello » est resté à 0:00 pendant 8 s. La zone a été arrêtée.";

afterEach(() => { locale.set('fr'); });

describe('#8446 — bandeau du démarrage figé', () => {
  for (const l of LOCALES) {
    it(`${l} : les trois codes sont traduits, titre, durée et cause interpolés`, () => {
      locale.set(l);
      for (const code of ['start_stalled', 'start_stalled_out_of_queue', 'start_stalled_retry_failed']) {
        const lu = lireEvenementErreur(
          { zone_id: 1, fatal: true, error: FRANCAIS, code, params: { title: 'Hello', seconds: 8, cause: 'flux 404' } },
          'erreursServeur.generique',
        );
        expect(lu.message, `${l}/${code}`).not.toBe(get(t)('erreursServeur.generique'));
        expect(lu.message).toContain('Hello');
        expect(lu.message).toContain('8');
        expect(lu.message).not.toMatch(/\{\w+\}/);
        if (code === 'start_stalled_retry_failed') expect(lu.message).toContain('flux 404');
        if (l !== 'fr') expect(lu.message).not.toBe(FRANCAIS);
        expect(lu.detail).toContain(FRANCAIS);
      }
    });
  }

  for (const l of LOCALES) {
    it(`${l} : le dictionnaire porte lui-même les trois clés et leurs paramètres`, async () => {
      const dico = (await CHARGEURS[l]()).default as Record<string, string>;
      for (const code of ['start_stalled', 'start_stalled_out_of_queue', 'start_stalled_retry_failed']) {
        const texte = dico[`erreursServeur.${code}`];
        expect(texte, `${l} : erreursServeur.${code}`).toBeTruthy();
        expect(texte).toContain('{title}');
        expect(texte).toContain('{seconds}');
        if (code === 'start_stalled_retry_failed') expect(texte).toContain('{cause}');
      }
    });
  }
});
