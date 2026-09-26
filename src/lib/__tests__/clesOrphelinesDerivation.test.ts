import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prefixesDynamiques, valeursLitterales } from '../../../scripts/lib/prefixesDynamiques.mjs';

/**
 * CE QUI GARDE LE PLAFOND À ZÉRO D'ÊTRE DÉCORATIF.
 *
 * `check-i18n` refuse désormais une clé déclarée que personne n'appelle. Pour
 * ne pas accuser à tort les clés composées — `$t('oxygen.facet.' + f)` — il
 * exempte les PRÉFIXES qu'il lit dans le code. Deux façons de rendre cette
 * garde inutile, et ce fichier tient les deux :
 *
 *  1. 🔴 TROP ÉTROITE — un préfixe non reconnu, et la purge suivante emporte
 *     des clés vivantes. La clé brute s'affiche alors en plein écran
 *     (« zoneConfig.channels_stereo » dans une liste déroulante) et RIEN ne
 *     l'attrape : ni ce contrôle, ni un test, ni une revue en français. C'est
 *     arrivé pendant l'écriture de cette garde, sur la forme SANS point final.
 *
 *  2. 🔴 TROP LARGE — un préfixe exempte toute sa famille. Si `playlist.`
 *     figurait dans la liste, cinq clés mortes y seraient à l'abri à vie et le
 *     plafond ne garderait plus ce coin du catalogue. Or le seul gabarit qui
 *     compose une clé `playlist.…` ne peut produire que trois suffixes, écrits
 *     là en clair ; et l'autre occurrence du même début, dans `api.ts`, est un
 *     NOM DE FICHIER (`playlist.m3u`), pas une clé.
 *
 * On ne vérifie donc pas que la dérivation « marche » : on vérifie qu'elle
 * reste au bon cran, des deux côtés.
 */

const RACINE = resolve(__dirname, '../../..');

function clesDeclarees(): Set<string> {
  const src = readFileSync(resolve(RACINE, 'src/lib/locales/fr.ts'), 'utf8');
  return new Set([...src.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map((m) => m[1]));
}

describe('les valeurs qu’un gabarit peut réellement produire', () => {
  it('énumère les branches quand elles sont toutes littérales', () => {
    const vues = valeursLitterales("s === 'not_found' ? 'notFound' : 'matched'");
    // `not_found` est COMPARÉ, jamais produit : il ne doit pas figurer.
    expect(vues).toEqual(['notFound', 'matched']);
  });

  it('rend null dès qu’une valeur inconnue peut sortir', () => {
    // Un identifiant nu : on ne sait plus ce que le gabarit produit, donc on
    // exempte le préfixe entier plutôt que d'inventer une liste.
    expect(valeursLitterales('facette')).toBeNull();
    expect(valeursLitterales("prefixe + 'x'")).toBeNull();
  });
});

describe('les préfixes dynamiques lus dans le code du client', () => {
  const { prefixes } = prefixesDynamiques(resolve(RACINE, 'src'), clesDeclarees()) as {
    prefixes: Map<string, string[]>;
  };

  it('lit la concaténation', () => {
    expect([...prefixes.keys()]).toContain('oxygen.facet.');
  });

  it('🔴 lit aussi un début qui NE finit PAS par un point', () => {
    // `$t('zoneConfig.channels_' + d.id)` — sélecteur de canaux, Réglages ›
    // Appareils. Neuf clés vivantes en dépendent.
    expect([...prefixes.keys()]).toContain('zoneConfig.channels_');
  });

  it('🔴 n’exempte PAS une famille dont le gabarit ne produit que trois clés', () => {
    // Si cette assertion tombe, le plafond à zéro ne garde plus la famille et
    // des clés mortes y dorment : relire ce que le gabarit peut produire.
    expect([...prefixes.keys()]).not.toContain('playlist.');
  });

  it('n’exempte aucun préfixe qu’aucune clé déclarée ne porte', () => {
    const declarees = [...clesDeclarees()];
    for (const p of prefixes.keys()) {
      expect(
        declarees.some((k) => k.startsWith(p) && k.length > p.length),
        `le préfixe « ${p} » n’exempte aucune clé : il n’a rien à faire là`,
      ).toBe(true);
    }
  });

  it('chaque préfixe nomme au moins un site du code', () => {
    for (const [p, sites] of prefixes) {
      expect(sites.length, `le préfixe « ${p} » sort de nulle part`).toBeGreaterThan(0);
    }
  });
});
