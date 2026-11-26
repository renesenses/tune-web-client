// @vitest-environment jsdom
//
// rc14 — recette de Bertrand sur le .18 (rc13.91, web `main` e1963e64e), le
// serveur annonce TESS (`GET /tess/catalog` → `contract_version: 1`) :
//
//   1. MENU PERSONNALISÉ : la barre passe bien en mode TESS (plus de Studio,
//      « Outils » apparaît), mais l'entrée TESS n'est pas là où on la voit.
//      Son ordre enregistré commence par Oxygen, Streaming… et ne montre pas
//      « File d'attente » (masquée, placée plus bas). La règle de #3419
//      (`placerTessApresLaFile`) rangeait TESS juste après la File d'attente
//      QUEL QUE SOIT l'ordre : derrière une File masquée et descendue, TESS
//      tombait au fond de la barre, sous les Raccourcis et « Outils ».
//      Une entrée NOUVELLE pour l'utilisateur doit apparaître d'office, à une
//      place visible ; une entrée qu'il a MASQUÉE reste masquée.
//   2. LIEN `#tess` : l'adresse `http://…:8888/#tess` tapée dans l'onglet de
//      Tune déjà ouvert affichait l'Accueil. Une adresse changée à la main ne
//      recharge pas la page : le navigateur crée une entrée SANS état
//      (`popstate` avec `state === null`, puis `hashchange`), et la coquille
//      ne lisait l'adresse qu'au chargement.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../../components/v2/CrossfeedProV2.svelte', () => ({ default: () => {} }));
vi.mock('../../components/v2/CrosstalkV2.svelte', () => ({ default: () => {} }));

import Sidebar, { CORE, ADVANCED, SELECTIONS, STUDIO, TOUTES_ENTREES } from '../../components/v2/Sidebar.svelte';
import OrdreBarreLateraleV2 from '../../components/v2/OrdreBarreLateraleV2.svelte';
import { activeView } from '../stores/navigation';
import { capaciteTess } from '../stores/tess';
import { preferences } from '../stores/preferences';
import { locale } from '../i18n';
import { placerTessApresLaFile } from '../placementMenuTess';
import { brancherHistoriqueCoquille } from '../historiqueCoquille';
import { lireGreffonTessAuChargement } from '../ouvertureTess';
import { greffonTessDemande } from '../stores/tessOuverture';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const vues = (l: { view: string }[]) => l.map((i) => i.view);

let hote: HTMLDivElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte as any);
  if (!('IntersectionObserver' in globalThis)) vi.stubGlobal('IntersectionObserver', ObservateurInerte as any);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false, status: 404, statusText: 'Not Found',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
  hote = document.createElement('div');
  document.body.appendChild(hote);
  activeView.set('home');
  greffonTessDemande.set(null);
});

afterEach(() => {
  if (monte) { try { unmount(monte); } catch { /* sans objet */ } monte = null; }
  hote.remove();
  capaciteTess.set('inconnue');
  greffonTessDemande.set(null);
  preferences.update((p) => ({ ...p, barreLaterale: null, barreGroupesReplies: [] }));
  activeView.set('home');
  vi.unstubAllGlobals();
});

async function laisserTourner() {
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}

// L'ordre de Bertrand : Oxygen, Streaming, Radio, Podcasts… en tête ; Accueil,
// « En cours » et la File d'attente descendus sous les Sélections, ces deux
// dernières masquées. TESS n'y figure pas : l'ordre date d'avant TESS.
const sansTess = (l: { view: string }[]) => vues(l).filter((v) => v !== 'tess');
const ORDRE_BERTRAND = [
  'oxygen', 'streaming', 'radios', 'podcasts', 'library', 'search', 'history',
  ...vues(ADVANCED), ...vues(SELECTIONS),
  'home', 'nowplaying', 'queue',
  ...sansTess(STUDIO),
];

async function monterBarre(choix: { ordre: string[]; masquees: string[] }, replies: string[] = []) {
  capaciteTess.set('oui');
  preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: choix, barreGroupesReplies: replies }));
  monte = mount(Sidebar as any, { target: hote });
  await laisserTourner();
}
const entrees = (sel: string) =>
  Array.from(hote.querySelectorAll<HTMLElement>(`${sel} button.nav[data-vue]`)).map((b) => b.dataset.vue);

