// @vitest-environment jsdom
//
// Tune Circle rc9 — la carte publique de la vue Monde (décision de Bertrand du
// 26/10/2026, web#2433) : points ANONYMES de la communauté (1°, aucun nom ni
// identifiant), avis aux personnes qui avaient posé leur ville, interrupteur
// « Me retirer de la carte publique » effectif tout de suite. Un serveur sans
// ces routes (404) garde l'écran rc8 tel quel. jsdom : vue liste.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import fr from '../locales/fr';
import { chargerVilles } from '../champCercle/villes';
import { pointsPublicsValides } from '../circleMonde';

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let lieu: 'absent' | 'panne' | null | Record<string, unknown> = null;
/** `null` : serveur sans les routes rc9 (404). */
let points: unknown[] | null = null;
let retire: boolean | null = null;
let panneRetrait = false;

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

function cloud(chemin: string, method: string, body: any): Response {
  if (method === 'GET' && chemin === '') {
    return reponse(200, {
      members: [
        { user_id: 12, name: 'Alice', since: '2026-09-01T10:00:00Z' },
        { user_id: 13, name: 'Bruno', since: '2026-09-02T10:00:00Z' },
      ],
      sent: [], received: [], circles: [{ id: 7, name: 'Famille', member_ids: [12], sharing: { library: false } }],
    });
  }
  if (chemin === '/library-sync') return reponse(200, { last_sync: null });
  if (chemin === '/shared-with-me') return reponse(200, [{ user_id: 12, name: 'Alice' }]);
  if (chemin === '/me/location') {
    if (lieu === 'absent') return reponse(404, { error: 'not_found' });
    if (lieu === 'panne') return reponse(503, { code: 'circle.cloud_unavailable' });
    if (method === 'GET') return lieu ? reponse(200, lieu) : reponse(204);
    if (method === 'PUT') { lieu = { ...body }; return reponse(200, lieu); }
    if (method === 'DELETE') { lieu = null; return reponse(204); }
  }
  if (chemin === '/contacts/locations') return reponse(200, []);
  if (chemin === '/world/points' && points !== null && method === 'GET') return reponse(200, points);
  if (chemin === '/me/public-map-opt-out' && retire !== null) {
    if (panneRetrait && method !== 'GET') return reponse(503, { connected: true, code: 'circle.cloud_unavailable', upstream_status: 500 });
    if (method === 'PUT') retire = true;
    if (method === 'DELETE') retire = false;
    return reponse(200, { public_map_opt_out: retire });
  }
  if (chemin === '/contacts/12/library/summary') return reponse(200, { albums: 1234, genres: [{ genre: 'Jazz', albums: 140 }] });
  return reponse(404, { error: 'not_found' });
}

