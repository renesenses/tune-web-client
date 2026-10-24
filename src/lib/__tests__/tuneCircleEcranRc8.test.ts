// @vitest-environment jsdom
//
// Tune Circle rc8 — l'écran monté : dégradé quand les routes relais manquent
// (404) ou que le cloud ne répond pas (503), lieu DÉSACTIVÉ par défaut puis
// posé (PUT arrondi) et retiré en un clic (DELETE), résumé demandé seulement
// pour un contact qui partage. jsdom n'a ni ResizeObserver ni Canvas 2D :
// l'écran y montre sa vue liste, celle des lecteurs d'écran.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import fr from '../locales/fr';
import { chargerVilles } from '../champCercle/villes';

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let lieu: 'absent' | 'panne' | null | Record<string, unknown> = null;

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

describe('Tune Circle rc8 — dégradé', () => {
  it('serveur sans routes relais (404) : contacts et cercles restent, globe, lieu et tailles disparaissent', async () => {
    lieu = 'absent';
    const el = await poser();
    expect(texte(el.querySelector('.sc-degrade'))).toBe(fr['v2.circle.scene.relay.absent']);
    expect(el.querySelector('.vue-monde')).toBeNull();
    expect(el.querySelector('.interrupteur-lieu')).toBeNull();
    // Aucune taille demandée : même pour le contact qui partage.
    expect(vers(/\/library\/summary/)).toHaveLength(0);
    const noms = [...el.querySelectorAll('.sc-ligne-nom')].map(texte);
    expect(noms).toEqual(expect.arrayContaining(['Alice', 'Bruno', 'Famille']));
    // Les blocs de gestion et l'invitation sont toujours là.
    expect(el.querySelector('input.email')).not.toBeNull();
    expect(el.querySelector('article.cercle')).not.toBeNull();
  });

  it('cloud injoignable (503) : la phrase, pas de globe, rien d\'inventé', async () => {
    lieu = 'panne';
    const el = await poser();
    expect(texte(el.querySelector('.sc-degrade'))).toBe(fr['v2.circle.scene.relay.down']);
    expect(el.querySelector('.vue-monde')).toBeNull();
    expect(el.querySelector('.interrupteur-lieu')).toBeNull();
  });
});

describe('Tune Circle rc8 — vie privée', () => {
  it('la taille n\'est demandée QUE pour un contact qui partage, et arrondie', async () => {
    const el = await poser();
    expect(vers(/\/contacts\/12\/library\/summary/)).toHaveLength(1);
    expect(vers(/\/contacts\/13\/library\/summary/)).toHaveLength(0);
    const ligne = (nom: string) => [...el.querySelectorAll('.sc-ligne')].find((li) => texte(li.querySelector('.sc-ligne-nom')) === nom);
    await (el.querySelector('.vue-reseau') as HTMLButtonElement).click();
    await laisserFaire();
    expect(texte(ligne('Alice')!)).toMatch(/environ 1\s?200 albums/);
    expect(texte(ligne('Bruno')!)).toContain(fr['v2.circle.scene.info.noShare']);
  });

  it('« Montrer ma ville » : ÉTEINT par défaut, rien n\'est écrit à l\'ouverture', async () => {
    const el = await poser();
    const inter = el.querySelector('.interrupteur-lieu') as HTMLButtonElement;
    expect(inter.getAttribute('aria-checked')).toBe('false');
    expect(appels.filter((a) => /\/me\/location/.test(a.url) && a.method !== 'GET')).toHaveLength(0);
    // Aucune géolocalisation du navigateur.
    expect(el.querySelector('.sc-pose')).toBeNull();
  });

  it('poser (PUT, arrondi au demi-degré) puis retirer en un clic (DELETE)', async () => {
    const geo = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: geo, watchPosition: geo } });
    const el = await poser();
    (el.querySelector('.interrupteur-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    expect(el.querySelector('.sc-pose')).not.toBeNull();
    await saisir(el, '.sc-libelle', 'Talant');
    await saisir(el, '.sc-lat', '47.34');
    await saisir(el, '.sc-lon', '5.01');
    (el.querySelector('.sc-enregistrer-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    const puts = appels.filter((a) => a.method === 'PUT');
    expect(puts, texte(el.querySelector('.sc-retour-lieu'))).toHaveLength(1);
    expect(puts[0].url).toMatch(/\/ext\/circle\/me\/location$/);
    expect(puts[0].body).toEqual({ label: 'Talant', lat: 47.5, lon: 5 });
    const inter = el.querySelector('.interrupteur-lieu') as HTMLButtonElement;
    expect(inter.getAttribute('aria-checked')).toBe('true');
    expect(texte(el.querySelector('.sc-lieu-actuel'))).toContain('Talant');

    inter.click();
    await laisserFaire();
    expect(appels.filter((a) => a.method === 'DELETE').map((a) => a.url.replace(/^.*\/api\/v1/, ''))).toEqual(['/ext/circle/me/location']);
    expect((el.querySelector('.interrupteur-lieu') as HTMLButtonElement).getAttribute('aria-checked')).toBe('false');
    expect(el.querySelector('.sc-lieu-actuel')).toBeNull();
    expect(geo).not.toHaveBeenCalled();
  });

  it('saisie incomplète : la phrase, et rien ne part', async () => {
    const el = await poser();
    (el.querySelector('.interrupteur-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    await saisir(el, '.sc-libelle', 'Talant');
    (el.querySelector('.sc-enregistrer-lieu') as HTMLButtonElement).click();
    await laisserFaire();
    expect(appels.filter((a) => a.method === 'PUT')).toHaveLength(0);
    expect(texte(el.querySelector('.sc-retour-lieu'))).toBe(fr['v2.circle.scene.loc.invalid']);
  });
});

describe('Tune Circle rc8 — accessibilité', () => {
  it('un résumé pour les lecteurs d\'écran, et des vues en boutons à bascule', async () => {
    const el = await poser();
    const resume = el.querySelector('.sc-resume')!;
    expect(resume.getAttribute('aria-live')).toBe('polite');
    expect(texte(resume)).toContain('Votre cercle : 2 contacts.');
    expect(texte(resume)).toContain('Genres en commun : Jazz (1).');
    const vues = [...el.querySelectorAll('.sc-vues button')];
    expect(vues.map(texte)).toEqual(['Monde', 'Solo', 'Lien', 'Réseau', 'Genres']);
    expect(vues.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });
});
