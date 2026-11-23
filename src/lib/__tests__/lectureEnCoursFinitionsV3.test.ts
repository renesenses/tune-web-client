// @vitest-environment jsdom
//
// Design v3 de Levente (§10.2, §10.3, §10.5) — finitions de la rc14,
// décisions de Bertrand du 23/11/2026.
//
// 1. Paroles SYNCHRONISÉES dès l'ouverture quand un LRC existe (le karaoké
//    était éteint par défaut : il fallait cliquer « Karaoké »).
// 2. Les lignes : à gauche, en Inter, la ligne en cours en accent et en gras.
// 3. Le suivi de la ligne en cours fait défiler LE PANNEAU, jamais la page
//    (§10.5 : « Avoid automatic page scrolling »), et sans animation sous
//    `prefers-reduced-motion`.
// 4. « Écrit par… » sous les paroles : auteurs et compositeurs tirés des
//    crédits de la piste ; rien quand aucun n'est connu.
// 5. Le bouton du mode plein écran porte son LIBELLÉ (plus d'icône ronde
//    muette).
// 6. Mise en page 44/56 sur grand écran ; empilement / disposition actuelle
//    en dessous du seuil.
//
// Le banc MONTE l'écran, comme `lectureEnCoursV3.test.ts`.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import NowPlaying from '../../components/partages/NowPlaying.svelte';
import { zones, currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { queueTracks, queuePosition } from '../stores/queue';
import { locale } from '../i18n';
import { auteursDesParoles } from '../library/credits';
import { defilementParoles } from '../lyrics';
import { SEUIL_44_56, disposition44_56 } from '../dispositionLectureEnCours';
import type { TrackCredit } from '../types';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const feuille = (src: string) => {
  const i = src.lastIndexOf('<style');
  return src.slice(src.indexOf('>', i) + 1, src.lastIndexOf('</style>'));
};
const PAROLES_SRC = lire('src/components/partages/NowPlayingLyrics.svelte');
const NP_SRC = lire('src/components/partages/NowPlaying.svelte');

const FILE = Array.from({ length: 3 }, (_, i) => ({
  id: 700 + i, title: `Titre ${i + 1}`, artist_name: 'Pink Floyd', source: 'local', duration_ms: 180_000,
}));
const PISTE = {
  track_id: 700, album_id: 4, artist_id: 2,
  title: 'Titre 1', artist_name: 'Pink Floyd', album_title: 'The Wall',
  source: 'local', duration_ms: 180_000, format: 'flac', sample_rate: 44100, bit_depth: 16,
};

const credit = (artist_name: string, role: string, instrument: string | null = null): TrackCredit =>
  ({ id: null, track_id: 700, artist_id: null, artist_name, role, instrument, position: 0 });

let lrc: unknown = {};
let credits: TrackCredit[] = [];
let largeur = 1200;

function reponse(url: string): Response {
  let corps: unknown = /\/(zones|profiles|devices|playlists|shortcuts|search)(\?|$)/.test(url) ? [] : {};
  if (/\/queue/.test(url)) corps = { tracks: FILE, position: 0, length: FILE.length };
  if (/\/(history|favorites|plays)/.test(url)) corps = [];
  if (/\/credits/.test(url)) corps = credits;
  if (/\/lyrics/.test(url)) corps = lrc;
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let largeurAvant: PropertyDescriptor | undefined;
const versLaPage = vi.fn();

async function monter(): Promise<HTMLElement> {
  zones.set([{ id: 1, name: 'Salon', state: 'playing', current_track: PISTE, position_ms: 4000 }] as any);
  currentZoneId.set(1);
  queueTracks.set(FILE as any);
  queuePosition.set(0);
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(NowPlaying, { target: hote, props: { onAddToPlaylist: () => {} } as any });
  flushSync();
  await respirer();
  flushSync();
  return hote.querySelector<HTMLElement>('.now-playing')!;
}

async function ouvrirParoles(racine: HTMLElement) {
  racine.querySelector<HTMLButtonElement>('[data-np-action="lyrics"]')!.click();
  flushSync();
  await respirer();
  flushSync();
}

beforeAll(() => {
  largeurAvant = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => largeur });
});
afterAll(() => {
  if (largeurAvant) Object.defineProperty(HTMLElement.prototype, 'clientWidth', largeurAvant);
});
beforeEach(() => {
  locale.set('en');
  lrc = {};
  credits = [];
  largeur = 1200;
  versLaPage.mockReset();
  (Element.prototype as any).scrollIntoView = versLaPage;
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
  queuePosition.set(0);
  vi.unstubAllGlobals();
  delete (Element.prototype as any).scrollIntoView;
});

