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
/**
 * `tics` = le nombre de réveils RÉELS de la page (un `requestAnimationFrame`
 * de l'hôte qui se déclenche, ou une minuterie qui aboutit). `rappels` compte
 * les appels aux DESSINATEURS. Sans horloge partagée les deux sont égaux :
 * quatre boucles = quatre rAF de l'hôte = quatre rappels par image. Avec une
 * horloge unique ils divergent, et c'est tout l'objet de la mesure.
 */
let tics = 0;
const chrono = (cb: FrameRequestCallback) => (t: number) => {
  const t0 = performance.now();
  cb(t);
  const d = performance.now() - t0;
  rappels++;
  msJs += d;
  if (d > msMax) msMax = d;
};
const rafOrigine = globalThis.requestAnimationFrame.bind(globalThis);

/**
 * 🔴 `dessins` = le nombre de DESSINS réellement effectués, tous canevas
 * confondus. Sans lui, un prototype qui coûte moitié moins peut simplement
 * dessiner moitié moins — et on croit tenir un gain là où on a une régression
 * visuelle. `CreteMetre.svelte:67` et `AudioVisualizer.svelte:332` appellent
 * `clearRect` une fois, et une seule, par image réellement peinte : les deux
 * composants se ré-arment à chaque réveil mais ne dessinent qu'à ~30 Hz, et
 * c'est ce filtre-là qu'il faut voir de l'extérieur.
 */
let dessins = 0;
const clearRectOrigine = CanvasRenderingContext2D.prototype.clearRect;
CanvasRenderingContext2D.prototype.clearRect = function (...args: [number, number, number, number]) {
  dessins++;
  return clearRectOrigine.apply(this, args);
};

/**
 * Drapeaux `horloge*` : UNE SEULE horloge, partagée par les quatre boucles,
 * **à l'intérieur de la chaîne `requestAnimationFrame`**.
 *
 * C'est la piste que #1480 laisse ouverte après avoir disqualifié `cadence30` :
 * une minuterie PAR boucle sort de la chaîne rAF et perd la coalescence — quatre
 * minuteries indépendantes produisent jusqu'à quatre images composées là où rAF
 * n'en produisait qu'une, et la mesure l'a payé deux fois sur deux.
 *
 * Trois variantes, parce que « une horloge partagée » recouvre trois choses très
 * différentes du point de vue du coût par IMAGE identifié par #1480 :
 *
 * - `horloge`      : un seul rAF de l'hôte est armé pour les quatre boucles ; il
 *                    les appelle TOUTES à chaque image. Ne change que le nombre
 *                    de rAF de l'hôte (4/image → 1/image). Le cycle d'image de
 *                    la page tourne toujours à la fréquence de l'écran.
 * - `horloge-saut` : un seul rAF, toujours armé, mais les dessinateurs ne sont
 *                    appelés qu'à leur cadence utile (~30 Hz) ; les images
 *                    intermédiaires ne coûtent plus que le réveil. C'est la
 *                    lecture littérale de la piste de #1480.
 * - `horloge30`    : un seul rAF, armé SEULEMENT quand il faut dessiner
 *                    (`setTimeout(33)` → un rAF → les quatre dessinateurs).
 *                    Une seule minuterie pour toute la page : la coalescence est
 *                    conservée (un rAF ⇒ une image), et rien n'est en attente
 *                    entre deux dessins. C'est la seule variante qui puisse
 *                    faire baisser le coût FIXE par image.
 */
/**
 * `horloge30-brut` : le TÉMOIN de la variante C. Une seule horloge, mais qui
 * appelle les dessinateurs DIRECTEMENT depuis la minuterie, sans passer par
 * `requestAnimationFrame`. C'est `cadence30` de #1480 avec une seule minuterie
 * au lieu de quatre — il sépare les deux explications possibles d'un gain :
 * « une horloge au lieu de quatre » ou « rester dans la chaîne rAF ».
 */
const horloge30Brut = location.hash.includes('horloge30-brut');
/**
 * `horloge25` : la variante C avec une période de 25 ms au lieu de 33.
 *
 * Ce n'est pas un réglage de confort. La minuterie rend la main, PUIS un rAF
 * attend la prochaine synchronisation verticale. À 60 Hz, une minuterie de
 * 33 ms se réveille juste APRÈS la vsync des 33,3 ms et doit attendre celle
 * des 50 ms : la cadence réelle dérive vers 20-25 dessins/s au lieu de 30.
 * Viser 25 ms fait tomber le réveil juste AVANT la vsync des 33,3 ms, et la
 * cadence utile est tenue. C'est la différence entre « ça coûte moins cher »
 * et « ça dessine moins » — que la colonne `dessins/s` est là pour trancher.
 */
const horloge25 = location.hash.includes('horloge25');
/**
 * `horloge-net` : la seule comparaison HONNÊTE, à dessins égaux.
 *
 * B, C et D laissent DEUX cadenceurs en série — l'horloge partagée et le
 * garde-fou interne de chaque composant (`tempsDeDessiner`,
 * `FRAME_INTERVAL = 33`). Les deux ne tombent pas d'accord : l'horloge réveille
 * à 33 ms « environ », le composant exige 33 ms « au moins », et un réveil à
 * 32,8 ms est jeté. C fait ainsi 61 dessins/s là où l'écran réel en fait 120 —
 * son « gain » est une régression visuelle, pas une économie.
 *
 * Ici l'horloge est le SEUL cadenceur : elle réveille à ~30 Hz et remet aux
 * dessinateurs un horodatage qui avance de 34 ms à chaque tic, donc toujours
 * au-dessus de leur seuil. Ils dessinent à tous les coups. C'est exactement ce
 * qu'un correctif ferait — retirer les garde-fous devenus redondants — et c'est
 * la seule configuration où `dessins/s` revient à 120 et où la comparaison du
 * CPU veut dire quelque chose.
 */
