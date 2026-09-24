// @vitest-environment jsdom
//
// TICKET 150 — « high CPU/GPU usage on now playing » (fil
// `high-cpugpu-usage-on-now-playing`, MacBook, Safari et Zen/Firefox).
//
// La 0.9.158 avait traité le crête-mètre (#1256) : 30 images par seconde, et
// plus rien à l'arrêt. La SECONDE visualisation — l'analyseur de spectre /
// forme d'onde — n'avait pas été touchée, et AUCUNE des boucles de l'écran ne
// s'arrêtait quand l'onglet passait en arrière-plan.
//
// 🔴 Ces témoins vérifient des GARDES, pas des pixels :
//   - la boucle ne dessine pas plus vite qu'un écran ne montre (~30 i/s) ;
//   - elle n'arme plus d'image quand l'onglet est caché, et coupe celle qui
//     était en vol ;
//   - elle ne se ré-arme pas quand il n'y a rien à dessiner ;
//   - elle coupe son image en vol et lâche son écouteur au démontage — un rAF
//     oublié tourne pour la vie de la page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { boucleImages, type DocumentObserve } from '../boucleImages';
import AudioVisualizer from '../../components/partages/AudioVisualizer.svelte';
import CreteMetre from '../../components/partages/CreteMetre.svelte';
import { currentZoneId } from '../stores/zones';
import { handleAudioLevelsEvent } from '../stores/audioLevels';

const A_120_HZ = 1000 / 120;

let file: Map<number, (t: number) => void>;
let prochainId: number;
let horloge: number;

/** Fait passer `n` images d'écran espacées de `pasMs`. */
function images(n: number, pasMs: number) {
  for (let i = 0; i < n; i++) {
    horloge += pasMs;
    const rappels = [...file.values()];
    file.clear();
    for (const r of rappels) r(horloge);
    flushSync();
  }
}