const LRC = {
  synced: true, source: 'lrc',
  lines: [
    { t_ms: 0, text: 'Première ligne' },
    { t_ms: 2000, text: 'Deuxième ligne' },
    { t_ms: 60_000, text: 'Plus tard' },
  ],
};

describe('Paroles v3 — synchronisées dès l’ouverture', () => {
  it('🔴 un LRC existe : le panneau s’ouvre en lignes synchronisées, sans clic « Karaoké »', async () => {
    lrc = LRC;
    const racine = await monter();
    await ouvrirParoles(racine);
    expect(racine.querySelector('.karaoke-panel'), 'texte brut à l’ouverture : karaokeMode vaut false').not.toBeNull();
    expect(racine.querySelector('.np-paroles-titre')?.textContent).toContain('Synced to playback');
    expect(racine.querySelector('.lyrics-text')).toBeNull();
  });

  it('texte simple : pas de lignes synchronisées ni de mention « synchronisé »', async () => {
    lrc = { lyrics: 'Une\nDeux' };
    const racine = await monter();
    await ouvrirParoles(racine);
    expect(racine.querySelector('.karaoke-panel')).toBeNull();
    expect(racine.querySelector('.lyrics-text')?.textContent).toContain('Une');
    expect(racine.querySelector('.np-paroles-titre')?.textContent).not.toContain('Synced');
  });

  it('le bouton reste : on peut repasser en texte brut', async () => {
    lrc = LRC;
    const racine = await monter();
    await ouvrirParoles(racine);
    racine.querySelector<HTMLButtonElement>('.karaoke-toggle')!.click();
    flushSync();
    expect(racine.querySelector('.karaoke-panel')).toBeNull();
    expect(racine.querySelector('.lyrics-text')).not.toBeNull();
  });
});

