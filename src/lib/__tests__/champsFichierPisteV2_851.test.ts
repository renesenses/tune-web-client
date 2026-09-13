/**
 * #851 — « Pas de visualisation des Tags des morceaux dans la visu Bibliothèque »
 *
 * Pierre M, fil forum 1671, réponse 6166, 10/09/2026 à 23 h 43. Le même
 * message joint, pour un autre point, une capture de foobar2000 (« Editing
 * Combined Tags From 6 Files » : Artist, Album, Disc, ALBUMARTISTSORT, ISRC,
 * ORGANIZATION…) et sa phrase suivante porte sur « Localiser sur le disque ».
 * Son fil de pensée est le FICHIER.
 *
 * Ce qu'il utilisait dans le client actuel : le crayon de chaque ligne de
 * piste. La nouvelle interface n'en avait aucun équivalent — `TrackEditModal`
 * et `TrackTagsDrawer` étaient introuvables sous `components/v2/`, et le seul
 * chemin était pochette → Modifier l'album → cliquer une piste → tiroir, trois
 * gestes que rien ne signale.
 *
 * ## Ce que cette garde tient, et ce qu'elle ne tient pas
 *
 * Elle appelle `entreesMenuPiste` — la fonction réelle — et regarde ce qui en
 * sort. Elle ne se contente pas de lire un texte : une entrée écrite mais
 * inatteignable sortirait quand même de la fonction, donc la garde vérifie EN
 * PLUS que `PisteActions` fournit le geste et monte le tiroir. Sans ces deux
 * lignes, l'entrée n'apparaît jamais à l'écran (règle « capacités et gestes »
 * du module : une entrée dont le geste manque est absente).
 *
 * Elle ne tient PAS que le tiroir affiche les bons champs — c'est le même
 * composant que le client actuel sert depuis toujours, avec ses propres
 * gardes (`champsPiste`, #2720).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { entreesMenuPiste, type CapacitesPiste, type GestesPiste } from '../menuPiste';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

/** Une piste de la BIBLIOTHÈQUE — celle de `menuPiste.test.ts`, piste 2450. */
const BIBLIO: CapacitesPiste = { jouable: true, idBibliotheque: 2450, artistId: 125, albumId: 259 };
/** Une piste de SERVICE : aucun `i64` de `tracks` sous la main. */
const SERVICE: CapacitesPiste = {
  jouable: true,
  idBibliotheque: null,
  artistId: null,
  albumId: null,
  albumDeService: { service: 'qobuz', albumId: 'abc', titre: 'X' },
  artisteDeService: { service: 'qobuz', nom: 'Y' },
};

function gestes(): { g: GestesPiste; appels: string[] } {
  const appels: string[] = [];
  const g: GestesPiste = {};
  for (const nom of [
    'lire', 'ensuite', 'aLaFile', 'plusCommeCa', 'autresVersions',
    'ajouterAPlaylist', 'allerArtiste', 'allerAlbum', 'etiqueter', 'champsDuFichier',
  ] as const) {
    (g as Record<string, () => void>)[nom] = () => appels.push(nom);
  }
  return { g, appels };
}

const CLE = 'trackTags.title';

describe('#851 — les champs du fichier depuis le menu « … » d’une piste', () => {
  it('l’entrée existe sur une piste de bibliothèque', () => {
    const { g } = gestes();
    const cles = entreesMenuPiste(BIBLIO, g).map((e) => e.cle);
    expect(cles).toContain(CLE);
  });

  it('elle DÉCLENCHE le geste — une entrée muette est pire qu’absente', () => {
    const { g, appels } = gestes();
    const e = entreesMenuPiste(BIBLIO, g).find((x) => x.cle === CLE);
    expect(e).toBeDefined();
    e!.faire();
    expect(appels).toEqual(['champsDuFichier']);
  });

  it('elle est ABSENTE d’une piste de service — la route prend un i64 de tracks', () => {
    const { g } = gestes();
    const cles = entreesMenuPiste(SERVICE, g).map((e) => e.cle);
    expect(cles).not.toContain(CLE);
  });

  it('elle est absente quand la surface ne fournit pas le geste', () => {
    const cles = entreesMenuPiste(BIBLIO, { lire: () => {} }).map((e) => e.cle);
    expect(cles).not.toContain(CLE);
  });

  /**
   * 🔴 Le point de l’issue qui reste « non établi » : « tags » peut désigner
   * les ÉTIQUETTES Tune. Les deux entrées doivent coexister et rester
   * distinctes — les fondre rendrait l’une des deux lectures inatteignable.
   */
  it('elle ne remplace pas « Étiquettes » : les deux sont là, distinctes', () => {
    const { g } = gestes();
    const cles = entreesMenuPiste(BIBLIO, g).map((e) => e.cle);
    expect(cles).toContain('v2.cover.tags');
    expect(cles).toContain(CLE);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('elle porte une icône à elle', () => {
    const { g } = gestes();
    const toutes = entreesMenuPiste(BIBLIO, g);
    const e = toutes.find((x) => x.cle === CLE)!;
    const autres = toutes.filter((x) => x.cle !== CLE).map((x) => x.icone);
    expect(e.icone).toBeTruthy();
    expect(autres).not.toContain(e.icone);
  });

  /**
   * Sans ces deux lignes, l’entrée ne s’affiche JAMAIS : le module n’en pousse
   * aucune dont le geste manque, et un geste qui poserait un drapeau sans
   * monter le tiroir n’ouvrirait rien.
   */
  it('PisteActions fournit le geste ET monte le tiroir', () => {
    const src = lire('src/components/v2/PisteActions.svelte');
    expect(src).toMatch(/champsDuFichier:\s*\(\)\s*=>/);
    expect(src).toContain('TrackTagsDrawer.svelte');
  });

  it('le libellé est une CLÉ de traduction présente partout', () => {
    for (const l of ['fr', 'en', 'de', 'es', 'it', 'ja', 'ko', 'ro', 'sv', 'zh', 'hu']) {
      expect(lire(`src/lib/locales/${l}.ts`)).toContain(`"${CLE}"`);
    }
  });
});
