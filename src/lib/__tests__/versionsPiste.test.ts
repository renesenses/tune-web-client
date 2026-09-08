// @vitest-environment jsdom
//
// jsdom depuis le 07/09/2026 : les trois premieres gardes MONTENT le menu au
// lieu de lire son texte (voir plus bas). Le reste du fichier est de la donnee
// pure et ne s'en trouve pas change.
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import TrackContextMenu from '../../components/TrackContextMenu.svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';
import hu from '../locales/hu';

/**
 * « Autres versions de ce titre » dans le menu « … » d'une piste — #2372.
 *
 * Le rapprochement des versions existait déjà, mais UNE seule porte y menait :
 * la section de la page d'accueil, dont le vivier est borné aux 200 dernières
 * écoutes (`tune-server/src/routes/home.rs`, `ECOUTES_EXAMINEES`). FabienM l'a
 * écrit mot pour mot : « elles se résument aux simples dernières écoutes ». Un
 * morceau jamais écouté récemment n'avait aucun chemin.
 *
 * Ce lot ajoute la porte manquante : une entrée de menu sur la piste, et une
 * ligne dépliée sous la piste pour le résultat — la MÊME surface que les
 * crédits (`track-credits-row`), pas un nouvel écran.
 *
 * Ces tests lisent les sources : ils vérifient le CÂBLAGE (l'entrée existe, et
 * elle est branchée aux deux endroits où le menu est monté), pas seulement la
 * présence d'un libellé.
 */

const lire = (chemin: string) => readFileSync(resolve(__dirname, chemin), 'utf8');

const MENU = lire('../../components/TrackContextMenu.svelte');
const LIBRARY = lire('../../components/LibraryView.svelte');
const API = lire('../api.ts');

type Dict = Record<string, string | undefined>;

const LANGUES: [string, Dict][] = [
  ['fr', fr as Dict],
  ['en', en as Dict],
  ['de', de as Dict],
  ['es', es as Dict],
  ['it', it_ as Dict],
  ['ja', ja as Dict],
  ['ko', ko as Dict],
  ['ro', ro as Dict],
  ['sv', sv as Dict],
  ['zh', zh as Dict],
  ['hu', hu as Dict],
];

/** Les clés que ce lot introduit. */
const CLES = ['library.otherVersions', 'library.noOtherVersions'] as const;

/**
 * 🔴 RÉORIENTÉ le 07/09/2026 par `renesenses/tune-server-rust#1848`.
 *
 * Ces trois gardes lisaient le TEXTE de `TrackContextMenu` — le littéral
 * `$tr('library.otherVersions')`, la garde `{#if onOtherVersions}`, l'appel
 * `run(onOtherVersions, e)`. Le menu ne porte plus sa liste en dur : il rend ce
 * que `lib/menuPiste` produit, le même module que le nouveau client. Les trois
 * motifs ont disparu du fichier SANS que l'entrée disparaisse de l'écran.
 *
 * Une garde de texte serait donc passée au rouge pour rien — et, dans l'autre
 * sens, serait restée verte si l'entrée avait été neutralisée. On monte le
 * composant. Ce qui est gardé ne change pas d'un pouce : l'entrée est rendue,
 * elle est facultative, et elle ferme le menu avant d'agir.
 */
describe('menu contextuel d\u2019une piste — entrée « Autres versions »', () => {
  let monte: any = null;
  let hote: HTMLElement | null = null;
  afterEach(() => {
    if (monte) unmount(monte, { outro: false });
    monte = null;
    if (hote) hote.remove();
    hote = null;
  });
  function poser(props: any) {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(TrackContextMenu, { target: hote, props });
    flushSync();
    return hote;
  }
  const libelles = (r: HTMLElement) =>
    [...r.querySelectorAll('.track-menu-item')].map((b) => (b.textContent ?? '').trim());
  const LIBELLE = (fr as Dict)['library.otherVersions'] as string;
  const rien = () => {};
  it('le menu porte une entrée « Autres versions »', () => {
    const r = poser({ onClose: rien, onPlay: rien, onAddToQueue: rien, onOtherVersions: rien });
    expect(libelles(r), 'le menu ne rend aucune entrée « Autres versions »').toContain(LIBELLE);
  });
  it('l\u2019entrée est facultative : un appelant qui ne la fournit pas ne la voit pas', () => {
    const r = poser({ onClose: rien, onPlay: rien, onAddToQueue: rien });
    expect(libelles(r), 'entrée rendue sans geste : elle ouvrirait sur rien').not.toContain(LIBELLE);
  });
  it('l\u2019entrée ferme le menu AVANT d\u2019agir', () => {
    // Sans cela le menu resterait ouvert par-dessus le résultat.
    const ordre: string[] = [];
    const r = poser({
      onClose: () => ordre.push('fermeture'),
      onPlay: rien,
      onAddToQueue: rien,
      onOtherVersions: () => ordre.push('action'),
    });
    const item = [...r.querySelectorAll('.track-menu-item')]
      .find((b) => (b.textContent ?? '').trim() === LIBELLE) as HTMLElement;
    expect(item, 'entrée introuvable').toBeTruthy();
    item.click();
    flushSync();
    expect(ordre).toEqual(['fermeture', 'action']);
  });
});

