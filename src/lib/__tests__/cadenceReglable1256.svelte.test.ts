// @vitest-environment jsdom
//
// #1256 — la cadence des animations, RÉGLABLE (décision de Bertrand, 23/09/2026).
//
// 🔴 CES TÉMOINS MONTENT LES VRAIS COMPOSANTS et COMPTENT LES DESSINS.
// `requestAnimationFrame` est remplacé par une horloge que le test fait avancer
// image par image, et la toile par un contexte qui compte `clearRect` — appelé
// une fois et une seule par image réellement peinte (`CreteMetre.svelte`,
// `AudioVisualizer.svelte`). C'est la colonne `dessins/s` de #1499, celle sans
// laquelle une régression visuelle serait partie pour une économie.
//
// Une garde de texte (« le module exporte CADENCE_HZ ») serait satisfaite par
// une constante écrite et jamais branchée. Ici, ce qui est mesuré est ce que
// l'utilisateur voit bouger.
//
// Le réglage lui-même — défaut, blob existant, blob abîmé, onze langues — est
// mesuré dans `cadenceAnimations1256.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';
import CreteMetre from '../../components/partages/CreteMetre.svelte';
import AudioVisualizer from '../../components/partages/AudioVisualizer.svelte';
import { currentZoneId } from '../stores/zones';
import { handleAudioLevelsEvent } from '../stores/audioLevels';
import { preferences } from '../stores/preferences';
import { CADENCE_HZ, type CranCadence } from '../cadenceAnimations';

let fileRaf: Array<(t: number) => void> = [];
let horloge = 0;
let dessins = 0;

/** Fait passer `n` images de l'écran, espacées de `pasMs`. */
function images(n: number, pasMs: number) {
  for (let i = 0; i < n; i++) {
    horloge += pasMs;
    const rappels = fileRaf;
    fileRaf = [];
    for (const r of rappels) r(horloge);
  }
}

