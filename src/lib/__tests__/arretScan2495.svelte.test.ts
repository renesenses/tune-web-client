// @vitest-environment jsdom
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
import { terminerAvancement } from '../analyseBibliotheque';

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;
let statutServeur: { scanning: boolean; status: string; current: unknown };
let annulations: number;
let lectures: number;
let annuler: () => Promise<Response>;
let lireStatut: () => Promise<Response>;
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), {
  status, headers: { 'Content-Type': 'application/json' },
});
const actif = (stale = false) => ({ scanning: true, status: 'scanning', current: { origin: stale ? null : 'startup', path: null, stale } });
const repos = () => ({ scanning: false, status: 'idle', current: null });
async function stabiliser() {
  for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
async function monter() {
  v2SettingsTarget.set({ tab: 'library', section: 'library' });
  composant = mount(SettingsV2, { target: hote }); flushSync(); await stabiliser();
  expect(hote.querySelector('[data-analyse-bibliotheque]')).not.toBeNull();
}
const ligne = () => hote.querySelector('[data-analyse-bibliotheque]')!;
const stop = () => [...ligne().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Arrêter');
function pousser(type: string, data?: unknown) {
  for (const h of [...flux.abonnes]) h({ type, data }); flushSync();
}
async function arreter() { expect(stop()).toBeDefined(); stop()!.click(); flushSync(); await stabiliser(); }
beforeEach(() => {
  vi.useFakeTimers(); flux.abonnes.clear(); flux.sondage = false; terminerAvancement();
  locale.set('fr'); preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
  statutServeur = repos(); annulations = 0; lectures = 0;
  lireStatut = async () => json(statutServeur);
  annuler = async () => new Response(null, { status: 204 });
  hote = document.createElement('div'); document.body.append(hote);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const p = new URL(String(url), window.location.href).pathname;
    if (p === '/api/v1/system/scan/status') { lectures++; return lireStatut(); }
    if (p === '/api/v1/system/scan/cancel' && init?.method === 'POST') { annulations++; return annuler(); }
    const corps = /\/(devices|outputs|stereo-pairs|group-delays|profiles|playlists|shortcuts|groups|directories)$|\/devices\/all$/.test(p) ? []
      : p.endsWith('/system/diagnostics') ? { zones_doublons: [] }
      : p.endsWith('tune-tested.json') ? { version: 1, count: 0, devices: [] } : {};
    return json(corps);
  }));
});
afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined; hote.remove(); terminerAvancement(); v2SettingsTarget.set(null);
  flux.abonnes.clear(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers();
});
describe('#2495 — état et arrêt du scan dans le vrai écran', () => {
  it.each([false, true])('un statut serveur actif ou résiduel expose Arrêter (stale=%s)', async (stale) => {
    statutServeur = actif(stale); await monter(); expect(stop()).toBeDefined();
    if (stale) expect(hote.querySelector('[data-scan-detenteur]')?.textContent).toContain('Statut résiduel');
    expect(annulations).toBe(0);
  });
  it.each(['_connected', '_polling_started'])('%s relit le statut même si le client se croyait au repos', async (type) => {
    await monter(); const avant = lectures; statutServeur = actif(); pousser(type); await stabiliser();
    expect(lectures).toBeGreaterThan(avant); expect(stop()).toBeDefined();
  });
  it('le retour au premier plan recoupe le statut du serveur', async () => {
    await monter(); const avant = lectures; statutServeur = actif(true);
    window.dispatchEvent(new Event('focus')); await stabiliser();
    expect(lectures).toBeGreaterThan(avant); expect(stop()).toBeDefined();
  });
  it('un refus HTTP ne fait pas disparaître la commande ni le scan', async () => {
    statutServeur = actif(); await monter();
    annuler = async () => json({ error: 'refus synthétique' }, 503); await arreter();
    expect(annulations).toBe(1); expect(stop()).toBeDefined();
    expect(hote.textContent).toContain("Impossible d’arrêter l’analyse.");
  });
  it('204 demande l’arrêt mais ne prouve pas la fin du scan', async () => {
    statutServeur = actif(); await monter(); const avant = lectures; await arreter();
    expect(annulations).toBe(1); expect(lectures).toBeGreaterThan(avant);
    expect(ligne().textContent).toContain('analyse en cours');
    expect(ligne().textContent).toContain('Arrêt demandé');
    statutServeur = repos(); await vi.advanceTimersByTimeAsync(2501); flushSync(); await stabiliser();
    expect(ligne().textContent).not.toContain('analyse en cours');
    expect(ligne().textContent).toContain('Analyse rapide');
  });
  it('le statut résiduel remis au repos après 204 est reflété', async () => {
    statutServeur = actif(true); await monter();
    annuler = async () => { statutServeur = repos(); return new Response(null, { status: 204 }); };
    await arreter(); expect(stop()).toBeUndefined(); expect(ligne().textContent).toContain('Analyse rapide');
  });
  it('un clic puis un second événement pendant le POST n’envoient qu’un arrêt', async () => {
    statutServeur = actif(); await monter();
    let terminer!: (r: Response) => void; annuler = () => new Promise((r) => { terminer = r; });
    const b = stop()!; b.click(); flushSync(); b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await stabiliser(); expect(annulations).toBe(1);
    terminer(new Response(null, { status: 204 })); await stabiliser();
  });
  it('un avancement reçu après la connexion rétablit la commande avant le prochain sondage', async () => {
    await monter(); statutServeur = actif(); pousser('library.scan.progress', { phase: 'files', scanned: 2, total: 10 });
    expect(stop()).toBeDefined();
  });
  it('un statut illisible ne devient pas un arrêt et permet une nouvelle lecture', async () => {
    statutServeur = actif(); await monter(); lireStatut = async () => json({});
    window.dispatchEvent(new Event('focus')); await stabiliser();
    expect(stop()).toBeDefined(); expect(hote.textContent).toContain('État de l’analyse inconnu');
    lireStatut = async () => json(repos());
    const actualiser = [...hote.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Actualiser');
    expect(actualiser).toBeDefined(); actualiser!.click(); flushSync(); await stabiliser();
    expect(stop()).toBeUndefined(); expect(hote.textContent).not.toContain('État de l’analyse inconnu');
  });
  it('une panne HTTP du statut conserve le dernier état connu', async () => {
    statutServeur = actif(); await monter(); lireStatut = async () => json({ error: 'indisponible' }, 503);
    pousser('_connected'); await stabiliser();
    expect(stop()).toBeDefined(); expect(hote.textContent).toContain('État de l’analyse inconnu');
  });
  it('une ancienne lecture au repos ne masque pas le scan relu après reconnexion', async () => {
    let terminer!: (r: Response) => void;
    lireStatut = () => new Promise((r) => { terminer = r; }); await monter();
    lireStatut = async () => json(actif()); pousser('_connected'); await stabiliser(); expect(stop()).toBeDefined();
    terminer(json(repos())); await stabiliser(); expect(stop()).toBeDefined();
  });
  it('démonter nettoie le suivi et une annulation tardive ne touche pas le nouvel écran', async () => {
    statutServeur = actif(); await monter();
    let terminer!: (r: Response) => void; annuler = () => new Promise((r) => { terminer = r; });
    await arreter(); await unmount(composant!); composant = undefined; expect(flux.abonnes.size).toBe(0);
    statutServeur = repos(); await monter(); const avant = lectures;
    terminer(new Response(null, { status: 204 })); await stabiliser();
    expect(lectures).toBe(avant); expect(stop()).toBeUndefined();
  });
  it('une lecture partie avant le démarrage ne masque pas le scan accepté ensuite', async () => {
    let terminer!: (r: Response) => void;
    lireStatut = () => new Promise((r) => { terminer = r; }); await monter();
    const rapide = [...ligne().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Analyse rapide');
    rapide!.click(); flushSync(); await stabiliser(); expect(stop()).toBeDefined();
    terminer(json(repos())); await stabiliser(); expect(stop()).toBeDefined();
  });
  it('revenir à la rubrique Bibliothèque relit un scan démarré pendant la navigation', async () => {
    await monter(); v2SettingsTarget.set({ tab: 'general', section: 'general' }); flushSync(); await stabiliser();
    const avant = lectures; statutServeur = actif();
    v2SettingsTarget.set({ tab: 'library', section: 'library' }); flushSync(); await stabiliser();
    expect(lectures).toBeGreaterThan(avant); expect(stop()).toBeDefined();
  });
});
