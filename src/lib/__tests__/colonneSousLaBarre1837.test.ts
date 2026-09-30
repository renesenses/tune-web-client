// @vitest-environment jsdom
//
// web#1837 — FabienM (fil 2057, point 2), 0.9.169 Windows : « la nouvelle
// présentation de la file d'attente est bien mais la colonne n'a pas été
// élargie ». La promesse de web#1800 (#1809) : en disposition « sous la barre
// d'avancement », la colonne titres n'est plus plafonnée à 420 px.
//
// CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS
// ------------------------------------------------
// jsdom ne calcule aucune mise en page, n'applique ni la cascade ni les
// requêtes de média. On prouve donc la chaîne morceau par morceau :
//   1. le DOM : `.content-layout` porte `file-sous-barre` dès que le réglage
//      vaut « sous la barre », file REPLIÉE comprise (c'est l'état de la
//      capture du testeur ; le témoin de web#1800 ne le lisait qu'une fois la
//      file dépliée), et ne le porte pas en « à droite » ;
//   2. la feuille COMPILÉE : Svelte n'a pas élagué la règle d'élargissement,
//      elle sort bien portée par la classe de portée du composant ;
//   3. la cascade, résolue à la main sur la feuille réelle : le plafond de
//      420 px tombe, et la place laissée à la colonne par l'îlot et la
//      pochette dépasse nettement 420 px.
// Ce qu'il ne prouve pas : la largeur en pixels rendue par un navigateur
// (largeur réelle de la fenêtre, barre latérale, échelle d'affichage). Rien
// dans ce dépôt ne mesure une mise en page réelle.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { compile } from 'svelte/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks } from '../stores/queue';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { extraireFeuilleDeStyle, releverDeclarations, regleEffective, type Ecran } from '../cascadeCss';
import { largeurMaxEffective, releverReglesLargeur } from '../nowPlayingPaliers';

const CHEMIN = 'src/components/partages/NowPlaying.svelte';
const SOURCE = readFileSync(resolve(process.cwd(), CHEMIN), 'utf-8');

const PISTE = {
  track_id: 77, album_id: 5, artist_id: 3,
  title: 'It’s No Good', artist_name: 'Depeche Mode', album_title: 'Memento Mori',
  source: 'local', duration_ms: 298000,
};
const FILE = [
  { id: 77, title: 'It’s No Good', artist_name: 'Depeche Mode', source: 'local', duration_ms: 298000 },
  { id: 78, title: 'My Cosmos Is Mine', artist_name: 'Depeche Mode', source: 'local', duration_ms: 299000 },
  { id: 79, title: 'Walking In My Shoes', artist_name: 'Depeche Mode', source: 'local', duration_ms: 409000 },
];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let largeurAvant: PropertyDescriptor | undefined;

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: FILE, position: 0, length: FILE.length };
  if (/\/(credits|history|favorites|plays)/.test(url)) corps = [];
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function poser(): Promise<HTMLElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 12000 }] as any);
  currentZoneId.set(1);
  queueTracks.set(FILE as any);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: {} as any });
  flushSync();
  await respirer();
  queueTracks.set(FILE as any);
  flushSync();
  const racine = hote.querySelector<HTMLElement>('.now-playing');
  expect(racine, 'racine de l’écran introuvable — témoin sans objet').not.toBeNull();
  expect(racine!.classList.contains('wide'), 'disposition large non atteinte — témoin sans objet').toBe(true);
  return racine!;
}

beforeAll(() => {
  // jsdom n'a pas de mise en page : `bind:clientWidth` lit cette valeur.
  largeurAvant = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
});

afterAll(() => {
  if (largeurAvant) Object.defineProperty(HTMLElement.prototype, 'clientWidth', largeurAvant);
});

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown) =>
    reponse(String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree))));
  vi.stubGlobal('WebSocket', class { close(){} addEventListener(){} removeEventListener(){} send(){} } as any);
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} } as any);
  activeView.set('nowplaying');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  zones.set([]);
  queueTracks.set([]);
  preferences.update((p) => ({ ...p, dispositionFile: 'droite' }));
  vi.unstubAllGlobals();
});