// L'index des villes, chargé d'avance : sous horloge factice, un import
// dynamique pendant le test n'aurait pas le temps d'aboutir.
beforeAll(async () => { await preparerLocale('fr'); await chargerVilles(); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  lieu = null;
  points = null;
  retire = null;
  panneRetrait = false;
  try { localStorage.clear(); } catch { /* rien */ }
  circlePlugin.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/ext/circle')) return cloud(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''), method, body);
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
const vers = (re: RegExp) => appels.filter((a) => re.test(a.url));
async function saisir(el: Element, sel: string, v: string) {
  const c = el.querySelector(sel) as HTMLInputElement;
  c.value = v;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  await laisserFaire();
}


const TALANT = { label: 'Talant', country_code: 'FR', lat: 47.5, lon: 5.0 };
const POINTS = [{ lat: 48.0, lon: 5.0 }, { lat: -34.0, lon: 151.0 }];

describe('Tune Circle rc9 — points de la carte publique', () => {
  it('ne garde que lat/lon, au degré, sans doublon, longitude 180 repliée, hors bornes écartés', () => {
    const v = pointsPublicsValides([
      { lat: 47.5, lon: 5.0, name: 'Alice', user_id: 12, label: 'Talant' },
      { lat: 48.2, lon: 4.6 },
      { lat: 10, lon: 180 }, { lat: 10.2, lon: -179.8 },
      { lat: -0.2, lon: 0.3 },
      { lat: 91, lon: 0 }, { lat: 0, lon: 'x' }, null, 'Bob',
    ]);
    expect(v).toEqual([{ lat: 48, lon: 5 }, { lat: 10, lon: -180 }, { lat: 0, lon: 0 }]);
    for (const p of v) expect(Object.keys(p).sort()).toEqual(['lat', 'lon']);
    expect(Object.is(v[2].lat, -0)).toBe(false);
    expect(pointsPublicsValides({ data: [] })).toEqual([]);
  });
});

describe('Tune Circle rc9 — écran', () => {
  it('serveur sans les routes rc9 (404) : ni avis, ni interrupteur, ni point ; l\'écran rc8 est intact', async () => {
    lieu = { ...TALANT };
    const el = await poser();
    expect(el.querySelector('.interrupteur-lieu')).not.toBeNull();
    expect(el.querySelector('.interrupteur-retrait')).toBeNull();
    expect(el.querySelector('.sc-avis-public')).toBeNull();
    expect(el.querySelector('.sc-compte-public')).toBeNull();
    expect(el.querySelector('.sc-retour-retrait')).toBeNull();
  });

  it('la vue Monde s\'ouvre sur la communauté, en zones anonymes : aucun nom ni identifiant venu des points', async () => {
    points = [...POINTS, { lat: 46, lon: 2, name: 'Fantôme', user_id: 99, label: 'Village-Secret' }];
    retire = false;
    const el = await poser();
    // Aucun contact n'a posé sa ville : c'est la carte publique qui ouvre le globe.
    expect(el.querySelector('.vue-monde')?.getAttribute('aria-pressed')).toBe('true');
    expect(texte(el.querySelector('.sc-compte-public'))).toBe(fr['v2.circle.scene.world.publicCount'].replace('{n}', '3'));
    expect(texte(el)).not.toContain('Fantôme');
    expect(texte(el)).not.toContain('Village-Secret');
    expect(texte(el)).not.toMatch(/\b99\b/);
    // Les points ne sont pas des personnes : aucune ligne, aucun bouton pour eux.
    expect(el.querySelectorAll('.sc-liste .sc-ligne')).toHaveLength(0);
    expect(texte(el)).not.toContain(fr['v2.circle.scene.world.empty']);
  });

  it('prévient qui avait posé sa ville, et « Compris » le range pour de bon', async () => {
    lieu = { ...TALANT };
    points = POINTS;
    retire = false;
    let el = await poser();
    const avis = el.querySelector('.sc-avis-public');
    expect(texte(avis?.querySelector('.sc-avis-titre') ?? null)).toBe(fr['v2.circle.scene.public.noticeTitle']);
    expect(texte(avis)).toContain(fr['v2.circle.scene.public.notice']);
    (el.querySelector('.sc-avis-compris') as HTMLButtonElement).click();
    await laisserFaire();
    expect(el.querySelector('.sc-avis-public')).toBeNull();
    unmount(monte!); monte = null; hote?.remove();
    el = await poser();
    expect(el.querySelector('.sc-avis-public')).toBeNull();
    expect(el.querySelector('.interrupteur-retrait')).not.toBeNull();
  });

  it('pas d\'avis pour qui n\'a pas posé sa ville ; l\'explication dit la carte publique', async () => {
    points = POINTS;
    retire = false;
    const el = await poser();
    expect(el.querySelector('.sc-avis-public')).toBeNull();
    expect(texte(el.querySelector('.sc-lieu'))).toContain(fr['v2.circle.scene.loc.what']);
    expect(fr['v2.circle.scene.loc.what']).toMatch(/contacts acceptés/);
    expect(fr['v2.circle.scene.loc.what']).toMatch(/point anonyme sur la carte publique/);
    expect(fr['v2.circle.scene.loc.what']).toMatch(/sauf si vous vous en retirez/);
  });

  it('« Me retirer de la carte publique » : PUT tout de suite, puis DELETE pour revenir ; le lieu des contacts n\'est pas touché', async () => {
    lieu = { ...TALANT };
    points = POINTS;
    retire = false;
    const el = await poser();
    const inter = () => el.querySelector('.interrupteur-retrait') as HTMLButtonElement;
    expect(inter().getAttribute('aria-checked')).toBe('false');
    expect(texte(inter())).toBe(fr['v2.circle.scene.public.optOut']);
    expect(texte(el.querySelector('.sc-etat-retrait'))).toBe(fr['v2.circle.scene.public.optedIn']);

    inter().click();
    await laisserFaire();
    const ecrits = () => appels.filter((a) => /public-map-opt-out/.test(a.url) && a.method !== 'GET').map((a) => [a.method, a.body]);
    expect(ecrits()).toEqual([['PUT', undefined]]);
    expect(retire).toBe(true);
    expect(inter().getAttribute('aria-checked')).toBe('true');
    expect(texte(el.querySelector('.sc-etat-retrait'))).toBe(fr['v2.circle.scene.public.optedOut']);

    inter().click();
    await laisserFaire();
    expect(ecrits()).toEqual([['PUT', undefined], ['DELETE', undefined]]);
    expect(inter().getAttribute('aria-checked')).toBe('false');
    // Ni le lieu ni son retrait n'ont été écrits par l'interrupteur.
    expect(appels.filter((a) => /\/me\/location/.test(a.url) && a.method !== 'GET')).toHaveLength(0);
    expect((el.querySelector('.interrupteur-lieu') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
  });

  it('cloud en panne au moment du retrait : la phrase, et l\'interrupteur ne ment pas', async () => {
    lieu = { ...TALANT };
    points = POINTS;
    retire = false;
    panneRetrait = true;
    const el = await poser();
    (el.querySelector('.interrupteur-retrait') as HTMLButtonElement).click();
    await laisserFaire();
    expect(el.querySelector('.sc-retour-retrait')).not.toBeNull();
    expect((el.querySelector('.interrupteur-retrait') as HTMLButtonElement).getAttribute('aria-checked')).toBe('false');
  });

  it('aucune présence : rien n\'est demandé sur qui est en ligne', async () => {
    points = POINTS;
    retire = false;
    await poser();
    expect(appels.filter((a) => /presence|online|en-ligne/i.test(a.url))).toHaveLength(0);
  });
});
