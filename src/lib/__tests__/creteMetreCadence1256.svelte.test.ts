// @vitest-environment jsdom
//
// #1256 — « high CPU/GPU usage when I open the now playing » (Levente Toth,
// fil 1848, 0.9.155, MacBook).
//
// Deux faits de code relevés sur `CreteMetre.svelte`, sans que la part de
// chacun dans la mesure du testeur soit établie :
//
//   1. la boucle redessinait à CHAQUE image de l'écran (120 Hz sur ProMotion),
//      là où `AudioVisualizer` se limite à ~30 i/s ;
//   2. elle ne s'arrêtait JAMAIS : lecture arrêtée, elle redessinait un cadran
//      vide à pleine cadence.
//
// 🔴 CES TÉMOINS MONTENT LE COMPOSANT. `requestAnimationFrame` est remplacé par
// une horloge que le test fait avancer image par image, et la toile par un
// contexte qui COMPTE les dessins (`clearRect` ouvre chaque image). On mesure
// donc ce que le composant fait réellement, pas ce que la règle dit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CreteMetre from '../../components/partages/CreteMetre.svelte';
import { currentZoneId } from '../stores/zones';
import { handleAudioLevelsEvent } from '../stores/audioLevels';
import { PLANCHER_DB } from '../peakMetre';
import { INTERVALLE_CRETE_MS, retombeAuRepos, tempsDeDessiner } from '../cadenceCreteMetre';

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

const A_120_HZ = 1000 / 120;
const A_60_HZ = 1000 / 60;

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  fileRaf = [];
  horloge = 1000;
  dessins = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    fileRaf.push(cb);
    return fileRaf.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    fileRaf = [];
  });
  const ctx = new Proxy(
    {},
    {
      get(_c, nom) {
        if (nom === 'clearRect') return () => { dessins++; };
        return () => {};
      },
      set() { return true; },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
  // Une zone qui joue FORT : barres hautes, trait PPM accroché.
  currentZoneId.set(1);
  handleAudioLevelsEvent({ zone_id: 1, peak_left_db: -6, peak_right_db: -6 });
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  handleAudioLevelsEvent({ zone_id: 1 });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function monter(joue: boolean) {
  const props = $state({ style: 'dat' as const, hauteur: 26, largeur: 200, joue });
  monte = mount(CreteMetre, { target: hote!, props });
  flushSync();
  return props;
}

describe('#1256 — le crête-mètre ne dessine qu’à ~30 images par seconde', () => {
  it('🔴 en lecture, sur un écran à 120 Hz, une seconde = ~30 dessins, pas 120', () => {
    monter(true);
    images(120, A_120_HZ);
    expect(dessins, `le crête-mètre a dessiné ${dessins} fois en une seconde : il suit la fréquence de l'écran`)
      .toBeLessThanOrEqual(32);
    expect(dessins, 'le crête-mètre ne dessine plus du tout en lecture').toBeGreaterThanOrEqual(28);
  });

  it('à 60 Hz, une image sur deux', () => {
    monter(true);
    images(60, A_60_HZ);
    expect(dessins).toBeGreaterThanOrEqual(28);
    expect(dessins).toBeLessThanOrEqual(31);
  });
});

describe('#1256 — lecture arrêtée, la boucle s’arrête une fois tout retombé', () => {
  it('🔴 à l’arrêt, les barres retombent en douceur, puis plus aucun dessin ni réveil', () => {
    const props = monter(true);
    images(30, A_60_HZ); // les barres montent à -6 dB, le trait PPM s'accroche
    props.joue = false;
    flushSync();
    const avantRetombee = dessins;
    images(180, A_60_HZ); // trois secondes
    const retombee = dessins - avantRetombee;
    // La retombée n'est pas coupée net : les barres descendent sur plusieurs
    // images avant de s'éteindre.
    expect(retombee, 'les barres ont été coupées net au lieu de retomber').toBeGreaterThan(5);
    expect(fileRaf.length, 'lecture arrêtée depuis trois secondes, la boucle se ré-arme encore à chaque image')
      .toBe(0);
    const figes = dessins;
    images(600, A_60_HZ); // dix secondes de plus
    expect(dessins - figes, 'un cadran vide est encore redessiné à l’arrêt').toBe(0);
  });

  it('la reprise de la lecture relance la boucle', () => {
    const props = monter(false);
    images(120, A_60_HZ);
    expect(fileRaf.length, 'la boucle aurait dû s’arrêter').toBe(0);
    props.joue = true;
    flushSync();
    const avant = dessins;
    images(60, A_60_HZ);
    expect(dessins - avant, 'la lecture a repris et le crête-mètre reste figé').toBeGreaterThanOrEqual(28);
  });
});

describe('les deux règles, appelées', () => {
  it('tempsDeDessiner : ~33 ms entre deux dessins, à une milliseconde près', () => {
    expect(INTERVALLE_CRETE_MS).toBeCloseTo(33.33, 1);
    expect(tempsDeDessiner(1000 + A_60_HZ, 1000)).toBe(false);
    expect(tempsDeDessiner(1000 + 2 * A_60_HZ, 1000)).toBe(true);
    expect(tempsDeDessiner(1000 + 3 * A_120_HZ, 1000)).toBe(false);
    expect(tempsDeDessiner(1000 + 4 * A_120_HZ, 1000)).toBe(true);
  });

  it('retombeAuRepos : jamais en lecture ; hors lecture, seulement tout retombé', () => {
    const decroche = [{ db: null, depuisMs: 0 }, { db: null, depuisMs: 0 }];
    expect(retombeAuRepos(true, [PLANCHER_DB, PLANCHER_DB], decroche)).toBe(false);
    expect(retombeAuRepos(false, [PLANCHER_DB, PLANCHER_DB], decroche)).toBe(true);
    expect(retombeAuRepos(false, [-30, PLANCHER_DB], decroche)).toBe(false);
    expect(retombeAuRepos(false, [PLANCHER_DB, PLANCHER_DB], [{ db: -6, depuisMs: 1 }, decroche[1]])).toBe(false);
  });
});