describe('1. TESS dans un menu personnalisé', () => {
  it('le jeu d’essai est bien un ordre personnalisé complet, sans TESS', () => {
    expect(new Set(ORDRE_BERTRAND).size).toBe(ORDRE_BERTRAND.length);
    expect(ORDRE_BERTRAND).not.toContain('tess');
    expect(TOUTES_ENTREES.length).toBe(ORDRE_BERTRAND.length + 1);
  });

  it('🔴 File d’attente masquée et descendue : TESS en tête du noyau, visible, en haut de la barre', async () => {
    await monterBarre({ ordre: ORDRE_BERTRAND, masquees: ['queue', 'nowplaying'] });
    const haut = entrees('nav[data-ordre="libre"]');
    expect(haut).toContain('tess');
    expect(haut[0]).toBe('tess');
    // L'ordre enregistré n'est pas touché : le reste suit tel quel.
    expect(haut.slice(1, 5)).toEqual(['oxygen', 'streaming', 'radios', 'podcasts']);
    expect(get(preferences).barreLaterale).toEqual({ ordre: ORDRE_BERTRAND, masquees: ['queue', 'nowplaying'] });
    // Une seule entrée TESS dans toute la barre.
    expect(entrees('').filter((v) => v === 'tess')).toHaveLength(1);
  });

  it('🔴 même chose groupes repliés : TESS ne disparaît pas avec « Outils » ou « Sélections »', async () => {
    await monterBarre({ ordre: ORDRE_BERTRAND, masquees: ['queue', 'nowplaying'] }, ['outils', 'selections']);
    expect(entrees('').filter((v) => v === 'tess')).toHaveLength(1);
    expect(entrees('nav[data-ordre="libre"]')[0]).toBe('tess');
  });

  it('🔴 File visible mais placée dans un groupe REPLIÉ : TESS la suit et reste affichée (entrée du noyau)', async () => {
    const ordre = [...ORDRE_BERTRAND.filter((v) => v !== 'queue' && v !== 'converter'), 'converter', 'queue'];
    await monterBarre({ ordre, masquees: [] }, ['outils', 'selections']);
    const toutes = entrees('');
    expect(toutes).toContain('queue');
    expect(toutes).toContain('tess');
    expect(toutes.indexOf('tess')).toBe(toutes.indexOf('queue') + 1);
  });

  it('File d’attente visible : TESS juste après elle, comme le veut #3419', async () => {
    await monterBarre({ ordre: ORDRE_BERTRAND, masquees: [] });
    const toutes = entrees('');
    expect(toutes.indexOf('tess')).toBe(toutes.indexOf('queue') + 1);
  });

  it('contre-épreuve : TESS MASQUÉE par l’utilisateur reste masquée', async () => {
    await monterBarre({ ordre: [...ORDRE_BERTRAND, 'tess'], masquees: ['queue', 'tess'] });
    expect(entrees('')).not.toContain('tess');
  });

  it('pur : sans File affichée, TESS en tête ; sinon après la File ; le reste dans l’ordre', () => {
    const l = ['oxygen', 'home', 'queue', 'tess', 'library'].map((view) => ({ view }));
    expect(vues(placerTessApresLaFile(l, (it) => it.view !== 'queue'))).toEqual(['tess', 'oxygen', 'home', 'queue', 'library']);
    expect(vues(placerTessApresLaFile(l))).toEqual(['oxygen', 'home', 'queue', 'tess', 'library']);
    expect(vues(placerTessApresLaFile(l.filter((x) => x.view !== 'queue')))).toEqual(['tess', 'oxygen', 'home', 'library']);
  });

  it('Réglages › Interface : même place que la barre (TESS en tête quand la File est masquée)', async () => {
    capaciteTess.set('oui');
    preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: { ordre: ORDRE_BERTRAND, masquees: ['queue'] } }));
    monte = mount(OrdreBarreLateraleV2 as any, { target: hote });
    await laisserTourner();
    const lignes = Array.from(hote.querySelectorAll<HTMLElement>('[data-ordre-barre] [data-vue]')).map((e) => e.dataset.vue);
    expect(lignes[0]).toBe('tess');
  });

  it('contre-épreuve : ordre livré (non personnalisé), TESS après la File dans le noyau', async () => {
    capaciteTess.set('oui');
    preferences.update((p) => ({ ...p, settingsLevel: 'expert', barreLaterale: null, barreGroupesReplies: [] }));
    monte = mount(Sidebar as any, { target: hote });
    await laisserTourner();
    const toutes = entrees('');
    expect(toutes.indexOf('tess')).toBe(toutes.indexOf('queue') + 1);
    expect(vues(CORE)).toContain('queue');
  });
});

// ── 2. Le lien profond `#tess` ─────────────────────────────────────────────

describe('2. le lien `#tess` ouvre TESS', () => {
  let debrancher: (() => void) | null = null;
  afterEach(() => {
    debrancher?.(); debrancher = null;
    history.replaceState(null, '', '/');
  });

  it('au chargement (F5 sur `#tess?plugin=…`), capacité encore « inconnue » : TESS, puis TESS une fois « oui » connu', () => {
    history.replaceState(null, '', '/#tess?plugin=crossfeed');
    capaciteTess.set('inconnue');
    lireGreffonTessAuChargement(location.hash);
    debrancher = brancherHistoriqueCoquille();
    expect(get(activeView)).toBe('tess');
    expect(get(greffonTessDemande)).toBe('crossfeed');
    capaciteTess.set('oui');
    expect(get(activeView)).toBe('tess');
  });

  it('🔴 adresse tapée dans l’onglet ouvert (`#tess`) : TESS s’ouvre au lieu de rester sur l’Accueil', async () => {
    history.replaceState(null, '', '/');
    capaciteTess.set('oui');
    debrancher = brancherHistoriqueCoquille();
    expect(get(activeView)).toBe('home');
    location.hash = '#tess';
    await laisserTourner();
    expect(get(activeView)).toBe('tess');
    expect(location.hash).toBe('#tess');
    expect(history.state).toMatchObject({ tune: 'v2', vue: 'tess' });
  });

  it('🔴 `#tess?plugin=<id>` tapé dans l’onglet ouvert : TESS, greffon demandé, paramètre gardé', async () => {
    history.replaceState(null, '', '/');
    capaciteTess.set('oui');
    debrancher = brancherHistoriqueCoquille({ surAdresseTapee: lireGreffonTessAuChargement });
    location.hash = '#tess?plugin=equalizer-parametric';
    await laisserTourner();
    expect(get(activeView)).toBe('tess');
    expect(get(greffonTessDemande)).toBe('equalizer-parametric');
  });

  it('contre-épreuve : une ancre qui n’est pas une vue ne déplace rien', async () => {
    history.replaceState(null, '', '/');
    debrancher = brancherHistoriqueCoquille();
    activeView.set('library');
    location.hash = '#contenu-principal';
    await laisserTourner();
    expect(get(activeView)).toBe('library');
  });
});