describe('LibraryView — l\'entrée est branchée aux DEUX menus de la fiche d\'album', () => {
  /**
   * Borné à la fiche d'album depuis #2574 : l'onglet « Titres » monte lui aussi
   * un TrackContextMenu, mais SANS « Autres versions » — la ligne dépliante
   * `track-versions-row` qui en affiche le résultat n'y est pas rendue. Compter
   * sur tous les montages du fichier reviendrait à exiger une entrée muette.
   */
  it('les deux montages de la fiche d\'album reçoivent onOtherVersions', () => {
    const debut = LIBRARY.indexOf('{#if hasMultipleDiscs}');
    const fin = LIBRARY.indexOf("{:else if $libraryTab === 'artists'}", debut);
    expect(debut, 'ancre de la fiche d\'album introuvable').toBeGreaterThan(-1);
    expect(fin, 'fin de la fiche d\'album introuvable').toBeGreaterThan(debut);
    const fiche = LIBRARY.slice(debut, fin);
    const montages = fiche.split('<TrackContextMenu').length - 1;
    expect(montages, 'le nombre de menus de la fiche d\'album a changé').toBe(2);
    const branchements = fiche.split('onOtherVersions={').length - 1;
    expect(
      branchements,
      `onOtherVersions n'est branché que sur ${branchements} menu(s) sur ${montages} : ` +
        'un album à un disque et un album à plusieurs disques n\'offriraient pas la même chose',
    ).toBe(montages);
  });

  it('l\'action déplie une ligne sous la piste, elle ne navigue pas', () => {
    expect(
      LIBRARY.includes('toggleTrackVersions'),
      "aucune bascule `toggleTrackVersions` : l'action ne déplie rien",
    ).toBe(true);
    expect(
      LIBRARY.includes('track-versions-row'),
      'aucune ligne dépliée `track-versions-row` — la surface retenue est celle des crédits',
    ).toBe(true);
  });

  it('le cas vide est écrit, pas laissé blanc', () => {
    expect(
      LIBRARY.includes("$tr('library.noOtherVersions')"),
      'un morceau sans autre version afficherait un panneau vide',
    ).toBe(true);
  });
});

describe('api.ts — la route par piste', () => {
  it('appelle bien `/library/tracks/{id}/versions`', () => {
    expect(
      API.includes('export function getTrackVersions'),
      'getTrackVersions absente de api.ts',
    ).toBe(true);
    expect(
      /\/library\/tracks\/\$\{[A-Za-z]+\}\/versions/.test(API),
      "l'URL appelée n'est pas /library/tracks/{id}/versions",
    ).toBe(true);
  });
});

describe('i18n — les onze langues livrées', () => {
  it('couvre bien onze langues', () => {
    expect(LANGUES).toHaveLength(11);
  });

  for (const cle of CLES) {
    for (const [langue, dict] of LANGUES) {
      it(`${cle} — ${langue}`, () => {
        expect(dict[cle], `${cle} manque en ${langue}`).toBeTruthy();
      });
    }
  }

  /**
   * Le piège de #2359, transposé : la section d'accueil promettait « du
   * jour » alors que le serveur ne bornait plus sur la journée. Ici le vivier
   * n'est même pas l'historique — c'est UNE piste. Aucun libellé ne doit
   * parler d'écoutes, récentes ou non.
   */
  const ECOUTE = /écoute|ecoute|listen|hörte|gehört|escuch|ascolt|聴い|들은|ascult|lyssn|听过/iu;
  for (const [langue, dict] of LANGUES) {
    it(`library.otherVersions — ${langue} : ne parle pas d'écoutes`, () => {
      const valeur = dict['library.otherVersions'] ?? '';
      expect(
        ECOUTE.test(valeur),
        `« ${valeur} » (${langue}) évoque l'historique d'écoute, alors que ` +
          'la route part de la piste désignée',
      ).toBe(false);
    });
  }
});
