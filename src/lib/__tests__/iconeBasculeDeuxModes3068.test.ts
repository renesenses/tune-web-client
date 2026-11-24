// @vitest-environment jsdom
//
// Fil 3068 (Linux, rc13.2) — en relisant la bascule d'affichage.
//
// Le bouton `BasculeAffichage` montre l'icône du mode où le clic MÈNE (#929).
// Sans `iconeDeDestination`, l'icône était pourtant choisie d'après le mode
// COURANT, en supposant la rotation à trois crans de la Bibliothèque
// (grille → liste → carrousel). Sur un écran à DEUX crans (`GRILLE_OU_LISTE` :
// Favoris, Collection physique, onglets de la Bibliothèque autres qu'Albums,
// liste des labels), le mode liste montrait donc l'icône du CARROUSEL alors
// que le clic mène à la grille et que le libellé dit « grille ».
//
// 🔴 La convention ne change pas : l'icône annonce toujours la destination.
// La contre-épreuve garde au caractère près le dessin de la Bibliothèque à
// trois crans et celui des écrans qui passaient déjà `iconeDeDestination`.
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import BasculeAffichage from '../../components/v2/BasculeAffichage.svelte';
import { AFFICHAGES, GRILLE_OU_LISTE, LISTE_ET_DEUX_GRILLES, type AffichageEtendu } from '../affichage';
import { VUES_LABELS } from '../logosLabels';

/** Les quatre dessins, recopiés du gabarit tels qu'ils étaient avant ce correctif. */
const ICONE = {
  list: '<path d="M4 6h16M4 12h16M4 18h16"></path>',
  carousel: '<rect x="2" y="7" width="4" height="10"></rect><rect x="8.5" y="4" width="7" height="16"></rect><rect x="18" y="7" width="4" height="10"></rect>',
  grid: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>',
  gridLarge: '<rect x="3" y="4" width="8" height="16"></rect><rect x="13" y="4" width="8" height="16"></rect>',
} as const;

const montes: { m: Record<string, any>; h: HTMLDivElement }[] = [];
afterEach(() => {
  for (const { m, h } of montes.splice(0)) { unmount(m); h.remove(); }
});

function poser(modes: readonly AffichageEtendu[], valeur: AffichageEtendu, iconeDeDestination = false) {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const recu: AffichageEtendu[] = [];
  const m = mount(BasculeAffichage as any, {
    target: h,
    props: { modes, valeur, onChanger: (v: AffichageEtendu) => recu.push(v), iconeDeDestination },
  });
  montes.push({ m, h });
  flushSync();
  const bouton = h.querySelector('button.viewtog') as HTMLButtonElement;
  return { bouton, icone: bouton.querySelector('svg')!.innerHTML, recu };
}

/** Le mode où mène le clic, lu sur le rappel réellement appelé. */
function destination(b: ReturnType<typeof poser>): AffichageEtendu {
  b.bouton.click();
  flushSync();
  return b.recu.at(-1)!;
}

describe('fil 3068 — écran à deux crans : l’icône annonce la destination', () => {
  for (const [nom, modes] of [['GRILLE_OU_LISTE', GRILLE_OU_LISTE], ['VUES_LABELS', VUES_LABELS]] as const) {
    it(`${nom}, en liste : icône de la GRILLE, pas du carrousel`, () => {
      const b = poser(modes, 'list');
      expect(b.icone).not.toBe(ICONE.carousel);
      expect(b.icone).toBe(ICONE.grid);
      expect(destination(b)).toBe('grid');
    });

    it(`${nom}, en grille : icône de la liste`, () => {
      const b = poser(modes, 'grid');
      expect(b.icone).toBe(ICONE.list);
      expect(destination(b)).toBe('list');
    });

    it(`${nom} : jamais d’icône de carrousel sur un écran qui n’en a pas`, () => {
      for (const v of modes) expect(poser(modes, v).icone).not.toBe(ICONE.carousel);
    });
  }
});

describe('fil 3068 — contre-épreuve : rendu inchangé ailleurs', () => {
  // Bibliothèque, onglet Albums : grille → liste → carrousel → grille.
  const TROIS: [AffichageEtendu, keyof typeof ICONE, AffichageEtendu][] = [
    ['grid', 'list', 'list'],
    ['list', 'carousel', 'carousel'],
    ['carousel', 'grid', 'grid'],
  ];
  for (const [valeur, icone, suivant] of TROIS) {
    it(`Bibliothèque à trois crans, en ${valeur} : même icône (${icone}), même libellé, mêmes pastilles`, () => {
      const b = poser(AFFICHAGES, valeur);
      expect(b.icone).toBe(ICONE[icone]);
      expect(b.bouton.getAttribute('data-vue')).toBe(valeur);
      expect(b.bouton.querySelectorAll('.vpts i').length).toBe(3);
      expect(b.bouton.querySelectorAll('.vpts i.on').length).toBe(1);
      expect(destination(b)).toBe(suivant);
    });
  }

  it('Bibliothèque hors Albums, carrousel retenu : icône de la grille, comme avant', () => {
    const b = poser(GRILLE_OU_LISTE, 'carousel');
    expect(b.icone).toBe(ICONE.grid);
    expect(destination(b)).toBe('grid');
  });

  // « Écouter plus tard », Collections, Playlists : `iconeDeDestination` déjà passé.
  const DEUX_GRILLES: [AffichageEtendu, keyof typeof ICONE][] = [
    ['list', 'grid'],
    ['grid', 'gridLarge'],
    ['gridLarge', 'list'],
  ];
  for (const [valeur, icone] of DEUX_GRILLES) {
    it(`LISTE_ET_DEUX_GRILLES avec iconeDeDestination, en ${valeur} : icône ${icone}`, () => {
      expect(poser(LISTE_ET_DEUX_GRILLES, valeur, true).icone).toBe(ICONE[icone]);
    });
  }
});
