/**
 * Discussion tune-server-rust#8280 — « À découvrir » varie ses raisons.
 *
 * Le serveur rend désormais, à côté de `genre_frequent` et `hasard` :
 * `artiste_possede` (déjà connu du client), `meme_epoque` et `peu_ecoute`.
 * Ce banc garde leur phrase en français et en anglais, leur présence dans
 * les quinze langues, et le silence quand la raison est incomplète.
 */
import { describe, expect, it } from 'vitest';
import { texteRaison } from '../raisonSuggestion';
import { CHARGEURS, type Locale } from '../locales';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const fr = lFr as unknown as Record<string, string>;
const en = lEn as unknown as Record<string, string>;
const tFr = (k: string) => fr[k] ?? k;
const tEn = (k: string) => en[k] ?? k;

describe('#8280 — les nouvelles raisons de « À découvrir »', () => {
  it('rend la même époque et le peu écouté', () => {
    expect(texteRaison({ type: 'meme_epoque', decennie: 1970 }, tFr)).toBe(
      'Même époque que vos écoutes : les années 1970',
    );
    expect(texteRaison({ type: 'meme_epoque', decennie: 1970 }, tEn)).toBe(
      'From the era you play most: the 1970s',
    );
    expect(texteRaison({ type: 'peu_ecoute', ecoutes: 1 }, tFr)).toBe(
      'Peu écouté : 1 écoute, aucune depuis un mois',
    );
    expect(texteRaison({ type: 'peu_ecoute', ecoutes: 3 }, tFr)).toBe(
      'Peu écouté : 3 écoutes, aucune depuis un mois',
    );
    expect(texteRaison({ type: 'peu_ecoute', ecoutes: 2 }, tEn)).toBe(
      'Rarely played: 2 plays, none in the last month',
    );
  });

  it("l'artiste possédé, tel que le serveur le rend pour « À découvrir »", () => {
    expect(texteRaison({ type: 'artiste_possede', artiste: 'Miles Davis', albums: 3 }, tFr)).toBe(
      'Miles Davis : 3 albums dans votre bibliothèque',
    );
  });

  it("se tait plutôt que d'inventer", () => {
    expect(texteRaison({ type: 'meme_epoque' }, tFr)).toBeNull();
    expect(texteRaison({ type: 'meme_epoque', decennie: 1975 }, tFr), 'pas une décennie').toBeNull();
    expect(texteRaison({ type: 'meme_epoque', decennie: '1970' }, tFr)).toBeNull();
    expect(texteRaison({ type: 'peu_ecoute', ecoutes: 0 }, tFr)).toBeNull();
    expect(texteRaison({ type: 'peu_ecoute' }, tFr)).toBeNull();
  });

  it('les trois phrases existent dans les quinze langues, avec leurs marques', async () => {
    const langues = Object.keys(CHARGEURS) as Locale[];
    expect(langues).toHaveLength(15);
    for (const l of langues) {
      const d = (await CHARGEURS[l]()).default as unknown as Record<string, string>;
      expect(d['v2.why.sameEra'], `${l} sameEra`).toContain('{decennie}');
      expect(d['v2.why.rarelyPlayedOne'], `${l} rarelyPlayedOne`).toBeTruthy();
      expect(d['v2.why.rarelyPlayedMany'], `${l} rarelyPlayedMany`).toContain('{n}');
    }
  });
});
