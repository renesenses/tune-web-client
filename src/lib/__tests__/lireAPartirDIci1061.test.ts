/**
 * #1061 — « Lire à partir d'ici », généralisé (FabienM, fil 1812, point 9).
 *
 * > « Pour chaque titre, il manque une action "Lire à partir d'ici" qui lance
 * > le titre sélectionné suivi des titres qui suivent dans la liste affichée à
 * > l'écran. […] Par contre je vois bien le bouton dans mes playlist. Il
 * > faudrait donc généraliser le bouton lorsqu'il y a une liste de titres. »
 *
 * Le geste existait sous TROIS formes : bouton explicite dans l'ancienne
 * interface et le gestionnaire hérité, clic implicite dans `PlaylistDetailV2`
 * — et rien du tout ailleurs. Ce qui manquait n'est pas toujours la mécanique
 * (les Favoris V2 lisaient déjà « à partir d'ici » AU CLIC) mais le geste
 * VISIBLE : Fabien cherche un bouton, et n'en trouve pas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const lire = (p: string) => readFileSync(p, 'utf8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

describe('#1061 — le bouton, dans la barre partagée', () => {
  const barre = lire('src/components/v2/PisteActions.svelte');

  it('il porte le libellé déjà traduit, et il est OPT-IN', () => {
    expect(barre).toContain("$t('common.playFromHere'");
    expect(barre).toContain('data-depuis');
    expect(barre).toContain('onLireDepuis?: (() => void) | null;');
    // 🔴 Contre-épreuve : sans la propriété, la barre est celle d'avant.
    const i = barre.indexOf('data-depuis');
    const garde = barre.lastIndexOf('{#if ', i);
    expect(barre.slice(garde, i)).toContain('onLireDepuis');
  });

  it('il n\'avale pas le clic de la ligne', () => {
    const i = barre.indexOf('data-depuis');
    const bloc = barre.slice(i, i + 200);
    expect(bloc).toContain('stop(e)');
  });

  it('la clé existe dans les ONZE langues', () => {
    const langues = ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'zh', 'ro', 'sv', 'hu'];
    for (const l of langues) {
      expect(lire(`src/lib/locales/${l}.ts`), l).toContain('common.playFromHere');
    }
  });
});

describe('#1061 — la liste passe le RANG, pas la liste', () => {
  const liste = lire('src/components/v2/ListePistesV2.svelte');

  it('`onLireDepuis` reçoit piste et index, comme `onLire`', () => {
    expect(liste).toContain('onLireDepuis?: ((piste: Track, index: number) => void) | null;');
    expect(liste).toContain('onLireDepuis={onLireDepuis ? () => onLireDepuis(p, i) : null}');
  });

  it('les DEUX rendus le portent — tableau et lignes', () => {
    const n = (liste.match(/onLireDepuis \? \(\) => onLireDepuis\(p, i\) : null/g) ?? []).length;
    // Une fois dans la cellule d'actions du tableau, deux fois dans le rendu
    // en lignes (avec suffixe et sans).
    expect(n).toBe(3);
  });

  it('la ligne la transmet à la barre', () => {
    const ligne = lire('src/components/v2/LignePisteV2.svelte');
    expect(ligne).toContain('<PisteActions {piste} {onLireDepuis} />');
  });
});

describe('#1061 — les écrans qui ont une liste ordonnée', () => {
  const ECRANS: [string, string][] = [
    ['FavoritesV2', 'lireDepuis(i)'],
    ['PlaylistDetailV2', 'playFrom(i)'],
    ['AlbumDetailV2', 'playAlbum(i)'],
    ['LibraryV2', 'lireLesTitresDepuis(i)'],
    ['SearchV2', 'lireLesTitresDepuis(i)'],
    ['EtiquettesV2', 'lireLesPistesDepuis(i)'],
  ];

  for (const [ecran, appel] of ECRANS) {
    it(`${ecran} pose le bouton`, () => {
      const s = sansCommentaires(lire(`src/components/v2/${ecran}.svelte`));
      expect(s).toContain('onLireDepuis=');
      expect(s).toContain(appel);
    });
  }

  it('🔴 l\'Historique ne le pose PAS, et c\'est délibéré', () => {
    // Un journal d'écoutes est antichronologique : « la suite » y voudrait
    // dire « ce que j'ai écouté AVANT ». Le geste n'y a pas de sens, et le
    // poser quand même serait une réponse à une question que personne n'a
    // posée.
    const s = sansCommentaires(lire('src/components/v2/HistoriqueV2.svelte'));
    expect(s).not.toContain('onLireDepuis=');
  });
});

describe('#1061 — la suite, c\'est l\'ordre AFFICHÉ', () => {
  it('la Bibliothèque part de `visibleTracks`, pas du catalogue', () => {
    const s = lire('src/components/v2/LibraryV2.svelte');
    expect(s).toContain('lireListeDepuis(visibleTracks as any, i, gestesDeZone(zid))');
    // Contre-épreuve : pas la liste complète, qui contiendrait des titres que
    // l'écran ne montre pas (filtres, tri, tranche).
    expect(s).not.toContain('lireListeDepuis(tracks as any');
  });

  it('la Recherche part de la tranche rendue', () => {
    expect(lire('src/components/v2/SearchV2.svelte'))
      .toContain('lireListeDepuis(vusTitres as any, i, gestesDeZone(zid))');
  });
});

describe('#1061 — une seule fabrique de gestes', () => {
  it('la paire `lire`/`enfiler` ne vit plus dans les composants', () => {
    const fabrique = lire('src/lib/gestesDeZone.ts');
    expect(fabrique).toContain('export function gestesDeZone');
    // Le type vient de `lectureEnMasse` : une copie locale divergerait.
    expect(fabrique).toContain("import type { GestesLecture } from './lectureEnMasse';");
    for (const ecran of ['FavoritesV2', 'StreamingV2']) {
      const s = sansCommentaires(lire(`src/components/v2/${ecran}.svelte`));
      expect(s, ecran).toContain('gestesDeZone');
      // 🔴 la copie locale a disparu des deux écrans qui la portaient.
      expect(s, ecran).not.toContain('enfiler: (c: any) => api.addToQueue(zid, c)');
    }
  });
});
