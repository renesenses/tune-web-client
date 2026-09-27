// 🔴 `renesenses/tune-web-client#1662` et `#1663` — FabienM, fil 1991
// (0.9.166) : il cherche `"wish you were here"`, un album Bandcamp prend le
// médaillon « Meilleur résultat », et l'album Pink Floyd de sa bibliothèque
// n'est même pas dans les 100 premiers albums (tri « Pertinence »).
//
// #1662 — le médaillon comparait la requête BRUTE, guillemets compris : seul
// un titre qui porte lui-même les guillemets obtenait l'égalité exacte, et
// l'album local tombait à 0. La requête envoyée au serveur, elle, garde ses
// guillemets (recherche d'expression exacte) : la normalisation ne vaut QUE
// pour le calcul du médaillon.
//
// #1663 — « Pertinence » en sens descendant renversait la fusion (Bandcamp en
// tête, bibliothèque en dernier), et ce sens, mémorisé, s'appliquait à toutes
// les recherches suivantes.
//
// CONTRE-ÉPREUVE : chaque épreuve 🔴 est rouge sur `main` (7ea807a3) et
// redevient rouge si l'on retire la normalisation de `meilleurResultat` ou si
// `sensTriRecherche` rend le sens mémorisé tel quel.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { meilleurResultat, type ResultatsFusionnes } from '../rechercheClassement';
import * as tri from '../trierAlbums';

const alb = (title: string, source: string, cover?: boolean) =>
  ({ id: 1, title, source, ...(cover ? { cover_path: 'x' } : {}) }) as any;
const avecAlbums = (albums: any[]): ResultatsFusionnes => ({ artistes: [], albums, pistes: [] });
const racine = resolve(__dirname, '../../..');
const lire = (p: string) => readFileSync(resolve(racine, p), 'utf8');

describe('#1662 — le médaillon compare une requête normalisée', () => {
  const bandcamp = alb('"wish you were here"', 'bandcamp', true);

  it('🔴 requête entre guillemets droits : l’album local exact prend le médaillon', () => {
    const local = alb('Wish You Were Here', 'local', true);
    const m = meilleurResultat('"wish you were here"', avecAlbums([bandcamp, local]));
    expect(m?.genre).toBe('album');
    expect((m as any).album.source).toBe('local');
  });

  it('🔴 à texte égal, la bibliothèque passe devant un service même sans pochette', () => {
    const local = alb('Wish You Were Here', 'local', false);
    const m = meilleurResultat('"wish you were here"', avecAlbums([bandcamp, local]));
    expect((m as any).album.source).toBe('local');
  });

  it('🔴 guillemets typographiques, casse, espaces et accents repliés', () => {
    // Le leurre a une pochette et l'album local n'en a pas : sans normalisation,
    // aucun des deux n'a de score de texte et c'est le bonus qui décide.
    const local = alb('Café  Del Mar', 'local', false);
    const qobuz = alb('Autre chose', 'qobuz', true);
    const m = meilleurResultat('  “CAFE del   mar”  ', avecAlbums([qobuz, local]));
    expect((m as any).album.title).toBe('Café  Del Mar');
  });

  it('🔴 à texte égal entre services, l’ordre des sources tranche (qobuz avant bandcamp)', () => {
    const q = alb('Wish You Were Here', 'qobuz', false);
    const b = alb('Wish You Were Here', 'bandcamp', true);
    const m = meilleurResultat('wish you were here', avecAlbums([b, q]));
    expect((m as any).album.source).toBe('qobuz');
  });

  it('la requête envoyée au serveur garde ses guillemets : seule la comparaison est normalisée', () => {
    const vue = lire('src/components/v2/SearchV2.svelte');
    expect(vue).toMatch(/api\.searchLibrary\(requeteExacte\(query\)/);
    expect(vue).toMatch(/meilleurResultat\(q, \{/);
  });
});

describe('#1663 — Pertinence ne se renverse pas', () => {
  // L'ordre de la fusion : bibliothèque d'abord, puis les services.
  const fusion = [alb('WYWH', 'local'), alb('A', 'qobuz'), alb('B', 'bandcamp')];

  it('🔴 un sens « desc » mémorisé par un ancien client garde la bibliothèque en tête', () => {
    const sensMemorise: tri.SensTri = 'desc';
    const sens = (tri as any).sensTriRecherche?.('pertinence', sensMemorise) ?? sensMemorise;
    const rendu = tri.trierAlbums(fusion, 'pertinence', sens);
    expect(rendu[0].source).toBe('local');
    expect(rendu.map((a) => a.source)).toEqual(['local', 'qobuz', 'bandcamp']);
  });

  it('🔴 les autres clés gardent le sens mémorisé', () => {
    expect((tri as any).sensTriRecherche?.('year', 'desc')).toBe('desc');
  });

  it('🔴 l’écran de recherche passe par `sensTriRecherche`, et la flèche est masquée pour Pertinence', () => {
    const vue = lire('src/components/v2/SearchV2.svelte');
    expect(vue).toMatch(/trierAlbums\([^)]*\), triAlbums, sensTriRecherche\(triAlbums, sensAlbums\)\)/);
    const composant = lire('src/components/partages/TriAlbums.svelte');
    const i = composant.indexOf("{#if cle !== 'pertinence'}");
    const j = composant.indexOf('<button class="sens"');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
  });
});
