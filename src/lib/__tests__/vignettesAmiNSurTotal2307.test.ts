/**
 * web#2307 (tune-server-rust#6733, point 4) — dans la bibliothèque d'un ami,
 * la progression des vignettes en « n sur total ». Le nombre vient du site
 * (champ `thumbnails` de `stats`, site-mozaiklabs#336) ; absent, rien n'est dit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireStatsContact, ligneVignettesContact } from '../circle';
import { fr, ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const tr = (k: string) => (fr as Record<string, string>)[k] ?? k;

describe('web#2307 — stats d’un contact', () => {
  it('lit `thumbnails` quand le site le donne', () => {
    expect(lireStatsContact({ tracks: 9, albums: 31713, artists: 4, last_sync: 'x', thumbnails: 1200 }))
      .toEqual({ tracks: 9, albums: 31713, artists: 4, last_sync: 'x', thumbnails: 1200 });
  });
  it('site plus ancien : `thumbnails` vaut null', () => {
    expect(lireStatsContact({ tracks: 1, albums: 2, artists: 3 }).thumbnails).toBeNull();
    expect(lireStatsContact({ albums: 2, thumbnails: '5' }).thumbnails).toBeNull();
  });
});

describe('web#2307 — la ligne « n sur total »', () => {
  it('tant que la couverture n’est pas complète', () => {
    expect(ligneVignettesContact({ albums: 31713, thumbnails: 1200 }, tr))
      .toBe('Pochettes : 1200 sur 31713, elles arrivent progressivement.');
    expect(ligneVignettesContact({ albums: 10, thumbnails: 0 }, tr, (n) => `#${n}`))
      .toBe('Pochettes : #0 sur #10, elles arrivent progressivement.');
  });
  it('rien quand tout est arrivé, quand la bibliothèque est vide ou quand le site ne compte pas', () => {
    expect(ligneVignettesContact({ albums: 10, thumbnails: 10 }, tr)).toBeNull();
    expect(ligneVignettesContact({ albums: 10, thumbnails: 12 }, tr)).toBeNull();
    expect(ligneVignettesContact({ albums: 0, thumbnails: 0 }, tr)).toBeNull();
    expect(ligneVignettesContact({ albums: 10, thumbnails: null }, tr)).toBeNull();
    expect(ligneVignettesContact(null, tr)).toBeNull();
  });
  it('la fiche de l’ami affiche la ligne', () => {
    const src = readFileSync(new URL('../../components/v2/CatalogueContactV2.svelte', import.meta.url), 'utf8');
    expect(src).toMatch(/ligneVignettesContact\(stats,/);
    expect(src).toContain('data-vignettes-progression');
  });
  it('le libellé existe dans les 14 langues, avec {n} et {total}', () => {
    for (const l of ONZE_LANGUES) {
      const v = dictionnaire(l)['v2.circle.lib.thumbnailsProgress'];
      expect(v, l).toContain('{n}');
      expect(v, l).toContain('{total}');
    }
  });
});
