// @vitest-environment jsdom
// #2449 : vraie coquille, vrai magasin et vraie frontière HTTP ; aucune installation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
const flux = vi.hoisted(() => {
  class AudioMuet {
    volume = 1; muted = false; src = ''; currentTime = 0;
    addEventListener() {} removeEventListener() {} load() {} pause() {}
    play() { return Promise.resolve(); }
  }
  (globalThis as any).Audio = AudioMuet;
  return { abonnes: new Set<(e: any) => void>() };
});
vi.mock('../websocket', () => ({ tuneWS: {
  connect() {}, disconnect() {}, setCurrentZoneId() {}, isPolling: false,
  onEvent(h: (e: any) => void) { flux.abonnes.add(h); return () => flux.abonnes.delete(h); },
} }));
import ShellV2 from '../../components/v2/ShellV2.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { preferences } from '../stores/preferences';
import { detailOuvert, ongletCourant } from '../historiqueCoquille';
import { stopUpdatePolling, updateAvailable, updateBannerDismissed, latestVersion, currentVersion } from '../stores/updates';

const AVANT = { current: '1.0.0-rc8', latest: '1.0.0-rc8.1', update_available: true };
const APRES = { ...AVANT, current: '1.0.0-rc8.1', update_available: false };
const ZONE = { id: 1, name: 'Zone simulée', output_type: 'local', state: 'stopped', volume: 50 };
let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let verification: () => Promise<Response>;
let appels: { chemin: string; methode: string }[];
const json = (corps: unknown) => new Response(JSON.stringify(corps), { headers: { 'Content-Type': 'application/json' } });
const verifications = () => appels.filter((a) => a.chemin === '/api/v1/system/update/check').length;
async function stabiliser() {
  for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
async function monter() {
  composant = mount(ShellV2, { target: hote }); flushSync(); await stabiliser();
}
function retour(type: string) {
  if (type === '_connected') for (const h of [...flux.abonnes]) h({ type });
  else window.dispatchEvent(new Event(type));
  flushSync();
}
beforeEach(() => {
  vi.useFakeTimers(); stopUpdatePolling(); flux.abonnes.clear(); localStorage.clear(); appels = [];
  updateAvailable.set(false); updateBannerDismissed.set(false); latestVersion.set(null); currentVersion.set(null);
  preferences.update((p) => ({ ...p, language: 'fr' }));
  activeView.set('queue'); vueDeRetour.set(null); detailOuvert.set(null); ongletCourant.set(null);
  hote = document.createElement('div'); document.body.append(hote);
  verification = async () => json(AVANT);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const chemin = new URL(String(url), window.location.href).pathname;
    appels.push({ chemin, methode: init?.method ?? 'GET' });
    if (chemin === '/api/v1/system/update/check') return verification();
    if (chemin.endsWith('/zones')) return json([ZONE]);
    if (/\/zones\/1$/.test(chemin)) return json(ZONE);
    if (/\/queue/.test(chemin)) return json({ tracks: [], position: 0, length: 0 });
    if (chemin.endsWith('/streaming/services')) return json({});
    if (chemin.endsWith('/profiles')) return json([{ id: 1, name: 'Profil simulé', is_default: true }]);
    if (/\/(playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|tracks|albums|top-artists|recent|genres|smart-playlists)(\/|$)/.test(chemin)) return json([]);
    return json({});
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); stopUpdatePolling();
  flux.abonnes.clear(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers();
});
describe('#2449 — le bandeau rendu suit la version réellement relue', () => {
  it.each(['focus', 'online', '_connected'])('%s retire l’annonce après installation, sans nouvelle installation', async (evenement) => {
    await monter(); expect(hote.querySelector('.maj-txt')?.textContent).toContain('1.0.0-rc8.1');
    const avant = verifications(); verification = async () => json(APRES);
    retour(evenement); await stabiliser();
    expect(verifications()).toBeGreaterThan(avant); expect(hote.querySelector('.maj')).toBeNull();
    expect(appels.filter((a) => a.methode === 'POST' && a.chemin.includes('/system/update/'))).toEqual([]);
  });
  it('une réponse ancienne ne ressuscite pas le bandeau retiré au retour du serveur', async () => {
    let terminer!: (r: Response) => void;
    verification = () => new Promise((r) => { terminer = r; }); await monter();
    verification = async () => json(APRES); retour('_connected'); await stabiliser();
    expect(hote.querySelector('.maj')).toBeNull();
    terminer(json(AVANT)); await stabiliser(); expect(hote.querySelector('.maj')).toBeNull();
    expect(verifications()).toBe(2);
  });
});