describe('Paroles v3 — défilement DANS le panneau', () => {
  it('🔴 la ligne en cours ne fait jamais défiler la page (plus de scrollIntoView)', async () => {
    lrc = LRC;
    const racine = await monter();
    await ouvrirParoles(racine);
    expect(racine.querySelector('.karaoke-line.active'), 'aucune ligne active — témoin sans objet').not.toBeNull();
    expect(versLaPage, 'scrollIntoView fait défiler toute la page (§10.5)').not.toHaveBeenCalled();
    expect(PAROLES_SRC).not.toContain('scrollIntoView');
  });

  it('la cible est calculée dans le panneau : ligne centrée, bornée à 0', () => {
    expect(defilementParoles({ ligneHaut: 400, ligneHauteur: 40, panneauHauteur: 300 }, false))
      .toEqual({ top: 270, behavior: 'smooth' });
    expect(defilementParoles({ ligneHaut: 20, ligneHauteur: 40, panneauHauteur: 300 }, false).top).toBe(0);
  });

  it('🔴 prefers-reduced-motion : saut direct, sans animation', () => {
    expect(defilementParoles({ ligneHaut: 400, ligneHauteur: 40, panneauHauteur: 300 }, true).behavior).toBe('auto');
  });

  it('le panneau a une hauteur maximale et défile seul ; pas de défilement doux forcé sous reduced-motion', () => {
    const css = feuille(PAROLES_SRC);
    const bloc = css.slice(css.indexOf('.np-lyrics {'), css.indexOf('}', css.indexOf('.np-lyrics {')));
    expect(bloc).toMatch(/max-height:\s*\d+px/);
    expect(bloc).toMatch(/overflow-y:\s*auto/);
    expect(bloc).toMatch(/overscroll-behavior:\s*contain/);
    expect(css).not.toMatch(/scroll-behavior:\s*smooth/);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('Paroles v3 — les lignes', () => {
  it('🔴 à gauche, en Inter ; la ligne en cours en accent et en gras', () => {
    const css = feuille(PAROLES_SRC);
    const regle = (sel: string) => {
      const i = css.indexOf(`${sel} {`);
      expect(i, `${sel} introuvable`).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    expect(regle('.karaoke-panel')).toMatch(/text-align:\s*left/);
    expect(regle('.karaoke-line')).toContain('font-family: var(--v2-police-texte');
    expect(regle('.karaoke-line')).not.toContain('--font-display');
    const active = regle('.karaoke-line.active');
    expect(active).toMatch(/color:\s*var\(--v2-acc1/);
    expect(active).toMatch(/font-weight:\s*700/);
  });
});

describe('Paroles v3 — « Écrit par… »', () => {
  it('auteurs et compositeurs, sans doublon, dans l’ordre des rôles ; rien d’autre', () => {
    expect(auteursDesParoles([
      credit('David Gilmour', 'performer', 'guitar'),
      credit('Roger Waters', 'lyricist'),
      credit('Roger Waters', 'composer'),
      credit('David Gilmour', 'composer'),
      credit('James Guthrie', 'producer'),
      credit('Bob Ezrin', 'writer'),
    ])).toEqual(['Roger Waters', 'David Gilmour', 'Bob Ezrin']);
    expect(auteursDesParoles([credit('James Guthrie', 'producer')])).toEqual([]);
    expect(auteursDesParoles([])).toEqual([]);
  });

  it('🔴 crédits présents → la ligne « Written by » sous les paroles', async () => {
    lrc = LRC;
    credits = [credit('Roger Waters', 'composer'), credit('David Gilmour', 'composer'), credit('X', 'engineer')];
    const racine = await monter();
    await ouvrirParoles(racine);
    const ligne = racine.querySelector('.np-paroles .np-paroles-auteurs');
    expect(ligne, '« Écrit par… » absent').not.toBeNull();
    expect(ligne!.textContent!.trim()).toBe('Written by Roger Waters and David Gilmour');
  });

  it('aucun crédit d’auteur → rien', async () => {
    lrc = LRC;
    credits = [credit('X', 'engineer')];
    const racine = await monter();
    await ouvrirParoles(racine);
    expect(racine.querySelector('.np-paroles')).not.toBeNull();
    expect(racine.querySelector('.np-paroles-auteurs')).toBeNull();
  });
});

describe('En-tête v3 — « Mode plein écran »', () => {
  it('🔴 le bouton porte son libellé visible, plus une icône ronde muette', async () => {
    const racine = await monter();
    const bouton = racine.querySelector<HTMLButtonElement>('.np-tv-btn');
    expect(bouton).not.toBeNull();
    expect(bouton!.querySelector('.np-tv-nom')?.textContent?.trim()).toBe('Full screen mode');
    expect(bouton!.getAttribute('aria-label')).toBe('Full screen mode');
    const css = feuille(NP_SRC);
    const i = css.indexOf('.np-tv-btn {');
    expect(css.slice(i, css.indexOf('}', i))).not.toContain('border-radius: 50%');
  });

  it('il mène toujours au Grand écran', async () => {
    const racine = await monter();
    racine.querySelector<HTMLButtonElement>('.np-tv-btn')!.click();
    await respirer();
    expect(get(activeView)).toBe('tv');
  });
});

describe('Mise en page v3 — 44/56 sur grand écran', () => {
  it('🔴 la règle de bascule', () => {
    expect(SEUIL_44_56).toBe(900);
    expect(disposition44_56(1200)).toBe(true);
    expect(disposition44_56(900)).toBe(true);
    expect(disposition44_56(899)).toBe(false);
    // Tablette en portrait (768 / 820 / 834 px) et téléphone : disposition actuelle.
    for (const l of [390, 768, 820, 834]) expect(disposition44_56(l), `${l} px`).toBe(false);
    expect(disposition44_56(0)).toBe(false);
  });

  it('🔴 large : la classe est posée ; étroit : rien ne change', async () => {
    largeur = 1200;
    let racine = await monter();
    expect(racine.querySelector('.content-layout')?.classList.contains('v3-44-56')).toBe(true);
    unmount(monte!); monte = null; hote?.remove();
    largeur = 768;
    racine = await monter();
    expect(racine.querySelector('.content-layout')?.classList.contains('v3-44-56')).toBe(false);
  });

  it('grille 44/56 aux pistes compressibles ; le kiosque reste en flex', () => {
    const css = feuille(NP_SRC);
    const i = css.indexOf('.content-layout.wide.v3-44-56 {');
    expect(i, 'règle 44/56 absente').toBeGreaterThan(-1);
    const bloc = css.slice(i, css.indexOf('}', i));
    expect(bloc).toContain('grid-template-columns: minmax(0, 44fr) minmax(0, 56fr)');
    expect(css).toMatch(/:global\(\[data-kiosk\]\) \.content-layout\.wide\.v3-44-56 \{\s*display: flex;/);
  });
});
