// @vitest-environment jsdom
//
// #1791 (suite de tune-server-rust#5104, fil 1954) — le spectre reste à plat
// après un enchaînement, et les barres sous la pochette paraissent vivantes.
//
// Les deux instruments de crête gardaient la DERNIÈRE trame du magasin, sans
// limite de durée, tant que la zone jouait. Le spectre, lui, retombe à plat
// après 500 ms sans trame. Un flux de niveaux coupé donnait donc une capture
// trompeuse : spectre à plat, barres figées sur la dernière valeur du titre
// précédent. On a cru à deux défauts.
//
// 🔴 CES TÉMOINS MONTENT LES COMPOSANTS. L'horloge (`requestAnimationFrame` et
// `performance.now`) est tenue par le test ; les trames arrivent, puis
// cessent, la lecture restant EN COURS.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cadrans: Array<{ db: number; creteAllumee: boolean }> = [];
vi.mock('../dessinVuMetre', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('../dessinVuMetre')>();
  return {
    ...vrai,
    dessinerCadran: (_ctx: unknown, o: { db: number; creteAllumee: boolean }) => {
      cadrans.push({ db: o.db, creteAllumee: o.creteAllumee });
    },
  };
});

import CreteMetre from '../../components/partages/CreteMetre.svelte';
import VuMetreCanal from '../../components/partages/VuMetreCanal.svelte';
import { currentZoneId } from '../stores/zones';
import { FRAICHEUR_TRAME_MS, handleAudioLevelsEvent, trameFraiche } from '../stores/audioLevels';
import { MIN_DB } from '../tvVuScale';

const ZONE = 5104;
const PAS_MS = 40; // une trame serveur toutes les ~40 ms

let file: Map<number, (t: number) => void>;
let prochainId = 1;
let horloge = 1000;
/** Segments d'un décibel allumés à la DERNIÈRE image du crête-mètre. */
let segments = 0;

function trame() {
  handleAudioLevelsEvent({
    zone_id: ZONE, rms_left_db: -10, rms_right_db: -10,
    peak_left_db: -6, peak_right_db: -6,
  });
}

/** `n` images espacées de `PAS_MS` ; une trame avant chacune si `avecTrames`. */
function images(n: number, avecTrames: boolean) {
  for (let i = 0; i < n; i++) {
    if (avecTrames) trame();
    horloge += PAS_MS;
    const rappels = [...file.values()];
    file.clear();
    for (const r of rappels) r(horloge);
  }
}

let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  file = new Map();
  prochainId = 1;
  horloge = 1000;
  segments = 0;
  cadrans.length = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    const id = prochainId++;
    file.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { file.delete(id); });
  vi.spyOn(performance, 'now').mockImplementation(() => horloge);
  // Une toile qui compte les segments d'un décibel de la dernière image :
  // ni le rail (> 200 px), ni le témoin OVER (26 px), ni le trait PPM (1,5 px).
  const ctx = new Proxy(
    {},
    {
      get(_c, nom) {
        if (nom === 'clearRect') return () => { segments = 0; };
        if (nom === 'fillRect') {
          return (_x: number, _y: number, l: number) => { if (l > 2 && l < 20) segments++; };
        }
        if (nom === 'measureText') return () => ({ width: 7 });
        return () => {};
      },
      set() { return true; },
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
  currentZoneId.set(ZONE);
  trame();
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  handleAudioLevelsEvent({ zone_id: ZONE });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('#1791 — le crête-mètre retombe au plancher quand les trames cessent', () => {
  it('🔴 lecture en cours, plus aucune trame : les barres retombent, puis repartent', () => {
    monte = mount(CreteMetre, {
      target: hote,
      props: { style: 'dat', hauteur: 26, largeur: 600, joue: true },
    });
    flushSync();

    images(25, true); // une seconde de flux vivant
    expect(segments, 'avec des trames à −6 dBFS, les barres devraient être hautes')
      .toBeGreaterThan(40);

    images(50, false); // deux secondes sans trame, `joue` toujours vrai
    expect(segments, `plus aucune trame depuis 2 s : ${segments} segments restent allumés, barres figées`)
      .toBe(0);

    images(5, true); // le flux reprend
    expect(segments, 'les trames reprennent et les barres restent au plancher').toBeGreaterThan(40);
  });

  it('un simple retard de trame, sous le délai, ne fait rien tomber', () => {
    monte = mount(CreteMetre, {
      target: hote,
      props: { style: 'dat', hauteur: 26, largeur: 600, joue: true },
    });
    flushSync();
    images(25, true);
    images(Math.floor((FRAICHEUR_TRAME_MS - 100) / PAS_MS), false);
    expect(segments, 'un hoquet de 400 ms a fait tomber les barres').toBeGreaterThan(40);
  });
});

describe('#1791 — le VU-mètre de la barre de lecture fait de même', () => {
  it('🔴 plus aucune trame : l’aiguille retombe en butée, le témoin s’éteint', () => {
    monte = mount(VuMetreCanal, { target: hote, props: { canal: 'gauche', joue: true } });
    flushSync();

    images(25, true);
    const vivant = cadrans[cadrans.length - 1];
    expect(vivant.db, 'avec des trames à −10 dB RMS, l’aiguille devrait être haute')
      .toBeGreaterThan(-15);

    images(75, false); // trois secondes sans trame
    const fige = cadrans[cadrans.length - 1];
    expect(fige.db, `plus aucune trame depuis 3 s : aiguille figée à ${fige.db.toFixed(1)} dB`)
      .toBeLessThan(MIN_DB + 1);
    expect(fige.creteAllumee).toBe(false);
  });
});

describe('#1791 — UN seul délai, celui du spectre', () => {
  it('500 ms, et la règle est stricte', () => {
    expect(FRAICHEUR_TRAME_MS).toBe(500);
    expect(trameFraiche(1000, 1499)).toBe(true);
    expect(trameFraiche(1000, 1500)).toBe(false);
  });

  it('l’analyseur lit le délai partagé, pas une copie', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/partages/AudioVisualizer.svelte'),
      'utf-8',
    );
    expect(src).not.toMatch(/lastRealUpdate\s*<\s*\d/);
    expect(src.match(/trameFraiche\(lastRealUpdate/g)?.length).toBe(2);
  });
});
