/**
 * Banc de mesure #1256 — pilote côté page.
 *
 * La configuration est lue dans le hash de l'URL : `#np-spectre`, `#fond`, etc.
 * La page mesure elle-même le temps JS passé dans les rappels
 * `requestAnimationFrame`, puis POSTe son relevé au serveur du banc. Le coût
 * TOTAL du processus (rastérisation et composition comprises, que le JS ne
 * voit pas) est mesuré dehors, par le pilote, en temps CPU du processus.
 */
import { mount } from 'svelte';
import Banc from './Banc.svelte';
import { handleAudioLevelsEvent } from '../../src/lib/stores/audioLevels';
import { currentZoneId } from '../../src/lib/stores/zones';

// ── Instrumentation : chaque rappel d'animation est chronométré ────────────
let rappels = 0;
let msJs = 0;
let msMax = 0;

/**
 * Drapeau `cadence30` : le réveil des boucles est ramené à ~30 Hz, la cadence
 * à laquelle elles DESSINENT déjà.
 *
 * Ce n'est pas un correctif, c'est l'expérience qui chiffre ce qu'un correctif
 * rapporterait. `CreteMetre` comme `AudioVisualizer` se ré-arment à CHAQUE
 * image de l'écran et ne dessinent qu'une fois sur deux à quatre. Un
 * `requestAnimationFrame` en attente suffit à faire tourner tout le cycle
 * d'image de la page à la fréquence de l'écran — 75 Hz ici, jusqu'à 120 Hz sur
 * le MacBook ProMotion du testeur. En remplaçant le réveil par un `setTimeout`
 * aligné sur 33 ms, plus rien n'est en attente entre deux dessins : la page ne
 * produit d'image que lorsqu'une toile change vraiment. C'est exactement l'état
 * que viserait le correctif, mesuré sans toucher au code livré.
 */
const cadence30 = location.hash.includes('cadence30');
let prochain = 0;
const chrono = (cb: FrameRequestCallback) => (t: number) => {
  const t0 = performance.now();
  cb(t);
  const d = performance.now() - t0;
  rappels++;
  msJs += d;
  if (d > msMax) msMax = d;
};
const rafOrigine = globalThis.requestAnimationFrame.bind(globalThis);
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
  if (!cadence30) return rafOrigine(chrono(cb));
  const maintenant = performance.now();
  if (prochain <= maintenant) prochain = maintenant + 33;
  const attente = Math.max(0, prochain - maintenant);
  return setTimeout(() => {
    prochain = performance.now() + 33;
    chrono(cb)(performance.now());
  }, attente) as unknown as number;
}) as typeof requestAnimationFrame;
if (cadence30) {
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout)) as typeof cancelAnimationFrame;
}

// ── Une trame `playback.audio_levels` RÉELLE, telle que la publie un serveur
// 0.9.16x sur un FLAC 24/96 : 64 bandes, crêtes vers −6 dBFS. Les valeurs
// bougent d'une trame à l'autre, sinon la balistique se fige et le dessin
// devient plus court qu'en vrai.
const BANDES = 64;
function trame(n: number) {
  const spectrum_db: number[] = [];
  for (let i = 0; i < BANDES; i++) {
    const base = -12 - i * 0.7;
    spectrum_db.push(base + 9 * Math.sin(n * 0.21 + i * 0.37));
  }
  const crete = -6 + 4 * Math.sin(n * 0.11);
  return {
    zone_id: 1,
    rms_left_db: crete - 9,
    rms_right_db: crete - 9.5,
    peak_left_db: crete,
    peak_right_db: crete - 0.5,
    over_left: false,
    over_right: false,
    rms_left: 0.3,
    rms_right: 0.3,
    spectrum: spectrum_db.map((d) => Math.max(0, (d + 60) / 60)),
    spectrum_db,
    spectrum_fft_size: 4096,
    spectrum_resolution_hz: 25,
    spectrum_resolved: spectrum_db.map(() => true),
  };
}

const hash = location.hash.slice(1);
const [quoi, ...drapeaux] = hash.split(',');
// `cadence30` est un drapeau du BANC, pas une prop du composant.
const fond = drapeaux.includes('fond');
const joue = !drapeaux.includes('arret');
const dureeMs = Number(new URLSearchParams(location.search).get('ms') || 10000);

currentZoneId.set(1);

// Le serveur publie ses trames à ~25 Hz (fenêtre de 40 ms). On respecte cette
// cadence : l'alimenter plus vite ferait mesurer un régime qui n'existe pas.
let n = 0;
const horloge = setInterval(() => {
  if (joue) handleAudioLevelsEvent(trame(n++));
}, 40);
if (joue) handleAudioLevelsEvent(trame(n++));

mount(Banc, {
  target: document.getElementById('banc')!,
  props: { quoi: (quoi || 'aucune') as any, fond, joue },
});

// On jette la première seconde : montage, première mise en page, compilation
// du code chaud. Ce n'est pas le régime permanent que décrit le testeur.
setTimeout(async () => {
  rappels = 0;
  msJs = 0;
  msMax = 0;
  // Le pilote échantillonne le temps CPU du navigateur ICI, puis à la fin :
  // la fenêtre de mesure est exactement la même des deux côtés.
  await fetch('/debut', { method: 'POST', body: '{}' });
  const debut = performance.now();
  setTimeout(async () => {
    const secondes = (performance.now() - debut) / 1000;
    clearInterval(horloge);
    const releve = {
      quoi: quoi || 'aucune',
      fond,
      joue,
      secondes: +secondes.toFixed(3),
      rappels,
      rappelsParSeconde: +(rappels / secondes).toFixed(1),
      msJsTotal: +msJs.toFixed(1),
      msJsParSeconde: +(msJs / secondes).toFixed(2),
      msMax: +msMax.toFixed(2),
      dpr: globalThis.devicePixelRatio,
    };
    document.title = 'FINI';
    await fetch('/releve', { method: 'POST', body: JSON.stringify(releve) });
  }, dureeMs);
}, 1000);
