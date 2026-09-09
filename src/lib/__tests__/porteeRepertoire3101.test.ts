/**
 * Portée de répertoire — renesenses/tune-server-rust#3101 (Sevy Tabroc,
 * forum 1637, 0.9.129 macOS) : « Lorsque je sélectionne un répertoire celui-ci
 * apparaît dans bibliothèque mais c'est l'entièreté de la bibliothèque en
 * cours qui s'affiche et non pas celle du répertoire sélectionné. »
 *
 * Deux chemins d'échec silencieux, lus dans le client livré, et rejoués ici.
 *
 * GESTE 1 — visiter la Bibliothèque, puis Répertoires → un dossier → « Voir en
 * bibliothèque ». La première visite remplit le magasin partagé `albums`
 * (4 701 albums chez ce testeur). Le bouton posait `pendingLibraryFolder` et
 * changeait de vue ; `LibraryView` remontait, lisait la portée UNE fois dans
 * l'initialiseur d'un `$state`, affichait la pastille… et son effet de
 * chargement ne rechargeait que si `$albums.length === 0`. Le magasin étant
 * plein, rien ne partait : bibliothèque entière sous la pastille du dossier.
 *
 * GESTE 2 — même chemin, mais `/library/tracks?folder=…&limit=5000` échoue
 * (réseau, statut non-2xx). Les trois `catch` écrivaient en console et
 * laissaient la liste précédente — la bibliothèque entière — à l'écran.
 *
 * Contre-épreuve faite : ce fichier est rouge sur `main` avant le correctif.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import { albums, artists, tracks, libraryFolderScope, resetLibraryNavigation } from '../stores/library';
import {
  echecChargementPortee,
  listeARecharger,
  marquerListeChargee,
  nomDeDossier,
  viderListesHorsPortee,
} from '../porteeBibliotheque';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const DOSSIER = '/Volumes/Music/CDThèque Yves';
const bibliothequeEntiere = () =>
  Array.from({ length: 4701 }, (_, i) => ({ id: i + 1, title: `Album ${i + 1}` })) as any[];

beforeEach(() => {
  albums.set([]);
  artists.set([]);
  tracks.set([]);
  libraryFolderScope.set(null);
  marquerListeChargee('albums', null);
  marquerListeChargee('artists', null);
  marquerListeChargee('tracks', null);
});

describe('geste 1 — Bibliothèque déjà visitée, puis « Voir en bibliothèque »', () => {
  it('une liste PLEINE remplie sans portée doit être rechargée sous la portée', () => {
    // Première visite : la Bibliothèque remplit le magasin partagé.
    albums.set(bibliothequeEntiere());
    marquerListeChargee('albums', null);
    // Répertoires → dossier → « Voir en bibliothèque ».
    libraryFolderScope.set(DOSSIER);
    const n = get(albums).length;
    expect(n).toBe(4701);
    // 🔴 L'ancienne condition (`$albums.length === 0`) répondait « non ».
    expect(n === 0).toBe(false);
    expect(listeARecharger('albums', get(libraryFolderScope), n)).toBe(true);
  });

  it('au changement de portée, la liste hors portée est VIDÉE avant tout rendu', () => {
    albums.set(bibliothequeEntiere());
    artists.set([{ id: 1, name: 'A' }] as any);
    libraryFolderScope.set(DOSSIER);
    expect(viderListesHorsPortee(DOSSIER)).toEqual(['albums', 'artists']);
    expect(get(albums)).toEqual([]);
    expect(get(artists)).toEqual([]);
  });

  it('une liste remplie SOUS la portée ne se recharge pas en boucle', () => {
    libraryFolderScope.set(DOSSIER);
    albums.set([{ id: 7, title: 'Frost' }] as any);
    marquerListeChargee('albums', DOSSIER);
    expect(listeARecharger('albums', DOSSIER, 1)).toBe(false);
    expect(viderListesHorsPortee(DOSSIER)).toEqual([]);
  });

  it('retirer la pastille rend une liste scopée périmée : rechargement sans portée', () => {
    albums.set([{ id: 7, title: 'Frost' }] as any);
    marquerListeChargee('albums', DOSSIER);
    libraryFolderScope.set(null);
    expect(listeARecharger('albums', null, 1)).toBe(true);
    expect(viderListesHorsPortee(null)).toEqual(['albums']);
  });

  it('chaque liste a SA portée : des artistes non scopés ne passent pas sous une portée posée par les albums', () => {
    artists.set([{ id: 1, name: 'A' }] as any);
    marquerListeChargee('albums', DOSSIER);
    expect(listeARecharger('artists', DOSSIER, 1)).toBe(true);
  });

  it('un clic délibéré sur « Bibliothèque » dans la barre latérale retire la portée', () => {
    libraryFolderScope.set(DOSSIER);
    resetLibraryNavigation();
    expect(get(libraryFolderScope)).toBeNull();
  });
});

describe('geste 2 — le chargement scopé échoue', () => {
  it('la liste précédente ne reste PAS à l’écran', () => {
    albums.set(bibliothequeEntiere());
    libraryFolderScope.set(DOSSIER);
    echecChargementPortee('albums', DOSSIER);
    expect(get(albums)).toEqual([]);
    // Et elle sera retentée au prochain montage : vide ⇒ à recharger.
    expect(listeARecharger('albums', DOSSIER, get(albums).length)).toBe(true);
  });
});

describe('nomDeDossier', () => {
  it('rend le dernier segment, Unix ou Windows, et rien sans portée', () => {
    expect(nomDeDossier(DOSSIER)).toBe('CDThèque Yves');
    expect(nomDeDossier('/Users/yvescorbat/Tune Test/')).toBe('Tune Test');
    expect(nomDeDossier('D:\\Musique\\Frost')).toBe('Frost');
    expect(nomDeDossier(null)).toBe('');
  });
});

describe('une seule source de vérité : `libraryFolderScope`', () => {
  const v1 = sansCommentaires(lire('src/components/LibraryView.svelte'));
  const v2 = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
  const browse = sansCommentaires(lire('src/components/BrowseView.svelte'));
  const nav = sansCommentaires(lire('src/lib/stores/navigation.ts'));

  it('le dépôt « consommé une fois » n’existe plus nulle part', () => {
    for (const [nom, src] of Object.entries({ v1, v2, browse, nav })) {
      expect(src, `${nom} porte encore pendingLibraryFolder`).not.toContain('pendingLibraryFolder');
    }
    expect(v1).not.toContain('takePendingLibraryFolder');
    expect(v2).not.toContain('prendreDossierEnAttente');
  });

  it('Répertoires ÉCRIT le magasin ; les deux clients le LISENT en dérivé', () => {
    expect(browse).toContain('libraryFolderScope.set(browseResult.path)');
    expect(v1).toMatch(/let scopedFolder = \$derived\(\$libraryFolderScope\)/);
    expect(v2).toMatch(/const dossierPortee = \$derived\(\$libraryFolderScope\)/);
    expect(v2).toMatch(/const porteeActive = \$derived\(!!dossierPortee\)/);
  });

  it('v1 : le chargement automatique dépend de la portée et de `listeARecharger`, plus de « magasin vide »', () => {
    const i = v1.indexOf('const portee = $libraryFolderScope;');
    expect(i, 'l’effet de chargement doit LIRE la portée').toBeGreaterThan(0);
    const effet = v1.slice(i, i + 1200);
    expect(effet).toContain('viderListesHorsPortee(portee)');
    expect(effet).toMatch(/listeARecharger\('albums', portee, \$albums\.length\)/);
    expect(effet).toMatch(/listeARecharger\('artists', portee, \$artists\.length\)/);
    expect(effet).toMatch(/listeARecharger\('tracks', portee, \$tracks\.length\)/);
    // 🔴 Le trou du geste 1.
    expect(v1).not.toMatch(/!albumsLoaded && \$albums\.length === 0\) loadAlbums\(\)/);
  });

  it('v1 : les trois chargements scopés VIDENT la liste et PRÉVIENNENT en cas d’échec', () => {
    for (const liste of ['albums', 'artists', 'tracks']) {
      expect(v1, `catch de ${liste}`).toMatch(new RegExp(`catch \\(e\\) \\{ echecPortee\\('${liste}', portee, e\\)`));
    }
    const i = v1.indexOf('function echecPortee(');
    expect(i).toBeGreaterThan(0);
    const corps = v1.slice(i, i + 500);
    expect(corps).toContain('echecChargementPortee(liste, portee)');
    expect(corps).toMatch(/notifications\.error\(\$tr\('library\.scopeLoadError'\)/);
  });

  it('v1 : les listes écrites portent la portée sous laquelle elles l’ont été', () => {
    expect(v1).toMatch(/marquerListeChargee\('albums', portee\)/);
    expect(v1).toMatch(/marquerListeChargee\('artists', portee\)/);
    expect(v1).toMatch(/marquerListeChargee\('tracks', portee\)/);
    expect(v1).toMatch(/marquerListeChargee\('albums', null\)/);
    expect(v1).toMatch(/marquerListeChargee\('artists', null\)/);
    expect(v1).toMatch(/marquerListeChargee\('tracks', null\)/);
  });

  it('v1 : la croix de la pastille passe par le magasin, pas par un état local', () => {
    expect(v1).toMatch(/function clearFolderScope\(\) \{\s*libraryFolderScope\.set\(null\);\s*\}/);
  });

  it('v2 : la croix passe par le magasin, et un échec est DIT plutôt que tu', () => {
    expect(v2).toMatch(/function retirerPortee\(\) \{\s*libraryFolderScope\.set\(null\);\s*\}/);
    expect(v2).toMatch(/notifications\.error\(\$tr\('library\.scopeLoadError'\)/);
  });

  it('la clé du message existe dans les onze langues, avec le nom du dossier', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      expect(src, l).toMatch(/['"]library\.scopeLoadError['"]:\s*['"][^'"]*\{d\}[^'"]*['"]/);
    }
  });
});
