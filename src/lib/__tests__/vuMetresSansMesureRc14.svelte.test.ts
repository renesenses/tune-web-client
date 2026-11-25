// @vitest-environment jsdom
//
// rc14 (Bertrand, 25/11/2026) — radio jouée vers un lecteur UPnP (Eversolo).
// Le lecteur va chercher le flux lui-même : Tune ne voit aucun échantillon et
// le serveur ne publie aucun `audio_levels` pour la zone. Les cadrans de la
// barre de lecture restaient affichés, aiguille en butée, comme cassés.
//
// La règle : lecture en cours SANS trame depuis le délai de grâce → cadrans
// grisés, mention « pas de mesure », infobulle. À l'arrêt, rien ne change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import VuMetreCanal from '../../components/partages/VuMetreCanal.svelte';
import { currentZoneId } from '../stores/zones';
import {
  GRACE_SANS_MESURE_MS,
  audioLevels,
  handleAudioLevelsEvent,
  sansMesure,
  suiviSansMesure,
  type AudioLevels,
} from '../stores/audioLevels';
import { get } from 'svelte/store';

const ZONE = 8814;

describe('rc14 — la règle « pas de mesure »', () => {
  it('niveaux frais : actif', () => {
    expect(sansMesure(true, 10_000, 0, 10_100)).toBe(false);
    // Une trame vieille de 2,9 s : encore dans la grâce.
    expect(sansMesure(true, 10_000, 0, 10_000 + GRACE_SANS_MESURE_MS - 100)).toBe(false);
  });

  it('lecture sans trame après le délai de grâce : « pas de mesure »', () => {
    expect(sansMesure(true, Number.NEGATIVE_INFINITY, 1_000, 1_000 + GRACE_SANS_MESURE_MS)).toBe(true);
    expect(sansMesure(true, 2_000, 0, 2_000 + GRACE_SANS_MESURE_MS)).toBe(true);
  });

  it('🔴 début de lecture : jamais grisé avant la fin de la grâce', () => {
    expect(sansMesure(true, Number.NEGATIVE_INFINITY, 1_000, 1_900)).toBe(false);
    expect(sansMesure(true, Number.NEGATIVE_INFINITY, 1_000, 1_000 + GRACE_SANS_MESURE_MS - 1)).toBe(false);
  });

  it('à l’arrêt : inchangé, jamais « pas de mesure »', () => {
    expect(sansMesure(false, Number.NEGATIVE_INFINITY, 0, 1_000_000)).toBe(false);
  });

  it('le délai de grâce est de 3 s', () => {
    expect(GRACE_SANS_MESURE_MS).toBe(3000);
  });
});

describe('rc14 — le suivi date les trames et le début de lecture', () => {
  const trame = (zone = ZONE): AudioLevels => ({ ...get(audioLevels), zone_id: zone });

  it('lecture sans aucune trame : grâce, puis « pas de mesure »', () => {
    const suivi = suiviSansMesure();
    const repli = trame(0);
    expect(suivi(repli, true, 1_000, ZONE)).toBe(false);
    expect(suivi(repli, true, 3_999, ZONE)).toBe(false);
    expect(suivi(repli, true, 4_000, ZONE)).toBe(true);
  });

  it('des trames qui arrivent : jamais « pas de mesure »', () => {
    const suivi = suiviSansMesure();
    let t = 1_000;
    suivi(trame(), true, t, ZONE);
    for (let i = 0; i < 200; i++) {
      t += 40;
      expect(suivi(trame(), true, t, ZONE)).toBe(false);
    }
  });

  it('à l’arrêt puis reprise : la grâce repart au début de la lecture', () => {
    const suivi = suiviSansMesure();
    const repli = trame(0);
    expect(suivi(repli, false, 1_000, ZONE)).toBe(false);
    expect(suivi(repli, false, 60_000, ZONE)).toBe(false);
    expect(suivi(repli, true, 60_040, ZONE)).toBe(false);
    expect(suivi(repli, true, 62_000, ZONE)).toBe(false);
    expect(suivi(repli, true, 63_040, ZONE)).toBe(true);
  });

  it('changement de zone : la nouvelle zone a droit à sa grâce', () => {
    const suivi = suiviSansMesure();
    const repli = trame(0);
    suivi(repli, true, 1_000, ZONE);
    expect(suivi(repli, true, 10_000, ZONE)).toBe(true);
    expect(suivi(repli, true, 10_040, ZONE + 1)).toBe(false);
    expect(suivi(repli, true, 13_040, ZONE + 1)).toBe(true);
  });
});

