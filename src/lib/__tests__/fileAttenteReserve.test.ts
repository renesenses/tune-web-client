import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FILE_ATTENTE_LARGEUR_DEPLIEE,
  FILE_ATTENTE_LARGEUR_PAR_DEFAUT,
  largeurReserveeFileAttente,
} from '../fileAttenteReserve';
import { extraireFeuilleDeStyle } from '../cascadeCss';
import { largeurMaxEffective, releverReglesLargeur, type Ecran } from '../nowPlayingPaliers';

/**
 * « Lecture en cours » : le panneau File d'attente recouvrait le bloc lecteur
 * — renesenses/tune-server-rust#3676.
 *
 * Pierre M, forum fil 911, 03/07/2026, capture à l'appui : le bloc lecteur est
 * coupé net à la verticale du bord gauche du panneau. Sa suggestion —
 * « on peut la pousser vers la gauche et éviter le chevauchement » — est le
 * remède exact.
 *
 * CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PAS
 * ---------------------------------------------------
 * Aucun navigateur n'est ouvert ici, et jsdom n'appliquerait ni la cascade ni
 * les requêtes de média : un test de rendu serait vert quoi qu'il arrive.
 *
 * Ce fichier fait donc deux choses distinctes :
 *
 *  1. il APPELLE `largeurReserveeFileAttente()`, la fonction que
 *     `NowPlaying.svelte` appelle pour poser `--np-reserve-file` sur la racine
 *     de l'écran, et vérifie que le site d'appel existe bien ;
 *  2. il rejoue l'arithmétique de placement sur les largeurs RÉELLEMENT lues
 *     dans la feuille du composant, dans les deux formes : l'ancienne
 *     (`max-width` sur un bloc centré) et la nouvelle (retrait à droite du
 *     conteneur). L'ancienne doit recouvrir, la nouvelle non.
 *
 * Il ne prouve pas le rendu pixel d'un navigateur ; cela demanderait un test
 * de bout en bout, qui n'existe pas dans ce dépôt.
 */

const CHEMIN = resolve(process.cwd(), 'src/components/NowPlaying.svelte');
const SOURCE = readFileSync(CHEMIN, 'utf-8');
const FEUILLE = extraireFeuilleDeStyle(SOURCE);
const REGLES = releverReglesLargeur(FEUILLE);

describe('largeurReserveeFileAttente — la fonction appelée par NowPlaying', () => {
  it('ne réserve rien quand la file est fermée', () => {
    expect(largeurReserveeFileAttente(true, 'collapsed', null)).toBe(0);
    expect(largeurReserveeFileAttente(true, 'collapsed', 900)).toBe(0);
  });

  it('ne réserve rien en disposition étroite — le panneau y est ancré EN BAS', () => {
    // Contre-épreuve du garde : réserver à droite sur un petit écran
    // pousserait le contenu dans le vide sans qu'aucun panneau n'y soit.
    expect(largeurReserveeFileAttente(false, 'expanded', null)).toBe(0);
    expect(largeurReserveeFileAttente(false, 'peek', 640)).toBe(0);
  });

  it('réserve les largeurs par défaut du panneau selon son état', () => {
    expect(largeurReserveeFileAttente(true, 'peek', null)).toBe(FILE_ATTENTE_LARGEUR_PAR_DEFAUT);
    expect(largeurReserveeFileAttente(true, 'expanded', null)).toBe(FILE_ATTENTE_LARGEUR_DEPLIEE);
  });

  it('suit la largeur choisie par l’utilisateur, au-delà comme en deçà', () => {
    // Le second aggravant du ticket : le panneau est librement redimensionnable
    // (`tune.queueSheetWidth`, minimum 240 px, sans maximum) face à une réserve
    // qui était une constante 420 px. Élargir aggravait le recouvrement.
    expect(largeurReserveeFileAttente(true, 'expanded', 900)).toBe(900);
    expect(largeurReserveeFileAttente(true, 'peek', 240)).toBe(240);
  });
});

describe('Le site d’appel existe — la fonction n’est pas écrite sans être branchée', () => {
  it('NowPlaying.svelte importe la fonction', () => {
    expect(SOURCE).toMatch(
      /import\s*\{\s*largeurReserveeFileAttente\s*\}\s*from\s*'\.\.\/lib\/fileAttenteReserve'/,
    );
  });

  it('NowPlaying.svelte l’appelle avec l’état et la largeur choisie', () => {
    expect(SOURCE).toMatch(
      /largeurReserveeFileAttente\(\s*isWide\s*,\s*queueSheetState\s*,\s*sheetCustomWidth\s*,?\s*\)/,
    );
  });

  it('le résultat est posé sur la racine de l’écran', () => {
    expect(SOURCE).toMatch(/--np-reserve-file:\s*\{reserveFileAttente\}px/);
  });

  it('et `.np-scroll` le consomme en retrait à droite', () => {
    expect(FEUILLE).toMatch(
      /\.np-scroll\s*\{[^}]*padding-right:\s*var\(--np-reserve-file,\s*0px\)/,
    );
  });

  it('l’ancienne réserve centrée n’est plus déclarée', () => {
    // `extraireFeuilleDeStyle` conserve les commentaires ; la cascade les
    // retire. On interroge donc la feuille brute en excluant le bloc de
    // commentaire qui documente la règle retirée.
    const sansCommentaires = FEUILLE.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sansCommentaires).not.toMatch(/max-width:\s*calc\(100%\s*-\s*420px\)/);
  });
});

