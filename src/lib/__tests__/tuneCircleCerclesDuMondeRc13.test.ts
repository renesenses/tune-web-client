// @vitest-environment jsdom
//
// Tune Circle rc13 — tous les cercles du monde (décisions de Bertrand du
// 20/11/2026) : par pays, en tranches, anonymes. Témoin : aucun nom ni
// identifiant d'un non-membre ne sort, même si le cloud se trompait et en
// envoyait (contre-épreuve). Mes cercles gardent leur affichage nommé. Un
// serveur sans la route (404) garde l'écran tel quel. jsdom : vue liste.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import fr from '../locales/fr';
import { chargerVilles } from '../champCercle/villes';
import { cerclesDuMondeValides, teinteCercles, trancheEnNombre, TRANCHES } from '../cerclesMonde';
import { niveauPays } from '../paysMonde';

type Appel = { url: string; method: string };
let appels: Appel[] = [];
let lieu: Record<string, unknown> | null = null;
/** `null` : serveur sans la route rc13 (404). */
let cercles: unknown[] | null = null;

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

function cloud(chemin: string, method: string): Response {
  if (method === 'GET' && chemin === '') {
    return reponse(200, {
      members: [{ user_id: 12, name: 'Alice', since: '2026-09-01T10:00:00Z' }],
      sent: [], received: [], circles: [{ id: 7, name: 'Famille', member_ids: [12], sharing: { library: false } }],
    });
  }
  if (chemin === '/library-sync') return reponse(200, { last_sync: null });
  if (chemin === '/shared-with-me') return reponse(200, []);
  if (chemin === '/me/location') return lieu ? reponse(200, lieu) : reponse(204);
  if (chemin === '/contacts/locations') return reponse(200, []);
  if (chemin === '/world/points') return reponse(200, []);
  if (chemin === '/me/public-map-opt-out') return reponse(200, { public_map_opt_out: false });
  if (chemin === '/world/circles' && cercles !== null && method === 'GET') return reponse(200, cercles);
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); await chargerVilles(); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  lieu = null;
  cercles = null;
  try { localStorage.clear(); } catch { /* rien */ }
  circlePlugin.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: u, method });
    if (u.includes('/ext/circle')) return cloud(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''), method);
    if (u.endsWith('/plugins')) return reponse(200, [{ name: 'circle', installed: true, enabled: true }]);
    return reponse(200, {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
}
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CircleV2 as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Ce qu'un cloud fautif enverrait en trop : rien de tout cela ne doit s'afficher. */
const FUITE = { name: 'Zoé Fantôme', circle_name: 'Club-Secret', owner_id: 4242, member_id: 4343, circle_id: 4444, lat: 50.85, lon: 4.35, label: 'Village-Secret', members_exact: 3 };
const CERCLES = [
  { country_code: 'BE', circles: '<5', members: '5-19', ...FUITE },
  { country_code: 'fr', circles: '5-19', members: '20-99' },
];

describe('Tune Circle rc13 — lecture des cercles du monde', () => {
  it('ne garde que le code pays et deux tranches connues ; tout autre champ est perdu (témoin)', () => {
    const v = cerclesDuMondeValides([
      ...CERCLES,
      { country_code: 'BE', circles: '5-19', members: '5-19' }, // doublon : le premier reste
      { country_code: 'XX', circles: '<5', members: '<5' },     // pays inconnu
      { country_code: 'DE', circles: 3, members: '<5' },         // nombre exact refusé
      { country_code: 'IT', circles: '<5', members: '7' },       // tranche inconnue
      null, 'Bob',
    ]);
    expect(v).toEqual([
      { code: 'BE', cercles: '<5', membres: '5-19' },
      { code: 'FR', cercles: '5-19', membres: '20-99' },
    ]);
    for (const p of v) expect(Object.keys(p).sort()).toEqual(['cercles', 'code', 'membres']);
    // Contre-épreuve : la fuite était bien dans la réponse, elle n'est plus dans ce qui est gardé.
    expect(JSON.stringify(CERCLES)).toContain('Zoé Fantôme');
    const garde = JSON.stringify(v);
    for (const interdit of ['Zoé', 'Club-Secret', 'Village-Secret', '4242', '4343', '4444', '50.85', '4.35']) {
      expect(garde).not.toContain(interdit);
    }
    expect(cerclesDuMondeValides({ data: CERCLES })).toEqual([]);
  });

  it('les tranches sont celles de la carte /world, et teintent le globe au même niveau', () => {
    expect([...TRANCHES]).toEqual(['<5', '5-19', '20-99', '100-499', '500+']);
    expect(TRANCHES.map((t) => niveauPays(trancheEnNombre(t)))).toEqual([0, 1, 2, 3, 4]);
    expect({ ...teinteCercles([{ code: 'BE', cercles: '<5', membres: '5-19' }]) }).toEqual({ BE: '<5' });
  });
});

describe('Tune Circle rc13 — écran', () => {
  it('serveur sans la route (404) : ni couche, ni avis ; l\'écran reste tel quel', async () => {
    lieu = { label: 'Talant', country_code: 'FR', lat: 47.5, lon: 5.0 };
    const el = await poser();
    expect(appels.some((a) => a.url.endsWith('/ext/circle/world/circles'))).toBe(true);
    expect(el.querySelector('.cercles-monde')).toBeNull();
    expect(el.querySelector('.sc-avis-cercles')).toBeNull();
  });

  it('montre tous les cercles du monde par pays, en tranches, sans aucun nom ni identifiant de non-membre (témoin)', async () => {
    cercles = CERCLES;
    const el = await poser();
    const couche = el.querySelector('.cercles-monde');
    expect(couche).not.toBeNull();
    const t = texte(couche);
    expect(t).toContain(fr['v2.circle.worldCircles.title']);
    expect(t).toContain('Belgique');
    expect(t).toContain('France');
    expect(t).toContain('5–19');
    expect(t).toContain('20–99');
    expect(t).toContain(fr['v2.circle.worldCountries.lessFive']);
    // Contre-épreuve : rien de la fuite n'atteint l'écran.
    const tout = texte(el);
    for (const interdit of ['Zoé', 'Fantôme', 'Club-Secret', 'Village-Secret']) expect(tout).not.toContain(interdit);
    expect(tout).not.toMatch(/\b(4242|4343|4444)\b/);
    // Mon cercle garde son nom, comme avant.
    expect(tout).toContain('Famille');
  });

  it('prévient le propriétaire qui a posé sa ville, et « Compris » le range pour de bon', async () => {
    cercles = CERCLES;
    lieu = { label: 'Talant', country_code: 'FR', lat: 47.5, lon: 5.0 };
    let el = await poser();
    const avis = el.querySelector('.sc-avis-cercles');
    expect(texte(avis?.querySelector('.sc-avis-titre') ?? null)).toBe(fr['v2.circle.scene.circlesMap.noticeTitle']);
    expect(texte(avis)).toContain(fr['v2.circle.scene.circlesMap.notice']);
    expect(fr['v2.circle.scene.circlesMap.notice']).toMatch(/sans nom de cercle, sans nom de membre/i);
    (avis!.querySelector('.sc-avis-compris') as HTMLButtonElement).click();
    await laisserFaire();
    expect(el.querySelector('.sc-avis-cercles')).toBeNull();
    unmount(monte!); monte = null; hote?.remove();
    el = await poser();
    expect(el.querySelector('.sc-avis-cercles')).toBeNull();
  });

  it('pas d\'avis des cercles pour qui n\'a pas posé sa ville', async () => {
    cercles = CERCLES;
    const el = await poser();
    expect(el.querySelector('.sc-avis-cercles')).toBeNull();
  });
});
