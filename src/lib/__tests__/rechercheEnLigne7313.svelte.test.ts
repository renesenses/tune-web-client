// @vitest-environment jsdom
/**
 * tune-server-rust#7313 (Tades, fil 2506) — « le bouton recherche de covers
 * affiche comme s'il lançait la recherche… mais ne lance rien ».
 *
 * Le bouton ne faisait que RELIRE le disque (`/library/artwork/rescan`) : un
 * album sans image sur le disque restait sans pochette. Go de Bertrand du
 * 30/10 : le bouton enchaîne la relecture du disque PUIS la recherche en ligne
 * (`/library/artwork/enrich`), et affiche l'avancement des deux.
 *
 * Écran Réglages réellement monté, couche API réelle, HTTP et WebSocket simulés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const flux = vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
  return { abonnes: new Set<(e: any) => void>(), sondage: false };
});
vi.mock('../websocket', () => ({ tuneWS: {
  connect() {}, setCurrentZoneId() {},
  get isPolling() { return flux.sondage; },
  onEvent(h: (e: any) => void) { flux.abonnes.add(h); return () => flux.abonnes.delete(h); },
} }));

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { v2SettingsTarget } from '../stores/v2SettingsNav';
import { locale } from '../i18n';
import { ECHECS_SUIVI_EN_LIGNE_MAX, INTERVALLE_SUIVI_EN_LIGNE } from '../recherchePochettesEnLigne';

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let ordre: string[];
let demarrage: () => Promise<Response>;
let etatServeur: () => Promise<Response>;
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
async function stabiliser() {
  for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
function pousser(type: string, data?: unknown) {
  for (const h of [...flux.abonnes]) h({ type, data });
  flushSync();
}
const bouton = () => hote.querySelector<HTMLButtonElement>('[data-recherche-pochettes] button')!;
const enLigne = () => hote.querySelector('[data-suivi-pochettes-en-ligne]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
async function monter() {
  v2SettingsTarget.set({ tab: 'library', section: 'enrichment' });
  composant = mount(SettingsV2, { target: hote }); flushSync(); await stabiliser();
  expect(bouton(), 'la vraie ligne de recherche de pochettes doit être visible').not.toBeNull();
}
async function disqueTermine(found = 1) {
  bouton().click(); flushSync(); await stabiliser();
  pousser('library.artwork.completed', { current: 10, total: 10, found });
  await stabiliser();
}
async function attendreUnTour() {
  await vi.advanceTimersByTimeAsync(INTERVALLE_SUIVI_EN_LIGNE); await stabiliser();
}

beforeEach(async () => {
  vi.useFakeTimers(); ordre = []; flux.abonnes.clear(); flux.sondage = false;
  locale.set('fr'); preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  hote = document.createElement('div'); document.body.appendChild(hote);
  demarrage = async () => json({ status: 'accepted', albums_to_process: 9 }, 202);
  etatServeur = async () => json({ result: { total: 9, enriched: 0, status: 'running' }, albums_without_cover: 9 });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    if (chemin === '/api/v1/library/artwork/rescan' && init?.method === 'POST') {
      ordre.push('disque'); return json({ status: 'accepted' }, 202);
    }
    if (chemin === '/api/v1/library/artwork/enrich' && init?.method === 'POST') {
      ordre.push('en_ligne'); return demarrage();
    }
    if (chemin === '/api/v1/library/artwork/enrich/status') return etatServeur();
    const corps = /\/(devices|outputs|stereo-pairs|group-delays|profiles|playlists|shortcuts|groups|directories)$|\/devices\/all$/.test(chemin) ? []
      : chemin.endsWith('/system/diagnostics') ? { zones_doublons: [] }
      : chemin.endsWith('tune-tested.json') ? { version: 1, count: 0, devices: [] } : {};
    return json(corps);
  }));
  await monter();
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); v2SettingsTarget.set(null);
  flux.abonnes.clear(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers();
});

describe('#7313 — le bouton relit le disque PUIS cherche en ligne', () => {
  it('la ligne explique les deux étapes', () => {
    expect(hote.querySelector('[data-recherche-pochettes]')?.textContent)
      .toContain('puis cherche en ligne celles qui manquent');
  });

  it('la recherche en ligne ne part qu’après la fin de la relecture du disque', async () => {
    bouton().click(); flushSync(); await stabiliser();
    expect(ordre).toEqual(['disque']);
    pousser('library.artwork.progress', { current: 4, total: 10, found: 1 }); await stabiliser();
    expect(ordre, 'pas de recherche en ligne pendant la relecture du disque').toEqual(['disque']);
    pousser('library.artwork.completed', { current: 10, total: 10, found: 1 }); await stabiliser();
    expect(ordre).toEqual(['disque', 'en_ligne']);
    expect(enLigne()).toContain('Recherche en ligne en cours');
    expect(enLigne()).toContain('9 albums encore sans pochette');
    expect(bouton().disabled, 'le bouton reste occupé pendant la recherche en ligne').toBe(true);
  });

  it('l’avancement en ligne se lit sur le serveur, puis le bilan final fait foi', async () => {
    await disqueTermine();
    etatServeur = async () => json({ result: { total: 9, enriched: 0, status: 'running' }, albums_without_cover: 6 });
    await attendreUnTour();
    expect(enLigne()).toContain('3 pochettes trouvées'); expect(enLigne()).toContain('6 albums encore sans pochette');
    etatServeur = async () => json({ result: { total: 9, enriched: 4, searched: 2, failed: 5 }, albums_without_cover: 5 });
    await attendreUnTour();
    expect(enLigne()).toContain('Recherche en ligne terminée'); expect(enLigne()).toContain('4 pochettes trouvées pour 9 albums');
    expect(bouton().disabled).toBe(false);
  });

  it('rien à chercher en ligne : il le dit', async () => {
    demarrage = async () => json({ status: 'skipped', missing: 0 });
    await disqueTermine();
    expect(enLigne()).toContain('tous les albums ont une pochette'); expect(bouton().disabled).toBe(false);
  });

  it('le quota gratuit épuisé est nommé, pas maquillé en recherche lancée', async () => {
    demarrage = async () => json({ code: 'quota', error: 'free_tier_daily_enrichment_limit_reached' }, 429);
    await disqueTermine();
    expect(enLigne()).toContain('quota gratuit du jour est atteint');
    expect(enLigne()).not.toContain('en cours'); expect(bouton().disabled).toBe(false);
  });

  it('une panne au démarrage en ligne est dite', async () => {
    demarrage = async () => json({ error: 'refus_synthetique' }, 500);
    await disqueTermine();
    expect(enLigne()).toContain('n’a pas pu démarrer'); expect(bouton().disabled).toBe(false);
  });

  it('une relecture du disque partielle ou sans suivi n’enchaîne pas la recherche en ligne', async () => {
    bouton().click(); flushSync(); await stabiliser();
    pousser('library.artwork.completed', { current: 3, total: 10, found: 1 }); await stabiliser();
    expect(ordre).toEqual(['disque']); expect(enLigne()).toBe('');
    flux.sondage = true; bouton().click(); flushSync(); await stabiliser();
    expect(ordre).toEqual(['disque', 'disque']); expect(enLigne()).toBe('');
  });

  it('des lectures d’état ratées finissent en suivi perdu, sans succès inventé', async () => {
    await disqueTermine();
    etatServeur = async () => json({ error: 'panne' }, 500);
    for (let i = 0; i < ECHECS_SUIVI_EN_LIGNE_MAX; i++) await attendreUnTour();
    expect(enLigne()).toContain('Suivi de la recherche en ligne perdu');
    expect(enLigne()).not.toContain('terminée'); expect(bouton().disabled).toBe(false);
  });

  it('un événement de fin du disque reçu hors clic ne lance rien en ligne', async () => {
    pousser('library.artwork.completed', { current: 10, total: 10, found: 1 }); await stabiliser();
    expect(ordre).toEqual([]);
  });

  it('démonter arrête le suivi en ligne', async () => {
    await disqueTermine();
    const lectures = (globalThis.fetch as any).mock.calls.length;
    await unmount(composant!); composant = undefined;
    await vi.advanceTimersByTimeAsync(INTERVALLE_SUIVI_EN_LIGNE * 3);
    const apres = (globalThis.fetch as any).mock.calls
      .slice(lectures).filter((c: any[]) => String(c[0]).includes('/library/artwork/enrich/status'));
    expect(apres).toEqual([]);
  });
});