describe('web#1837 — 1. le DOM : la classe d’élargissement, file repliée', () => {
  it('« sous la barre », file REPLIÉE : `.content-layout` porte `file-sous-barre`', async () => {
    preferences.update((p) => ({ ...p, dispositionFile: 'sousLaBarre' }));
    const racine = await poser();
    // Repliée : aucune feuille dépliée, l'aperçu « À suivre » est là.
    expect(racine.querySelector('.queue-sheet')).toBeNull();
    expect(racine.querySelector('.up-next')).not.toBeNull();
    const ilot = racine.querySelector<HTMLElement>('.content-layout')!;
    expect(ilot.classList.contains('wide')).toBe(true);
    expect(ilot.classList.contains('file-sous-barre')).toBe(true);
    // La colonne titres est bien l'enfant direct que vise la règle.
    expect(ilot.querySelector(':scope > .info-column')).not.toBeNull();
  });

  it('« à droite » (défaut), file repliée : pas de classe, la colonne reste plafonnée', async () => {
    preferences.update((p) => ({ ...p, dispositionFile: 'droite' }));
    const racine = await poser();
    const ilot = racine.querySelector<HTMLElement>('.content-layout')!;
    expect(ilot.classList.contains('wide')).toBe(true);
    expect(ilot.classList.contains('file-sous-barre')).toBe(false);
  });
});

describe('web#1837 — 2. la feuille compilée garde la règle d’élargissement', () => {
  it('Svelte n’élague pas `.content-layout.wide.file-sous-barre .info-column`', () => {
    const { css } = compile(SOURCE, { filename: CHEMIN, css: 'external' });
    expect(css, 'aucune feuille compilée').not.toBeNull();
    const code = css!.code.replace(/\s+/g, ' ');
    // Svelte 5 sort : `.content-layout.wide.file-sous-barre.svelte-xxxx
    // .info-column:where(.svelte-xxxx) { flex: 1 1 auto; max-width: none; }` —
    // le `:where()` n'ajoute aucune spécificité, la règle garde donc sa classe
    // d'avance sur `.content-layout.wide.svelte-xxxx .info-column:where(…)`.
    const regle = /\.content-layout\.wide\.file-sous-barre\.(svelte-[\w-]+) \.info-column(?::where\(\.\1\)|\.\1) ?\{([^}]*)\}/.exec(code);
    expect(regle, 'règle d’élargissement absente de la feuille compilée (élaguée ?)').not.toBeNull();
    expect(regle![2]).toMatch(/max-width:\s*none/);
    expect(regle![2]).toMatch(/flex:\s*1 1 auto/);
  });
});

describe('web#1837 — 3. la cascade : le plafond de 420 px tombe', () => {
  const FEUILLE = extraireFeuilleDeStyle(SOURCE);
  const REGLES = releverReglesLargeur(FEUILLE);
  const ILOT = ['.content-layout', '.content-layout.wide'];
  const POCHETTE = ['.artwork-container', '.content-layout.wide .artwork-container'];
  const COLONNE_DROITE = ['.content-layout.wide .info-column'];
  const COLONNE_SOUS_BARRE = [...COLONNE_DROITE, '.content-layout.wide.file-sous-barre .info-column'];

  /** `gap` de l'îlot large, lu dans la feuille. */
  function ecart(ecran: Ecran): number {
    const r = regleEffective(releverDeclarations(FEUILLE, ['gap']), ILOT, 'gap', { ecran, survol: true });
    const px = /^(\d+)px$/.exec(r?.valeur ?? '');
    expect(px, 'gap de l’îlot large introuvable').not.toBeNull();
    return Number(px![1]);
  }

  // Écrans en pixels CSS : 1280×720, un 1920×1080 à 125 % (Windows), un 1920×1080 à 100 %.
  const ECRANS: Ecran[] = [
    { largeur: 1280, hauteur: 720 },
    { largeur: 1536, hauteur: 864 },
    { largeur: 1920, hauteur: 1080 },
  ];

  for (const ecran of ECRANS) {
    it(`${ecran.largeur}×${ecran.hauteur} : « à droite » plafonne à 420 px, « sous la barre » lève le plafond`, () => {
      expect(largeurMaxEffective(REGLES, COLONNE_DROITE, ecran)).toBe(420);
      const gagnante = regleEffective(REGLES, COLONNE_SOUS_BARRE, 'max-width', { ecran, survol: true });
      expect(gagnante?.selecteur).toBe('.content-layout.wide.file-sous-barre .info-column');
      expect(gagnante?.valeur).toBe('none');
    });

    it(`${ecran.largeur}×${ecran.hauteur} : la place laissée par l’îlot et la pochette dépasse 420 px`, () => {
      const ilot = largeurMaxEffective(REGLES, ILOT, ecran);
      const pochette = largeurMaxEffective(REGLES, POCHETTE, ecran);
      expect(ilot).not.toBeNull();
      expect(pochette).not.toBeNull();
      const place = ilot! - pochette! - ecart(ecran);
      // 960 − 360 − 40 = 560 sous 1400 px ; 1200 − 520 − 40 = 640 de 1400 à
      // 1800 px ; 1200 − 640 − 40 = 520 au-delà (la pochette grandit plus vite).
      expect(place).toBeGreaterThan(420);
    });
  }
});
