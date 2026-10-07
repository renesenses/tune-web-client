/**
 * renesenses/tune-server-rust#4319 (fil 1817) — la recherche dans une portée
 * de répertoire de la Bibliothèque regarde aussi l'ARTISTE DE PISTE et le NOM
 * DU DERNIER DOSSIER, comme Oxygen et la recherche générale (#5192).
 *
 * Le cas « Mahler Mehta » :
 *  - la 2 est SANS étiquettes, rangée par dossier (« Mahler Mehta 2 ») : son
 *    album n'a ni titre ni artiste utiles ;
 *  - la 3 est rangée sous « Zubin Mehta / Los Angeles Philharmonic » : l'album
 *    porte « Gustav Mahler » comme artiste, les pistes portent « Zubin Mehta ».
 * Avant le correctif, « Mehta » ne trouvait ni l'une ni l'autre.
 *
 * L'album ne porte pas ces champs : l'écran demande au serveur les albums du
 * dossier qui répondent au texte (`/library/albums-detailed?folder=…&q=…`),
 * et la règle locale les accepte en plus du titre et de l'artiste d'album.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { correspond, repondALaRecherche, type FiltresBibliotheque, type Outils } from '../facettesBibliotheque';
import { fold } from '../utils';
import type { Album } from '../types';

const alb = (o: Partial<Album>): Album => ({ id: 1, title: 't', ...o }) as Album;

const MAHLER_2 = alb({ id: 2, title: 'Unknown Album', artist_name: 'Unknown Artist' });
const MAHLER_3 = alb({ id: 3, title: 'Symphony No. 3', artist_name: 'Gustav Mahler' });
const AUTRE = alb({ id: 4, title: 'Kind of Blue', artist_name: 'Miles Davis' });
const PORTEE = [MAHLER_2, MAHLER_3, AUTRE];

const AUCUN: FiltresBibliotheque = {
  qualite: [], frequence: [], annee: null, format: [], profondeur: [], recherche: '',
  compilation: null, provenance: null,
};

const outils = (albumsDuTexte: ReadonlySet<number> | null): Outils => ({
  qualiteDe: () => true,
  anneeDe: (a) => a.year ?? null,
  plier: fold,
  provenanceDe: () => 'local',
  albumsDuTexte,
});

const trouves = (recherche: string, serveur: ReadonlySet<number> | null) =>
  PORTEE.filter((a) => correspond(a, { ...AUCUN, recherche }, outils(serveur))).map((a) => a.id);

describe('recherche dans une portée de répertoire (#4319)', () => {
  it('contre-épreuve : sans la réponse serveur, « Mehta » ne trouve rien', () => {
    // C'est le défaut signalé : seuls le titre et l'artiste d'ALBUM comptent.
    expect(trouves('Mehta', null)).toEqual([]);
  });

  it('« Mehta » trouve la 2 (dossier) et la 3 (artiste de piste) via le serveur', () => {
    // Le serveur a trouvé la 2 par son dossier, la 3 par l'artiste de ses pistes.
    expect(trouves('Mehta', new Set([2, 3]))).toEqual([2, 3]);
  });

  it('insensible à la casse et aux accents côté local', () => {
    expect(trouves('MAHLER', null)).toEqual([3]);
    expect(trouves('máhler', null)).toEqual([3]);
  });

  it("la réponse serveur s'AJOUTE, elle ne remplace pas la comparaison locale", () => {
    // Réponse serveur pas encore arrivée pour « Miles » : l'album reste trouvé.
    expect(trouves('miles', new Set())).toEqual([4]);
  });

  it('une saisie vide laisse tout passer, réponse serveur ou non', () => {
    expect(trouves('', new Set([2]))).toEqual([2, 3, 4]);
  });

  it('un album sans identifiant ne répond jamais par le serveur', () => {
    const sansId = alb({ id: undefined as unknown as number, title: 'x', artist_name: 'y' });
    expect(repondALaRecherche(sansId, 'Mehta', { plier: fold, albumsDuTexte: new Set([2, 3]) })).toBe(false);
  });
});

describe('LibraryV2 branche la recherche serveur de la portée (#4319)', () => {
  const v2 = readFileSync(resolve(process.cwd(), 'src/components/v2/LibraryV2.svelte'), 'utf-8');

  it('demande au serveur les albums qui répondent au texte, dossier compris dans une portée', () => {
    expect(v2).toMatch(/const filtres = d \? \{ folder: d, q: saisie \} : \{ q: saisie \};/);
    expect(v2).toMatch(/return api\.getAlbumsDetailed\(filtres, limite, rang\);/);
  });

  it('hors portée aussi (décision du 07/10) : seuls un dépôt distant et une saisie vide s’abstiennent', () => {
    // Avant, `if (!d || !saisie) return;` : rien hors d'un répertoire.
    expect(v2).toMatch(/if \(depot \|\| !saisie\) return;/);
    expect(v2).not.toMatch(/if \(!d \|\| !saisie\) return;/);
  });

  it('une saisie périmée arrête la pagination en cours', () => {
    expect(v2).toMatch(/if \(perime\) return Promise\.reject\(/);
  });

  it('la grille et les comptes appliquent la MÊME règle', () => {
    expect(v2).toMatch(/repondALaRecherche\(a, q, \{ plier: fold, albumsDuTexte: idsTexteServeur \}\)/);
    expect(v2).toMatch(/albumsDuTexte: idsTexteServeur,/);
    // L'ancienne comparaison en dur, titre + artiste d'album seulement.
    expect(v2).not.toMatch(/q && !fold\(a\.title\)\.includes\(fold\(q\)\)/);
  });
});

describe('la pagination s’arrête quand la page refuse (#4319)', () => {
  it('une page rejetée interrompt la boucle : aucune page suivante', async () => {
    const { idsAlbumsDeLaPortee, PAGE_PORTEE } = await import('../porteeDossierAlbums');
    let appels = 0;
    let perime = false;
    const pleine = Array.from({ length: PAGE_PORTEE }, (_, i) => ({ album_id: i }));
    const r = idsAlbumsDeLaPortee(async () => {
      if (perime) throw new Error('saisie périmée');
      appels++;
      perime = true; // la saisie change pendant la première page
      return { items: pleine as never, total: PAGE_PORTEE * 5 };
    });
    await expect(r).rejects.toThrow('périmée');
    expect(appels).toBe(1);
  });
});