/** L'écran de Levente : un MacBook ProMotion. */
const A_120_HZ = 1000 / 120;
const IMAGES_UNE_SECONDE = 120;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  fileRaf = [];
  // 🔴 APRÈS `performance.now()` réel : l'horloge du test ne doit jamais
  // rendre d'écart NÉGATIF avec un horodatage que le composant aurait pris
  // lui-même (l'ancien `lastFrame = performance.now()` d'`AudioVisualizer`,
  // parti avec le ticket 150 — `boucleImages` part de `-Infinity`). Sinon le
  // composant ne dessinerait jamais, et les trois crans rendraient 0 — un
  // faux vert « le cran minimal dessine peu » compris.
  horloge = performance.now() + 10_000;
  dessins = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    fileRaf.push(cb);
    return fileRaf.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => { fileRaf = []; });
  vi.stubGlobal('ResizeObserver', class {
    observe() {} unobserve() {} disconnect() {}
  });
  const ctx = new Proxy({}, {
    get(_c, nom) {
      if (nom === 'clearRect') return () => { dessins++; };
      if (nom === 'createLinearGradient') {
        return () => ({ addColorStop: () => {} });
      }
      if (nom === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set() { return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
  currentZoneId.set(1);
  handleAudioLevelsEvent({ zone_id: 1, peak_left_db: -6, peak_right_db: -6 });
  preferences.update((p) => ({ ...p, cadenceAnimations: 'fluide' as CranCadence }));
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  handleAudioLevelsEvent({ zone_id: 1 });
  currentZoneId.set(null);
  preferences.update((p) => ({ ...p, cadenceAnimations: 'fluide' as CranCadence }));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Monte le crête-mètre au cran demandé et rend les dessins d'UNE seconde. */
function dessinsDuCreteMetre(cran: CranCadence): number {
  preferences.update((p) => ({ ...p, cadenceAnimations: cran }));
  flushSync();
  monte = mount(CreteMetre, {
    target: hote!,
    props: { style: 'dat' as const, hauteur: 26, largeur: 200, joue: true },
  });
  flushSync();
  dessins = 0;
  images(IMAGES_UNE_SECONDE, A_120_HZ);
  return dessins;
}

/** Idem pour le spectre. */
function dessinsDuVisualiseur(cran: CranCadence): number {
  preferences.update((p) => ({ ...p, cadenceAnimations: cran }));
  flushSync();
  monte = mount(AudioVisualizer, {
    target: hote!,
    props: { playing: true, mode: 'spectrum' as const, height: 80 },
  });
  flushSync();
  dessins = 0;
  images(IMAGES_UNE_SECONDE, A_120_HZ);
  return dessins;
}

/** Deux images près : l'horloge du test tombe rarement pile sur l'intervalle. */
function attendu(cran: CranCadence) {
  return { bas: CADENCE_HZ[cran] - 2, haut: CADENCE_HZ[cran] + 2 };
}

describe('#1256 — le crête-mètre suit le cran choisi, à l’écran', () => {
  for (const cran of ['fluide', 'econome', 'minimal'] as CranCadence[]) {
    it(`cran « ${cran} » : ~${CADENCE_HZ[cran]} dessins en une seconde, sur un écran 120 Hz`, () => {
      const n = dessinsDuCreteMetre(cran);
      const { bas, haut } = attendu(cran);
      expect(n, `le crête-mètre a dessiné ${n} fois : le cran « ${cran} » n’est pas appliqué`)
        .toBeGreaterThanOrEqual(bas);
      expect(n, `le crête-mètre a dessiné ${n} fois : le cran « ${cran} » n’est pas appliqué`)
        .toBeLessThanOrEqual(haut);
    });
  }

  it('🔴 le DÉFAUT reste 30 : le cran non choisi ne ralentit rien', () => {
    // Le magasin n'est pas touché : c'est l'utilisateur qui n'a rien demandé.
    monte = mount(CreteMetre, {
      target: hote!,
      props: { style: 'dat' as const, hauteur: 26, largeur: 200, joue: true },
    });
    flushSync();
    expect(get(preferences).cadenceAnimations).toBe('fluide');
    dessins = 0;
    images(IMAGES_UNE_SECONDE, A_120_HZ);
    expect(dessins, `l’affichage de qui n’a rien demandé a changé (${dessins} dessins au lieu de ~30)`)
      .toBeGreaterThanOrEqual(28);
    expect(dessins).toBeLessThanOrEqual(32);
  });

  it('changer de cran ne demande AUCUN rechargement', () => {
    monte = mount(CreteMetre, {
      target: hote!,
      props: { style: 'dat' as const, hauteur: 26, largeur: 200, joue: true },
    });
    flushSync();
    dessins = 0;
    images(IMAGES_UNE_SECONDE, A_120_HZ);
    const aTrente = dessins;
    preferences.update((p) => ({ ...p, cadenceAnimations: 'minimal' as CranCadence }));
    flushSync();
    dessins = 0;
    images(IMAGES_UNE_SECONDE, A_120_HZ);
    expect(aTrente, 'le témoin de départ ne mesure rien').toBeGreaterThanOrEqual(28);
    expect(dessins, `le réglage est passé à « minimal » et la boucle dessine encore ${dessins} fois`)
      .toBeLessThanOrEqual(17);
  });
});

describe('#1256 — le spectre suit le MÊME cran : pas au seul crête-mètre', () => {
  for (const cran of ['fluide', 'econome', 'minimal'] as CranCadence[]) {
    it(`cran « ${cran} » : ~${CADENCE_HZ[cran]} dessins en une seconde`, () => {
      const n = dessinsDuVisualiseur(cran);
      const { bas, haut } = attendu(cran);
      expect(n, `le spectre a dessiné ${n} fois : le cran « ${cran} » n’est pas appliqué`)
        .toBeGreaterThanOrEqual(bas);
      expect(n, `le spectre a dessiné ${n} fois : le cran « ${cran} » n’est pas appliqué`)
        .toBeLessThanOrEqual(haut);
    });
  }
});

describe('#1256 — ce que les mesures interdisaient : un cadenceur de plus', () => {
  it('🔴 aucun dessin PERDU : le compte suit la cadence, il ne tombe pas dessous', () => {
    // La variante C de #1499 affichait −41 % et ne faisait que 61 dessins sur
    // 120 : ce n'était pas une économie, c'était une image sur deux qui
    // disparaissait — deux cadenceurs en série qui ne tombaient pas d'accord.
    // Ici il n'y a qu'UN cadenceur par boucle ; ce témoin le mesure en exigeant
    // le compte PLEIN, et pas seulement « moins qu'avant ».
    for (const cran of ['fluide', 'econome', 'minimal'] as CranCadence[]) {
      const n = dessinsDuCreteMetre(cran);
      expect(n, `cran « ${cran} » : ${n} dessins pour ${CADENCE_HZ[cran]} attendus — une image sur deux manque`)
        .toBeGreaterThanOrEqual(CADENCE_HZ[cran] - 2);
      if (monte) unmount(monte);
      monte = null;
    }
  });

  it('la boucle s’arrête toujours hors lecture, à tous les crans (#1269 préservé)', () => {
    preferences.update((p) => ({ ...p, cadenceAnimations: 'minimal' as CranCadence }));
    flushSync();
    const props = $state({ style: 'dat' as const, hauteur: 26, largeur: 200, joue: true });
    monte = mount(CreteMetre, { target: hote!, props });
    flushSync();
    images(60, A_120_HZ);
    props.joue = false;
    flushSync();
    images(600, A_120_HZ); // cinq secondes
    expect(fileRaf.length,
      'lecture arrêtée depuis cinq secondes, la boucle se ré-arme encore').toBe(0);
    const figes = dessins;
    images(600, A_120_HZ);
    expect(dessins - figes, 'un cadran vide est encore redessiné à l’arrêt').toBe(0);
  });
});
