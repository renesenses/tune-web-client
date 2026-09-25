// @vitest-environment jsdom
//
// #995 — Alex Campbell, 13/09/2026, sur Oxygen : « when you click the queue
// button or switch screens it breaks the visuals like the meters under the
// artwork and the spectrum analyzer ».
//
// Le geste, dans la coquille d'aujourd'hui (`ShellV2`) : le bouton « file » de
// la barre de transport fait `activeView.set('queue')`, et « changer d'écran »
// fait de même vers une autre vue. Dans les deux cas « Lecture en cours » est
// DÉMONTÉ — son analyseur (`AudioVisualizer`) et son crête-mètre sous la
// pochette (`CreteMetre`) avec lui — puis REMONTÉ au retour. Pendant ce temps,
// la barre de transport garde SON mini-analyseur, monté en continu.
//
// 🔴 CES TÉMOINS MONTENT LES VRAIS COMPOSANTS. `requestAnimationFrame` est une
// file que le test vide image par image, et la toile un contexte qui COMPTE
// les tracés. « Cassé » se mesure donc ainsi : après le retour, la boucle
// tourne-t-elle, et la toile reçoit-elle des tracés ? Et après le départ,
// reste-t-il une boucle orpheline qui se disputerait la toile ?
//
// Les trois familles du ticket, chacune couverte :
//   1. boucle non libérée au démontage → « aller-retour » et « deux boucles » ;
//   2. toile de taille nulle au remontage → « toile mesurée à zéro » ;
//   3. `rAF` gelé sur un contenu masqué → « onglet caché puis revenu ».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AudioVisualizer from '../../components/partages/AudioVisualizer.svelte';
import CreteMetre from '../../components/partages/CreteMetre.svelte';
import { handleAudioLevelsEvent } from '../stores/audioLevels';
import { currentZoneId } from '../stores/zones';

type Monte = ReturnType<typeof mount>;

let horloge: number;
let prochainId: number;
let file: Map<number, FrameRequestCallback>;
/** Tracés reçus, toutes toiles confondues : `fill` (barres) et `fillRect` (crêtes). */
let traces: number;
/** Les observateurs de taille posés, pour les déclencher comme le ferait le navigateur. */
let observateurs: Array<{ cb: ResizeObserverCallback; cibles: Element[] }>;
let largeurMesuree: number;
let visibilite: DocumentVisibilityState;
let hote: HTMLDivElement;
let montes: Monte[];

const ZONE = 9950;

function niveaux(zone = ZONE) {
  handleAudioLevelsEvent({
    zone_id: zone, rms_left_db: -18, rms_right_db: -18,
    peak_left_db: -6, peak_right_db: -6,
    spectrum_db: Array(32).fill(-20),
  });
  flushSync();
}

/** Une image de l'écran, 40 ms après la précédente (au-delà de la cadence de ~33 ms). */
function image() {
  horloge += 40;
  const rappels = [...file.values()];
  file.clear();
  for (const r of rappels) r(horloge);
  flushSync();
}

/** Des tracés arrivent-ils sur la toile pendant `n` images ? */
function tracesPendant(n: number): number {
  const avant = traces;
  for (let i = 0; i < n; i++) {
    niveaux();
    image();
  }
  return traces - avant;
}

function monterAnalyseur(joue: { playing: boolean }, extra: Record<string, unknown> = {}): Monte {
  const m = mount(AudioVisualizer, {
    target: hote,
    props: {
      get playing() { return joue.playing; },
      mode: 'spectrum',
      ...extra,
    },
  });
  montes.push(m);
  flushSync();
  return m;
}

function monterCrete(joue: { playing: boolean }): Monte {
  const m = mount(CreteMetre, {
    target: hote,
    props: {
      style: 'iec',
      hauteur: 26,
      get joue() { return joue.playing; },
    },
  });
  montes.push(m);
  flushSync();
  return m;
}

async function demonter(m: Monte) {
  await unmount(m);
  montes = montes.filter((x) => x !== m);
  flushSync();
}