const horlogeNet = location.hash.includes('horloge-net');
const horloge30 = horloge25 || horlogeNet || location.hash.includes('horloge30');
const horlogeSaut = location.hash.includes('horloge-saut');
const horlogeUnique = horloge30 || horlogeSaut || location.hash.includes('horloge');
const PERIODE_MS = horloge25 ? 25 : 33;
/**
 * `horloge-net` se cale sur une GRILLE, pas sur « 33 ms après le dernier
 * dessin ». Une période comptée depuis le dessin précédent additionne à chaque
 * tour la latence de la minuterie et celle du rAF : mesuré ici, 25 ms de
 * consigne donnent 28 ms de période réelle, et 20 ms en donnent 20. La cadence
 * effective n'est alors jamais celle qu'on croit régler, et le tableau compare
 * des configurations qui ne dessinent pas autant. L'échéance suivante est donc
 * calculée en ajoutant la période à la PRÉCÉDENTE ÉCHÉANCE, jamais à l'heure
 * qu'il est — la dérive ne s'accumule plus.
 */
/**
 * `horloge-net20` / `horloge-net15` : la même horloge, mais à 20 puis 15
 * dessins par seconde. Si l'horloge partagée ne rapporte rien à dessins égaux,
 * la question suivante est ce que vaut le DESSIN lui-même — et cette colonne-là
 * est un arbitrage produit (fluidité contre CPU), pas un correctif.
 */
const CADENCE_NET_HZ = location.hash.includes('horloge-net20') ? 20
  : location.hash.includes('horloge-net15') ? 15 : 30;
const PERIODE_NET_MS = 1000 / CADENCE_NET_HZ;
let echeance = 0;
let horodatageSynthetique = 0;

let file: { id: number; cb: FrameRequestCallback }[] = [];
const annules = new Set<number>();
let prochainId = 1;
let arme = false;
let dernierDessin = 0;

function armer() {
  if (arme) return;
  arme = true;
  if (horloge30) {
    const maintenant = performance.now();
    let attente;
    if (horlogeNet) {
      if (echeance <= maintenant) echeance = maintenant + PERIODE_NET_MS;
      attente = echeance - maintenant;
    } else {
      attente = Math.max(0, dernierDessin + PERIODE_MS - maintenant);
    }
    setTimeout(() => {
      if (horloge30Brut) distribuer(performance.now());
      else rafOrigine(distribuer);
    }, attente);
  } else {
    rafOrigine(distribuer);
  }
}

function distribuer(t: number) {
  arme = false;
  tics++;
  const maintenant = performance.now();
  // `horloge-saut` : on reste dans la chaîne rAF, mais on n'appelle personne
  // tant que la cadence utile n'est pas atteinte. La marge de 2 ms évite de
  // rater une période par arrondi d'une image à l'autre.
  if (horlogeSaut && maintenant - dernierDessin < PERIODE_MS - 2) {
    armer();
    return;
  }
  dernierDessin = maintenant;
  if (horlogeNet) {
    echeance += PERIODE_NET_MS;
    if (echeance < maintenant) echeance = maintenant + PERIODE_NET_MS;
    t = (horodatageSynthetique += PERIODE_NET_MS + 1);
  }
  const aExecuter = file;
  file = [];
  for (const e of aExecuter) {
    if (annules.delete(e.id)) continue;
    chrono(e.cb)(t);
  }
}

globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
  if (horlogeUnique) {
    const id = prochainId++;
    file.push({ id, cb });
    armer();
    return id;
  }
  if (!cadence30) return rafOrigine((t: number) => { tics++; chrono(cb)(t); });
  const maintenant = performance.now();
  if (prochain <= maintenant) prochain = maintenant + 33;
  const attente = Math.max(0, prochain - maintenant);
  return setTimeout(() => {
    prochain = performance.now() + 33;
    tics++;
    chrono(cb)(performance.now());
  }, attente) as unknown as number;
}) as typeof requestAnimationFrame;
if (horlogeUnique) {
  globalThis.cancelAnimationFrame = ((id: number) => {
    annules.add(id);
  }) as typeof cancelAnimationFrame;
} else if (cadence30) {
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
  tics = 0;
  dessins = 0;
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
      tics,
      ticsParSeconde: +(tics / secondes).toFixed(1),
      dessins,
      dessinsParSeconde: +(dessins / secondes).toFixed(1),
      msJsTotal: +msJs.toFixed(1),
      msJsParSeconde: +(msJs / secondes).toFixed(2),
      msMax: +msMax.toFixed(2),
      dpr: globalThis.devicePixelRatio,
    };
    document.title = 'FINI';
    await fetch('/releve', { method: 'POST', body: JSON.stringify(releve) });
  }, dureeMs);
}, 1000);