describe('rc14 — le cadran de la barre de lecture', () => {
  let file: Map<number, (t: number) => void>;
  let prochainId = 1;
  let horloge = 1000;
  let hote: HTMLDivElement;
  let monte: Record<string, unknown> | null = null;

  function images(n: number, avecTrames: boolean) {
    for (let i = 0; i < n; i++) {
      if (avecTrames) {
        handleAudioLevelsEvent({ zone_id: ZONE, rms_left_db: -10, rms_right_db: -10, peak_left_db: -6, peak_right_db: -6 });
      }
      horloge += 40;
      const rappels = [...file.values()];
      file.clear();
      for (const r of rappels) r(horloge);
    }
    flushSync();
  }

  beforeEach(() => {
    file = new Map();
    prochainId = 1;
    horloge = 1000;
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      const id = prochainId++;
      file.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { file.delete(id); });
    vi.spyOn(performance, 'now').mockImplementation(() => horloge);
    const ctx = new Proxy({}, {
      // Toute méthode rend un objet inerte : `createLinearGradient` doit
      // pouvoir recevoir ses `addColorStop`, `measureText` rendre une largeur.
      get() {
        return () => ({ width: 7, addColorStop: () => {} });
      },
      set() { return true; },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ctx as unknown as CanvasRenderingContext2D,
    );
    // Une zone qui n'a JAMAIS publié de niveaux : le cas de l'Eversolo.
    currentZoneId.set(ZONE);
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const cadran = () => hote.querySelector('.vu') as HTMLElement;

  it('🔴 lecture sans niveaux : rien pendant la grâce, puis grisé, mention et infobulle', () => {
    currentZoneId.set(ZONE + 100);
    monte = mount(VuMetreCanal, { target: hote, props: { canal: 'gauche', joue: true, signalerSansMesure: true } });
    flushSync();

    images(25, false); // une seconde : la première trame pourrait encore venir
    expect(cadran().classList.contains('sans-mesure')).toBe(false);
    expect(hote.querySelector('.vu-mention')).toBeNull();

    images(75, false); // quatre secondes en tout
    expect(cadran().classList.contains('sans-mesure')).toBe(true);
    expect(hote.querySelector('.vu-mention')?.textContent?.trim()).toBeTruthy();
    expect(cadran().getAttribute('title')).toBeTruthy();
  });

  it('niveaux frais : le cadran reste actif', () => {
    monte = mount(VuMetreCanal, { target: hote, props: { canal: 'gauche', joue: true, signalerSansMesure: true } });
    flushSync();
    images(150, true);
    expect(cadran().classList.contains('sans-mesure')).toBe(false);
    expect(cadran().getAttribute('title')).toBeNull();
  });

  it('à l’arrêt : inchangé', () => {
    currentZoneId.set(ZONE + 100);
    monte = mount(VuMetreCanal, { target: hote, props: { canal: 'gauche', joue: false, signalerSansMesure: true } });
    flushSync();
    images(150, false);
    expect(cadran().classList.contains('sans-mesure')).toBe(false);
  });

  it('sans `signalerSansMesure` (aperçu des Réglages) : jamais grisé', () => {
    currentZoneId.set(ZONE + 100);
    monte = mount(VuMetreCanal, { target: hote, props: { canal: 'gauche', joue: true } });
    flushSync();
    images(150, false);
    expect(cadran().classList.contains('sans-mesure')).toBe(false);
  });
});