beforeEach(() => {
  horloge = 1000;
  prochainId = 1;
  file = new Map();
  traces = 0;
  observateurs = [];
  largeurMesuree = 320;
  visibilite = 'visible';
  montes = [];
  vi.spyOn(performance, 'now').mockImplementation(() => horloge);
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
    const id = prochainId++;
    file.set(id, cb);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { file.delete(id); }));
  vi.stubGlobal('ResizeObserver', class {
    private entree: { cb: ResizeObserverCallback; cibles: Element[] };
    constructor(cb: ResizeObserverCallback) {
      this.entree = { cb, cibles: [] };
      observateurs.push(this.entree);
    }
    observe(el: Element) { this.entree.cibles.push(el); }
    disconnect() {
      this.entree.cibles = [];
      observateurs = observateurs.filter((o) => o !== this.entree);
    }
  });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilite });
  const ctx = new Proxy({}, {
    get(_c, nom) {
      if (nom === 'fill' || nom === 'fillRect') return () => { traces++; };
      if (nom === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (nom === 'measureText') return () => ({ width: 10 });
      return () => {};
    },
    set() { return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, bottom: 80, right: largeurMesuree,
    width: largeurMesuree, height: largeurMesuree > 0 ? 80 : 0, toJSON() {},
  }));
  currentZoneId.set(ZONE);
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(async () => {
  for (const m of [...montes]) await unmount(m);
  montes = [];
  hote.remove();
  // @ts-expect-error — on retire la propriété posée sur l'instance.
  delete document.visibilityState;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#995 — l’analyseur de « Lecture en cours » survit au changement d’écran', () => {
  it('🔴 trois allers-retours en lecture : au retour la boucle tourne et la toile est tracée', async () => {
    const joue = $state({ playing: true });
    let ecran = monterAnalyseur(joue);
    expect(tracesPendant(3), 'aucun tracé avant même de quitter l’écran').toBeGreaterThan(0);

    for (let aller = 1; aller <= 3; aller++) {
      await demonter(ecran); // clic sur « file » : l'écran part
      expect(file.size, `aller ${aller} : une boucle survit à l'écran démonté`).toBe(0);
      expect(tracesPendant(3), `aller ${aller} : on dessine encore sur une toile démontée`).toBe(0);

      ecran = monterAnalyseur(joue); // retour sur « Lecture en cours »
      expect(file.size, `retour ${aller} : aucune boucle armée`).toBe(1);
      expect(tracesPendant(3), `retour ${aller} : la toile ne reçoit plus aucun tracé`).toBeGreaterThan(0);
      expect(file.size, `retour ${aller} : la boucle ne s'est pas ré-armée`).toBe(1);
    }
  });

  it('🔴 le mini-analyseur de la barre, monté en continu, n’est ni doublé ni coupé par l’aller-retour', async () => {
    const joue = $state({ playing: true });
    monterAnalyseur(joue, { mini: true, height: 24 }); // la barre de transport
    let ecran = monterAnalyseur(joue); // « Lecture en cours »
    image();
    expect(file.size, 'deux composants, deux boucles — ni plus ni moins').toBe(2);

    await demonter(ecran);
    expect(file.size, 'la barre perd sa boucle, ou l’écran parti laisse la sienne').toBe(1);
    expect(tracesPendant(2), 'la barre ne dessine plus pendant qu’on est sur la file').toBeGreaterThan(0);

    ecran = monterAnalyseur(joue);
    image();
    expect(file.size, 'au retour : deux boucles, pas trois').toBe(2);
    const avant = traces;
    image();
    // 32 barres dans l'écran + 16 dans la barre : chaque toile trace les siennes.
    expect(traces - avant, 'une des deux toiles ne trace plus').toBeGreaterThanOrEqual(32 + 16);
  });

  it('🔴 quitté en pause, revenu, relancé : le dessin repart', async () => {
    const joue = $state({ playing: true });
    let ecran = monterAnalyseur(joue);
    tracesPendant(2);
    joue.playing = false;
    flushSync();
    for (let i = 0; i < 200 && file.size > 0; i++) image(); // tout retombe, la boucle se gare
    expect(file.size).toBe(0);
    await demonter(ecran);
    ecran = monterAnalyseur(joue);
    expect(file.size, 'à l’arrêt, rien à dessiner au retour').toBe(0);
    joue.playing = true;
    flushSync();
    expect(file.size, 'la reprise n’arme aucune boucle').toBe(1);
    expect(tracesPendant(3), 'la reprise ne trace rien').toBeGreaterThan(0);
  });

  it('🔴 toile mesurée à zéro au remontage (mise en page pas encore faite), puis agrandie', async () => {
    const joue = $state({ playing: true });
    const ecran = monterAnalyseur(joue);
    await demonter(ecran);

    largeurMesuree = 0;
    monterAnalyseur(joue);
    const toile = hote.querySelector('canvas')!;
    expect(toile.width).toBe(0);

    // Le navigateur pose la mise en page et notifie l'observateur de taille.
    largeurMesuree = 320;
    const obs = observateurs.find((o) => o.cibles.includes(toile));
    expect(obs, 'aucun observateur de taille sur la toile remontée').toBeDefined();
    obs!.cb([], {} as ResizeObserver);
    expect(toile.width, 'la toile reste à zéro après la mise en page').toBeGreaterThan(0);
    expect(file.size).toBe(1);
    expect(tracesPendant(2)).toBeGreaterThan(0);
  });

  it('🔴 onglet caché puis revenu (famille 3) : la boucle se ré-arme et redessine', () => {
    const joue = $state({ playing: true });
    monterAnalyseur(joue);
    tracesPendant(2);
    visibilite = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(file.size, 'une image reste en attente dans un onglet caché').toBe(0);
    visibilite = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(file.size, 'au retour dans l’onglet, la boucle ne repart pas').toBe(1);
    expect(tracesPendant(2)).toBeGreaterThan(0);
  });

  it('changement de zone sur l’écran : la boucle continue sur la nouvelle zone', () => {
    const joue = $state({ playing: true });
    monterAnalyseur(joue);
    tracesPendant(2);
    currentZoneId.set(ZONE + 1);
    niveaux(ZONE + 1);
    expect(file.size).toBe(1);
    const avant = traces;
    image();
    expect(traces).toBeGreaterThan(avant);
    currentZoneId.set(ZONE);
  });
});

describe('#995 — le crête-mètre sous la pochette survit au changement d’écran', () => {
  it('🔴 trois allers-retours en lecture : au retour la toile est tracée, aucune boucle orpheline', async () => {
    const joue = $state({ playing: true });
    let ecran = monterCrete(joue);
    expect(tracesPendant(2)).toBeGreaterThan(0);
    for (let aller = 1; aller <= 3; aller++) {
      await demonter(ecran);
      expect(file.size, `aller ${aller} : le crête-mètre démonté garde une boucle`).toBe(0);
      ecran = monterCrete(joue);
      expect(file.size, `retour ${aller} : aucune boucle armée`).toBe(1);
      expect(tracesPendant(3), `retour ${aller} : le crête-mètre ne trace plus`).toBeGreaterThan(0);
    }
  });

  it('🔴 quitté en pause, revenu, relancé : les barres repartent', async () => {
    const joue = $state({ playing: true });
    let ecran = monterCrete(joue);
    tracesPendant(2);
    joue.playing = false;
    flushSync();
    for (let i = 0; i < 300 && file.size > 0; i++) image();
    expect(file.size).toBe(0);
    await demonter(ecran);
    ecran = monterCrete(joue);
    for (let i = 0; i < 300 && file.size > 0; i++) image();
    joue.playing = true;
    flushSync();
    expect(file.size, 'la reprise n’arme aucune boucle').toBe(1);
    expect(tracesPendant(3)).toBeGreaterThan(0);
  });
});
