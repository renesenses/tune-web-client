/**
 * web#3170 — le turc (tr), seizième langue de l'interface.
 *
 * La parité des clés est tenue par `scripts/check-i18n.mjs` (langues
 * découvertes sur disque) ; la présence des formes `one`/`other` par
 * `plurielsCldr8301.test.ts` (qui itère `ONZE_LANGUES`). Ce banc-ci garde ce
 * que ces deux-là ne voient pas : la détection du navigateur, le nom dans le
 * sélecteur, la dictée vocale, le séparateur décimal et la règle turque du
 * nom au singulier après un nombre (« 5 parça », jamais « 5 parçalar »).
 *
 * Contre-épreuve : retirer `tr` de `CHARGEURS` fait tomber « tr-TR → tr » ;
 * retirer `'tr'` de la liste de `localiserDecimale` fait tomber « 44,1 » ;
 * écrire `other {# parçalar}` dans `tr.ts` fait tomber le dernier cas.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { langueDuNavigateur } from '../langueParDefaut';
import { localeNames, locale, tn } from '../i18n';
import { categoriesExigees, blocsPluriels } from '../pluriel';
import { localiserDecimale } from '../libellesFrequence';
import { langueDictee } from '../commandeVocale';
import { dictionnaire } from './onzeDictionnaires';

afterEach(() => locale.set('fr'));

describe('turc : détection, sélecteur, dictée', () => {
  it.each([[['tr-TR', 'tr']], [['tr']], [['tr-CY', 'en']]])('%j → tr', (languages) => {
    expect(langueDuNavigateur({ languages, language: languages[0] })).toBe('tr');
  });
  it('« Türkçe » dans le sélecteur, tr-TR pour la dictée', () => {
    expect(localeNames.tr).toBe('Türkçe');
    expect(langueDictee('tr')).toBe('tr-TR');
  });
  it('virgule décimale : 44,1 kHz', () => {
    expect(localiserDecimale('44.1 kHz', 'tr')).toBe('44,1 kHz');
  });
});

describe('turc : pas de pluriel après un nombre', () => {
  it('CLDR tr = one / other', () => {
    expect(categoriesExigees('tr')).toEqual(['one', 'other']);
  });
  it('$tn rend le nom au singulier, quel que soit le nombre', () => {
    locale.set('tr');
    expect(get(tn)('v2.common.trackCountN', 1)).toBe('1 parça');
    expect(get(tn)('v2.common.trackCountN', 5)).toBe('5 parça');
    expect(get(tn)('v2.common.trackCountN', 0)).toBe('0 parça');
  });
  it('aucune forme plurielle ne met -ler/-lar juste après le nombre', () => {
    const tr = dictionnaire('tr');
    const fautes: string[] = [];
    for (const [cle, message] of Object.entries(tr)) {
      if (!message.includes('plural,')) continue;
      for (const bloc of blocsPluriels(message)) {
        for (const [cat, forme] of bloc.formes) {
          if (/#\s+\p{L}+(?:ler|lar)\b/u.test(forme)) fautes.push(`${cle} [${cat}] ${forme}`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });
});