describe('Les largeurs du panneau déclarées par la feuille n’ont pas dérivé', () => {
  // Les deux constantes du module TypeScript doivent rester celles du CSS,
  // sans quoi la réserve cesserait de correspondre au panneau réellement rendu.
  it('`.queue-sheet.wide-layout` déclare la largeur par défaut', () => {
    const bloc = /\.queue-sheet\.wide-layout\s*\{([^}]*)\}/.exec(FEUILLE);
    expect(bloc, 'règle .queue-sheet.wide-layout introuvable').not.toBeNull();
    expect(bloc![1]).toContain(`width: ${FILE_ATTENTE_LARGEUR_PAR_DEFAUT}px`);
  });

  it('`.queue-sheet.wide-layout.expanded` déclare la largeur dépliée', () => {
    const bloc = /\.queue-sheet\.wide-layout\.expanded\s*\{([^}]*)\}/.exec(FEUILLE);
    expect(bloc, 'règle .queue-sheet.wide-layout.expanded introuvable').not.toBeNull();
    expect(bloc![1]).toContain(`width: ${FILE_ATTENTE_LARGEUR_DEPLIEE}px`);
  });
});

/**
 * Placement du bloc lecteur, rejoué à la main.
 *
 * `.now-playing` porte un `padding` (`--space-xl`, non résolu ici : on balaie
 * une plage de valeurs plausibles). `.np-scroll` occupe sa boîte de contenu et
 * CENTRE son enfant. Le panneau, lui, est `position: absolute; right: 0`,
 * donc son bord gauche est à `W − Wp` du bord gauche de la fenêtre.
 */
function bordDroitDuBloc(
  largeurFenetre: number,
  padding: number,
  ilotMax: number,
  reserve: number,
): number {
  const boite = largeurFenetre - 2 * padding - reserve;
  const bloc = Math.min(ilotMax, Math.max(0, boite));
  const gauche = padding + (boite - bloc) / 2;
  return gauche + bloc;
}

const FENETRES = [1000, 1200, 1400, 1600, 1920, 2560];
const PADDINGS = [0, 16, 24, 32, 40];

/** `max-width` de l'îlot lue dans la feuille, à la largeur d'écran donnée. */
function ilotMax(largeurFenetre: number): number {
  const ecran: Ecran = { largeur: largeurFenetre, hauteur: 1080 };
  const valeur = largeurMaxEffective(REGLES, ['.content-layout', '.content-layout.wide'], ecran);
  expect(valeur, `max-width de l'îlot non résolue à ${largeurFenetre}px`).not.toBeNull();
  return valeur as number;
}

describe('La forme fautive, reproduite — elle DOIT recouvrir', () => {
  // Sans cette moitié, le test suivant pourrait être vert par accident, par
  // exemple si l'îlot était déjà trop étroit pour recouvrir quoi qu'il arrive.
  it('un bloc centré rétréci de 420 px passe sous le panneau', () => {
    const recouvrements: string[] = [];
    for (const W of FENETRES) {
      for (const p of PADDINGS) {
        // L'ancienne règle : la réserve est une `max-width` sur le BLOC, le
        // conteneur garde toute sa largeur et continue de centrer.
        const boite = W - 2 * p;
        const plafond = Math.min(ilotMax(W), boite - FILE_ATTENTE_LARGEUR_DEPLIEE);
        const droite = bordDroitDuBloc(W, p, plafond, 0);
        if (droite > W - FILE_ATTENTE_LARGEUR_DEPLIEE) recouvrements.push(`${W}/${p}`);
      }
    }
    expect(recouvrements.length, 'aucun recouvrement reproduit').toBeGreaterThan(0);
  });
});

describe('La forme livrée — le bloc reste à gauche du panneau', () => {
  for (const W of FENETRES) {
    for (const p of PADDINGS) {
      it(`fenêtre ${W} px, padding ${p} px : aucun recouvrement`, () => {
        for (const largeurPanneau of [
          FILE_ATTENTE_LARGEUR_PAR_DEFAUT,
          FILE_ATTENTE_LARGEUR_DEPLIEE,
          600, // panneau élargi à la main par l'utilisateur
        ]) {
          const reserve = largeurReserveeFileAttente(true, 'expanded', largeurPanneau);
          const droite = bordDroitDuBloc(W, p, ilotMax(W), reserve);
          expect(
            droite,
            `bord droit ${droite} px au-delà du panneau (${W}px, padding ${p}px, panneau ${largeurPanneau}px)`,
          ).toBeLessThanOrEqual(W - largeurPanneau);
        }
      });
    }
  }
});
