import { describe, expect, it } from 'vitest';
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

describe('menu « … » d\'une piste — entrée « Autres versions »', () => {
  it('le menu porte une entrée « Autres versions »', () => {
    expect(
      MENU.includes("$tr('library.otherVersions')"),
      "TrackContextMenu ne rend aucune entrée « Autres versions »",
    ).toBe(true);
  });

  it('l\'entrée est facultative — un appelant qui ne la fournit pas ne la voit pas', () => {
    expect(
      /onOtherVersions\?\s*:\s*\(\)\s*=>\s*void/.test(MENU),
      'la prop onOtherVersions doit être optionnelle, comme onPlaySimilar',
    ).toBe(true);
    const item = MENU.indexOf("$tr('library.otherVersions')");
    const garde = MENU.lastIndexOf('{#if onOtherVersions}', item);
    expect(garde, "l'entrée n'est pas gardée par `{#if onOtherVersions}`").toBeGreaterThan(-1);
    expect(
      item - garde,
      'la garde trouvée est trop loin : c\'est celle d\'une autre entrée',
    ).toBeLessThan(500);
  });

  it('l\'entrée passe par `run()` — elle ferme le menu avant d\'agir', () => {
    expect(
      MENU.includes('run(onOtherVersions, e)'),
      "l'action ne passe pas par run() : le menu resterait ouvert par-dessus le résultat",
    ).toBe(true);
  });
});

describe('LibraryView — l\'entrée est branchée aux DEUX menus', () => {
  it('les deux montages de TrackContextMenu reçoivent onOtherVersions', () => {
    const montages = LIBRARY.split('<TrackContextMenu').length - 1;
    expect(montages, 'le nombre de menus montés a changé').toBe(2);
    const branchements = LIBRARY.split('onOtherVersions={').length - 1;
    expect(
      branchements,
      `onOtherVersions n'est branché que sur ${branchements} menu(s) sur ${montages} : ` +
        'un des deux écrans de pistes resterait sans accès',
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
