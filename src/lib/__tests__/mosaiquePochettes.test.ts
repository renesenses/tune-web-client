/**
 * Pochette de playlist : une mosaïque TOUJOURS partagée en quatre.
 *
 * ## La décision
 *
 * Bertrand, 01/09/2026 : « la cover est constituée des 4 premières covers
 * distinctes des morceaux la composant », puis, quand j'ai proposé d'adapter le
 * découpage au nombre d'images disponibles : « non, divise en 4 pour montrer
 * que c'est un assemblage ».
 *
 * Le découpage est donc le SIGNAL — pas la conséquence du nombre de pochettes.
 * Une case unique occupant tout le carré ressemblerait à une pochette d'album,
 * exactement ce qu'une playlist n'est pas.
 *
 * ## Pourquoi ce n'est pas théorique
 *
 * Mesuré sur le serveur de test (192.168.1.18) : sur treize playlists locales,
 * **neuf n'ont qu'une seule pochette distincte** — ce sont des albums rangés en
 * playlists (« Led Zeppelin - Presence », « Wax Poetic - İstanbul »…). Sans
 * cycle, la règle « les 4 premières » aurait produit une image et trois trous
 * neuf fois sur treize.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const mosaique = () => lire('../../components/v2/MosaiquePochettes.svelte');
const ecran = () => lire('../../components/v2/PlaylistsV2.svelte');

/** Reproduit la règle des quatre cases, telle que le composant l'applique. */
function cases(pochettes: string[]): string[] {
  const src = pochettes.filter(Boolean).slice(0, 4);
  if (!src.length) return [];
  return Array.from({ length: 4 }, (_, i) => src[i % src.length]);
}

describe('Mosaïque — la règle des quatre cases', () => {
  it('quatre pochettes : chacune la sienne', () => {
    expect(cases(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('une seule pochette : QUATRE cases quand même', () => {
    // Le cas le plus fréquent : 9 playlists sur 13 mesurées.
    expect(cases(['a'])).toEqual(['a', 'a', 'a', 'a']);
  });

  it('deux pochettes : un damier, pas deux blocs', () => {
    // A B A B se lit comme deux images ; A A B B se lirait comme une bordure.
    expect(cases(['a', 'b'])).toEqual(['a', 'b', 'a', 'b']);
  });

  it('trois pochettes : la quatrième case reboucle', () => {
    expect(cases(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', 'a']);
  });

  it('plus de quatre : on s’arrête à quatre', () => {
    expect(cases(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('aucune pochette : pas de mosaïque du tout', () => {
    // Quatre cases vides se liraient comme un chargement interrompu.
    expect(cases([])).toEqual([]);
  });
});

describe('Mosaïque — ce que le composant garantit', () => {
  it('la grille est bien 2×2, et non adaptative', () => {
    const src = mosaique();
    expect(/grid-template-columns:\s*1fr 1fr/.test(src), 'la grille n’est plus en deux colonnes').toBe(true);
    expect(/grid-template-rows:\s*1fr 1fr/.test(src), 'la grille n’est plus en deux rangées').toBe(true);
    expect(
      /length:\s*4/.test(src),
      'le nombre de cases n’est plus fixé à quatre : l’assemblage cesserait de se voir.',
    ).toBe(true);
  });

  it('un trait sépare les cases', () => {
    // Sans lui, quatre pochettes ton sur ton se fondent en une seule image et
    // le découpage — tout le propos — disparaît.
    expect(/gap:\s*1px/.test(mosaique()), 'la séparation des cases a disparu').toBe(true);
  });

  it('sans pochette, on retombe sur l’initiale', () => {
    expect(mosaique().includes('fallbackInitials={initiales}'), 'le repli a disparu').toBe(true);
  });
});

describe('Playlists — l’alimentation de la mosaïque', () => {
  it('les pochettes viennent des PISTES, faute de pochette de playlist', () => {
    // `/playlists` ne rend que description, id, name, track_count : mesuré.
    expect(ecran().includes('api.getPlaylistTracks(pl.id)'), 'les pistes ne sont plus lues').toBe(true);
  });

  it('les pochettes retenues sont DISTINCTES', () => {
    // Deux titres du même album ne doivent pas occuper deux cases.
    expect(
      ecran().includes('if (c && !vues.includes(c)) vues.push(c)'),
      'la déduplication a disparu : un album de douze titres remplirait les quatre cases.',
    ).toBe(true);
  });

  it('le chargement ne bloque pas la grille', () => {
    // Une requête PAR playlist. Attendre les cent d'un gros catalogue avant
    // d'afficher quoi que ce soit serait pire que pas de mosaïque du tout.
    const src = ecran();
    expect(src.includes('void chargerMosaiques(local)'), 'le chargement n’est plus détaché').toBe(true);
    expect(src.includes('Promise.allSettled'), 'un échec isolé ferait tomber les autres').toBe(true);
  });
});