/** Un document d'essai dont on pilote l'état de visibilité. */
function docEssai(): DocumentObserve & { cacher(): void; montrer(): void; ecouteurs: number } {
  let etat: DocumentVisibilityState = 'visible';
  const ecouteurs = new Set<() => void>();
  return {
    get visibilityState() { return etat; },
    get ecouteurs() { return ecouteurs.size; },
    addEventListener(_t: 'visibilitychange', e: () => void) { ecouteurs.add(e); },
    removeEventListener(_t: 'visibilitychange', e: () => void) { ecouteurs.delete(e); },
    cacher() { etat = 'hidden'; for (const e of [...ecouteurs]) e(); },
    montrer() { etat = 'visible'; for (const e of [...ecouteurs]) e(); },
  };
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
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('150 — la cadence : on ne dessine pas plus vite qu’un écran ne montre', () => {
  it('🔴 sur un écran à 120 Hz, une seconde = ~30 dessins', () => {
    let dessins = 0;
    boucleImages(() => { dessins++; return true; }, { doc: docEssai() });
    images(120, A_120_HZ);
    expect(dessins, `${dessins} dessins en une seconde : la boucle suit l’écran`)
      .toBeLessThanOrEqual(32);
    expect(dessins).toBeGreaterThanOrEqual(28);
  });
});

describe('150 — l’onglet caché : la boucle se gare, et ne laisse rien en vol', () => {
  it('🔴 `visibilitychange` vers `hidden` coupe l’image en vol et n’en arme plus', () => {
    const doc = docEssai();
    let dessins = 0;
    boucleImages(() => { dessins++; return true; }, { doc });
    images(4, A_120_HZ);
    expect(file.size, 'aucune image armée alors que l’onglet est visible').toBe(1);

    doc.cacher();
    expect(file.size, 'l’image en vol n’a pas été annulée quand l’onglet est parti').toBe(0);

    const figes = dessins;
    images(600, A_120_HZ); // cinq secondes en arrière-plan
    expect(dessins - figes, 'la boucle dessine encore alors que personne ne regarde').toBe(0);
    expect(file.size, 'une image a été armée dans un onglet caché').toBe(0);
  });

  it('🔴 une boucle créée alors que l’onglet est DÉJÀ caché n’arme rien', () => {
    // Le cas d'un écran monté en arrière-plan — une vue restaurée au
    // rechargement, un onglet rouvert. L'écouteur ne suffit pas : il n'y a
    // aucun changement d'état à écouter.
    const doc = docEssai();
    doc.cacher();
    let dessins = 0;
    boucleImages(() => { dessins++; return true; }, { doc });
    expect(file.size, 'une image a été armée alors que l’onglet était déjà caché').toBe(0);
    images(600, A_120_HZ);
    expect(dessins).toBe(0);

    doc.montrer();
    expect(file.size, 'le retour dans l’onglet n’arme toujours rien').toBe(1);
    images(1, A_120_HZ);
    expect(dessins).toBe(1);
  });

  it('le retour dans l’onglet relance la boucle, tout de suite', () => {
    const doc = docEssai();
    let dessins = 0;
    boucleImages(() => { dessins++; return true; }, { doc });
    images(4, A_120_HZ);
    doc.cacher();
    images(60, A_120_HZ);
    const figes = dessins;

    doc.montrer();
    expect(file.size, 'le retour dans l’onglet n’a rien réarmé').toBe(1);
    images(1, A_120_HZ);
    expect(dessins - figes, 'la première image du retour attend encore la cadence').toBe(1);
  });
});

describe('150 — rien à dessiner : la boucle se gare pour de bon', () => {
  it('🔴 `dessiner` qui rend `false` arrête la boucle et lâche son écouteur', () => {
    const doc = docEssai();
    let dessins = 0;
    boucleImages(() => { dessins++; return dessins < 3; }, { doc });
    images(120, A_120_HZ);
    expect(dessins, 'la boucle a continué après avoir rendu `false`').toBe(3);
    expect(file.size, 'la boucle garée arme encore une image').toBe(0);
    expect(doc.ecouteurs, 'la boucle garée retient encore son écouteur de visibilité').toBe(0);

    // Et un aller-retour dans l'onglet ne la ressuscite pas : il n'y a
    // toujours rien à dessiner.
    doc.cacher();
    doc.montrer();
    expect(file.size).toBe(0);
  });
});

describe('150 — le démontage : plus rien ne survit à l’écran fermé', () => {
  it('🔴 l’annulateur coupe l’image en vol et retire l’écouteur', () => {
    const doc = docEssai();
    let dessins = 0;
    const arreter = boucleImages(() => { dessins++; return true; }, { doc });
    images(4, A_120_HZ);
    expect(file.size).toBe(1);
    expect(doc.ecouteurs).toBe(1);

    arreter();
    expect(file.size, 'une image reste en vol après le démontage').toBe(0);
    expect(doc.ecouteurs, 'l’écouteur de visibilité survit au démontage').toBe(0);

    const figes = dessins;
    images(600, A_120_HZ);
    expect(dessins - figes, 'la boucle dessine encore après le démontage').toBe(0);
  });

  it('🔴 y compris quand l’identifiant rendu par `requestAnimationFrame` vaut ZÉRO (#3818)', () => {
    prochainId = 0; // zéro est un identifiant rAF parfaitement valide
    const doc = docEssai();
    const arreter = boucleImages(() => true, { doc });
    expect(file.has(0), 'la première image porte bien l’identifiant zéro').toBe(true);
    arreter();
    expect(file.size, 'un `if (raf)` a pris zéro pour « aucune image »').toBe(0);
  });
});

// ── Les deux instruments de « Lecture en cours », montés pour de vrai ──────
//
// Les témoins ci-dessus interrogent la règle ; ceux-ci vérifient qu'elle est
// bien CÂBLÉE dans les deux composants — une garde que personne n'appelle ne
// garde rien.

let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;
let dessins = 0;

function preparerToile() {
  const ctx = new Proxy({}, {
    get(_c, nom) {
      if (nom === 'clearRect') return () => { dessins++; };
      if (nom === 'measureText') return () => ({ width: 10 });
      if (nom === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set() { return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 80, width: 600, height: 80, toJSON() {} }) as DOMRect,
  );
}

/** `document.visibilityState` n'est pas inscriptible : on le remplace. */
function visibilite(etat: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: etat, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('150 — les deux visualisations de « Lecture en cours » s’arrêtent avec l’onglet', () => {
  beforeEach(() => {
    dessins = 0;
    preparerToile();
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(performance, 'now').mockImplementation(() => horloge);
    currentZoneId.set(150);
    handleAudioLevelsEvent({
      zone_id: 150, rms_left_db: -18, rms_right_db: -18,
      peak_left_db: -12, peak_right_db: -12,
      spectrum_db: Array(64).fill(-20), spectrum_fft_size: 2048,
      spectrum_resolved: Array(64).fill(true),
    });
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote.remove();
    visibilite('visible');
    handleAudioLevelsEvent({ zone_id: 150 });
  });

  it('🔴 l’analyseur (spectre) : onglet caché, plus une image', () => {
    monte = mount(AudioVisualizer, {
      target: hote,
      props: { playing: true, mode: 'spectrum', height: 80, sampleRate: 44100, zoneId: 150 },
    });
    flushSync();
    images(8, A_120_HZ);
    expect(dessins, 'l’analyseur ne dessine pas du tout').toBeGreaterThan(0);

    visibilite('hidden');
    expect(file.size, 'l’analyseur laisse une image en vol dans un onglet caché').toBe(0);
    const figes = dessins;
    images(600, A_120_HZ);
    expect(dessins - figes, 'l’analyseur dessine encore dans un onglet caché').toBe(0);

    visibilite('visible');
    images(2, A_120_HZ);
    expect(dessins, 'l’analyseur ne repart pas au retour dans l’onglet').toBeGreaterThan(figes);
  });

  it('🔴 le crête-mètre : onglet caché, plus une image', () => {
    monte = mount(CreteMetre, {
      target: hote,
      props: { style: 'dat' as const, hauteur: 26, largeur: 600, joue: true },
    });
    flushSync();
    images(8, A_120_HZ);
    expect(dessins, 'le crête-mètre ne dessine pas du tout').toBeGreaterThan(0);

    visibilite('hidden');
    expect(file.size, 'le crête-mètre laisse une image en vol dans un onglet caché').toBe(0);
    const figes = dessins;
    images(600, A_120_HZ);
    expect(dessins - figes, 'le crête-mètre dessine encore dans un onglet caché').toBe(0);

    visibilite('visible');
    images(2, A_120_HZ);
    expect(dessins, 'le crête-mètre ne repart pas au retour dans l’onglet').toBeGreaterThan(figes);
  });

  it('🔴 l’analyseur ne dessine que ~30 fois par seconde sur un écran à 120 Hz', () => {
    monte = mount(AudioVisualizer, {
      target: hote,
      props: { playing: true, mode: 'spectrum', height: 80, sampleRate: 44100, zoneId: 150 },
    });
    flushSync();
    images(120, A_120_HZ);
    expect(dessins, `l’analyseur a dessiné ${dessins} fois en une seconde`).toBeLessThanOrEqual(32);
    expect(dessins).toBeGreaterThanOrEqual(28);
  });

  it('🔴 l’analyseur n’arme plus rien quand la lecture s’arrête', () => {
    const props = $state({ playing: true, mode: 'spectrum' as const, height: 80, sampleRate: 44100, zoneId: 150 });
    monte = mount(AudioVisualizer, { target: hote, props });
    flushSync();
    images(30, A_120_HZ);
    props.playing = false;
    flushSync();
    images(600, A_120_HZ); // cinq secondes
    expect(file.size, 'lecture arrêtée depuis cinq secondes, la boucle s’arme encore').toBe(0);
    const figes = dessins;
    images(600, A_120_HZ);
    expect(dessins - figes, 'un analyseur vide est encore redessiné à l’arrêt').toBe(0);

    // Et la reprise le relance : la boucle garée ne doit pas rester garée.
    props.playing = true;
    flushSync();
    images(4, A_120_HZ);
    expect(dessins, 'la lecture a repris et l’analyseur reste figé').toBeGreaterThan(figes);
  });
});

describe('150 — l’analyseur n’agrège le spectre qu’UNE fois par image dessinée', () => {
  beforeEach(() => {
    dessins = 0;
    preparerToile();
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(performance, 'now').mockImplementation(() => horloge);
    currentZoneId.set(151);
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote.remove();
    handleAudioLevelsEvent({ zone_id: 151 });
  });

  it('🔴 une seconde = 30 agrégations, pas 54', () => {
    // Le serveur publie ses niveaux ~24 fois par seconde ; l'écran affiche 30
    // images. Avant le ticket 150, les DEUX déclenchaient une agrégation des
    // 32 bandes : l'effet « en lecture » lisait `realLevels`, qui était un
    // `$state`, et se rejouait donc à chaque trame — mesuré : 54 agrégations
    // par seconde, dont 24 ne changeaient aucun pixel, et qui tournaient aussi
    // dans un onglet caché.
    //
    // On compte les LECTURES du tableau de bandes envoyé par le serveur : une
    // agrégation en lit 64, une par bande.
    let lectures = 0;
    const bandes = () => new Proxy(Array(64).fill(-20), {
      get(cible, cle) {
        if (typeof cle === 'string' && /^\d+$/.test(cle)) lectures++;
        return (cible as unknown as Record<string | symbol, unknown>)[cle];
      },
    });
    const trame = () => {
      handleAudioLevelsEvent({
        zone_id: 151, rms_left_db: -18, rms_right_db: -18,
        peak_left_db: -12, peak_right_db: -12,
        spectrum_db: bandes(), spectrum_fft_size: 2048,
        spectrum_resolved: Array(64).fill(true),
      });
      flushSync();
    };
    trame();
    monte = mount(AudioVisualizer, {
      target: hote,
      props: { playing: true, mode: 'spectrum' as const, height: 80, sampleRate: 44100, zoneId: 151 },
    });
    flushSync();
    lectures = 0;

    // Une seconde d'écran à 120 Hz, avec une trame serveur toutes les ~42 ms.
    for (let i = 0; i < 120; i++) {
      horloge += A_120_HZ;
      if (i % 5 === 4) trame();
      const rappels = [...file.values()];
      file.clear();
      for (const r of rappels) r(horloge);
      flushSync();
    }

    const agregations = lectures / 64;
    expect(dessins, `${dessins} images dessinées`).toBeGreaterThanOrEqual(28);
    expect(
      agregations,
      `${agregations} agrégations pour ${dessins} images : le spectre est recalculé en dehors du dessin`,
    ).toBeLessThanOrEqual(dessins + 1);
    // Et pas MOINS non plus : chaque image lit vraiment la trame du serveur.
    // Un `$state` sur `realLevels` interpose un proxy Svelte qui mémorise ses
    // lectures — les barres suivraient alors la cadence des trames, pas celle
    // du dessin, et cette borne s'effondrerait.
    expect(
      agregations,
      `${agregations} agrégations pour ${dessins} images : une couche mémorise les niveaux entre le serveur et les barres`,
    ).toBeGreaterThanOrEqual(dessins - 1);
  });

  it('🔴 les niveaux du serveur ne sont PAS un `$state`', async () => {
    // Garde de source, assumée comme telle : c'est la déclaration elle-même
    // qui portait le défaut. En `$state`, Svelte 5 proxie profondément l'objet
    // — le tableau de 64 bandes compris — à chaque trame, et tout effet qui le
    // lit se rejoue avec.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/partages/AudioVisualizer.svelte'), 'utf8');
    expect(src).toContain('let realLevels: AudioLevels | null = null;');
    expect(src, 'les niveaux sont redevenus réactifs').not.toMatch(/realLevels[^\n]*\$state/);
    expect(src, 'l’effet « en lecture » ne protège plus son agrégation').toContain('untrack(() => generateTargets())');
  });
});

describe('150 — la boucle karaoké d’une radio, dans « Lecture en cours »', () => {
  it('🔴 est gardée par la LECTURE, pas seulement par le panneau ouvert', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'src/components/partages/NowPlaying.svelte'), 'utf8');
    const debut = src.indexOf('let positionRadio');
    expect(debut, 'la boucle karaoké radio a disparu').toBeGreaterThan(-1);
    const bloc = src.slice(debut, debut + 1400);
    // Sans `isEffectivePlaying`, le surlignage avançait sur une radio en pause.
    expect(bloc).toContain('!isEffectivePlaying');
    // Et la cadence + la garde d'onglet viennent de `boucleImages`, éprouvé
    // plus haut, plutôt que d'un `requestAnimationFrame` nu.
    expect(bloc).toContain('return boucleImages(');
    expect(bloc, 'la boucle karaoké garde un rAF nu').not.toContain('requestAnimationFrame');
  });
});
