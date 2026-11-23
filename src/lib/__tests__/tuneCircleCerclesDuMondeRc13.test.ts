// @vitest-environment jsdom
//
// Tune Circle rc13 — tous les cercles du monde sur le globe (décisions de
// Bertrand du 20/11/2026, « Affiche tous les cercles comme les miens ») : un
// anneau anonyme par lieu de propriétaire, une tranche, aucun nom. Témoin :
// aucun nom ni identifiant d'un non-membre ne sort, même si le cloud se
// trompait et en envoyait (contre-épreuve). Mes cercles restent nommés. Un
// serveur sans la route (404) garde l'écran tel quel. jsdom : vue liste.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import fr from '../locales/fr';
import { chargerVilles } from '../champCercle/villes';
import { niveauTranche, pointsCerclesValides, TRANCHES } from '../cerclesMonde';

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

/** Ce qu'un cloud fautif enverrait en trop : rien de tout cela ne doit sortir. */
const FUITE = { name: 'Zoé Fantôme', circle_name: 'Club-Secret', owner_id: 4242, member_id: 4343, circle_id: 4444, label: 'Village-Secret', country_code: 'BE', since: '2026-10-01', exact: 3 };
const CERCLES = [
  { lat: 51.0, lon: 4.5, circles: '<5', ...FUITE },
  { lat: 46.0, lon: 5.0, circles: '5-19' },
];

describe('Tune Circle rc13 — lecture des cercles du monde', () => {
  it('ne garde que lat, lon (au demi-degré) et une tranche connue ; tout autre champ est perdu (témoin)', () => {
    const v = pointsCerclesValides([
      ...CERCLES,
      { lat: 50.87, lon: 4.38, circles: '<5' },  // plus fin que 0,5° → 51 ; 4,5 : doublon, le premier reste
      { lat: 10, lon: 180, circles: '<5' },      // 180 replié sur -180
      { lat: 91, lon: 0, circles: '<5' },        // hors bornes
      { lat: '12', lon: 3, circles: '<5' },      // pas un nombre
      { lat: 12, lon: 3, circles: 3 },           // nombre exact refusé
      { lat: 12, lon: 3, circles: '7' },         // tranche inconnue
      null, 'Bob',
    ]);
    expect(v).toEqual([
      { lat: 10, lon: -180, cercles: '<5' },
      { lat: 46, lon: 5, cercles: '5-19' },
      { lat: 51, lon: 4.5, cercles: '<5' },
    ]);
    for (const p of v) expect(Object.keys(p).sort()).toEqual(['cercles', 'lat', 'lon']);
    // Contre-épreuve : la fuite était bien dans la réponse, elle n'est plus dans ce qui est gardé.
    expect(JSON.stringify(CERCLES)).toContain('Zoé Fantôme');
    const garde = JSON.stringify(v);
    for (const interdit of ['Zoé', 'Club-Secret', 'Village-Secret', 'BE', '4242', '4343', '4444', '2026']) {
      expect(garde).not.toContain(interdit);
    }
    expect(pointsCerclesValides({ data: CERCLES })).toEqual([]);
  });

  it('les tranches sont celles de la carte /world, et donnent la taille de l\'anneau', () => {
    expect([...TRANCHES]).toEqual(['<5', '5-19', '20-99', '100-499', '500+']);
    expect(TRANCHES.map(niveauTranche)).toEqual([0, 1, 2, 3, 4]);
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

  it('montre tous les cercles du monde, anonymes, sans aucun nom ni identifiant de non-membre (témoin)', async () => {
    cercles = CERCLES;
    const el = await poser();
    const couche = el.querySelector('.cercles-monde');
    expect(couche).not.toBeNull();
    expect(texte(couche)).toContain(fr['v2.circle.worldCircles.title']);
    expect(texte(couche)).toContain(fr['v2.circle.worldCircles.legend']);
    expect(texte(couche?.querySelector('.cercles-compte') ?? null)).toBe(fr['v2.circle.worldCircles.count'].replace('{n}', '2'));
    // Contre-épreuve : rien de la fuite n'atteint l'écran.
    const tout = texte(el);
    for (const interdit of ['Zoé', 'Fantôme', 'Club-Secret', 'Village-Secret']) expect(tout).not.toContain(interdit);
    expect(tout).not.toMatch(/\b(4242|4343|4444)\b/);
    // Les anneaux ne sont pas des personnes : aucune ligne, aucun bouton pour eux.
    expect(el.querySelectorAll('.sc-liste .sc-ligne')).toHaveLength(0);
    // Mon cercle garde son nom, comme avant.
    expect(tout).toContain('Famille');
  });

  it('liste vide : la couche le dit, sans rien inventer', async () => {
    cercles = [];
    const el = await poser();
    (el.querySelector('.vue-monde') as HTMLButtonElement).click();
    await laisserFaire();
    const couche = el.querySelector('.cercles-monde');
    expect(couche).not.toBeNull();
    expect(texte(couche?.querySelector('.cercles-vide') ?? null)).toBe(fr['v2.circle.worldCircles.empty']);
    expect(couche?.querySelector('.cercles-interrupteur')).toBeNull();
  });

  it('prévient le propriétaire qui a posé sa ville, et « Compris » le range pour de bon', async () => {
    cercles = CERCLES;
    lieu = { label: 'Talant', country_code: 'FR', lat: 47.5, lon: 5.0 };
    let el = await poser();
    const avis = el.querySelector('.sc-avis-cercles');
    expect(texte(avis?.querySelector('.sc-avis-titre') ?? null)).toBe(fr['v2.circle.scene.circlesMap.noticeTitle']);
    expect(texte(avis)).toContain(fr['v2.circle.scene.circlesMap.notice']);
    expect(fr['v2.circle.scene.circlesMap.notice']).toMatch(/à l'emplacement de votre ville/);
    expect(fr['v2.circle.scene.circlesMap.notice']).toMatch(/sans nom de cercle ni de personne/);
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
