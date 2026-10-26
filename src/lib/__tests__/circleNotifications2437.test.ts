// @vitest-environment jsdom
//
// Tune Circle rc9 — les notifications de Tune web (décision de Bertrand du
// 26/10/2026, web#2437) : pastille de non-lus, liste (lire, tout marquer lu),
// un interrupteur par type. Ni push ni mail ; lire ne dit rien à l'émetteur.
// Un serveur sans ces routes (404) : rien ne s'affiche, le suivi s'arrête.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import PastilleNotifsCercle from '../../components/v2/PastilleNotifsCercle.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import {
  notifValide, notifsCercle, relireNotifications, demarrerSuiviNotifications, arreterSuiviNotifications,
  INTERVALLE_NOTIFS_MS,
} from '../circleNotifications';

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
/** `null` : serveur sans les routes rc9 (404). */
let liste: any[] | null = null;
let reglages: Record<string, boolean> = {};
let panne = false;

const NOTIF_PLAYLIST = {
  id: 17, kind: 'playlist_shared', read: false, at: '2026-10-26T20:00:00Z',
  actor: { user_id: 12, name: 'Alice' }, circle_name: 'Jazz du jeudi',
  playlist: { id: 9, name: 'Blue Note' }, conversation_id: null, invitation_id: null, count: 1,
};
const NOTIF_MESSAGE = {
  id: 18, kind: 'message', read: false, at: '2026-10-26T20:05:00Z',
  actor: { user_id: 13, name: 'Bruno' }, circle_name: null, playlist: null,
  conversation_id: 4, invitation_id: null, count: 3,
};
const NOTIF_CONTACT = {
  id: 19, kind: 'contact_accepted', read: true, at: '2026-10-25T10:00:00Z',
  actor: { user_id: 14, name: 'Chloé' }, circle_name: null, playlist: null,
  conversation_id: null, invitation_id: null, count: 1,
};

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

const nonLues = () => (liste ?? []).filter((n) => !n.read).length;

function cloud(chemin: string, method: string, body: any): Response {
  if (method === 'GET' && chemin === '') {
    return reponse(200, { members: [{ user_id: 12, name: 'Alice', since: '2026-09-01T10:00:00Z' }], sent: [], received: [], circles: [] });
  }
  if (chemin.startsWith('/notifications')) {
    if (liste === null) return reponse(404, { error: 'not_found' });
    if (panne) return reponse(503, { connected: true, code: 'circle.cloud_unavailable', upstream_status: 500 });
    if (chemin === '/notifications' && method === 'GET') return reponse(200, { unread_count: nonLues(), notifications: liste });
    if (chemin === '/notifications/read-all' && method === 'POST') { liste = liste.map((n) => ({ ...n, read: true })); return reponse(200, { unread_count: 0 }); }
    const m = /^\/notifications\/(\d+)\/read$/.exec(chemin);
    if (m && method === 'POST') { liste = liste.map((n) => (n.id === Number(m[1]) ? { ...n, read: true } : n)); return reponse(200, { unread_count: nonLues() }); }
    if (chemin === '/notifications/preferences') {
      if (method === 'PUT') reglages = { ...reglages, ...body };
      return reponse(200, reglages);
    }
  }
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  liste = [NOTIF_PLAYLIST, NOTIF_MESSAGE, NOTIF_CONTACT];
  reglages = { playlist_shared: true, circle_invitation: true, message: true, contact: true };
  panne = false;
  notifsCercle.set({ relais: 'inconnu', nonLues: 0, liste: [] });
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
  arreterSuiviNotifications();
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
async function poser(composant: any = CircleV2): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const vers = (re: RegExp) => appels.filter((a) => re.test(a.url));

describe('Tune Circle rc9 — notifications : projection', () => {
  it('ne garde que les champs du contrat, et écarte ce qui est illisible', () => {
    const n = notifValide({ ...NOTIF_PLAYLIST, email: 'alice@example.test', body: 'TEXTE', seen_by: [3] });
    expect(n).toEqual(NOTIF_PLAYLIST);
    expect(Object.keys(n!).sort()).toEqual(Object.keys(NOTIF_PLAYLIST).sort());
    expect(notifValide({ ...NOTIF_PLAYLIST, kind: 'presence' })).toBeNull();
    expect(notifValide({ ...NOTIF_PLAYLIST, actor: { user_id: 'x', name: 'A' } })).toBeNull();
    expect(notifValide(null)).toBeNull();
    expect(notifValide({ ...NOTIF_MESSAGE, count: 500 })!.count).toBe(99);
  });
});

describe('Tune Circle rc9 — notifications : écran', () => {
  it('liste les notifications dans la langue, la non lue en avant, sans rien du message', async () => {
    const el = await poser();
    const bloc = el.querySelector('.notifs-cercle');
    expect(bloc).not.toBeNull();
    const lignes = [...el.querySelectorAll('.notif')];
    expect(lignes.map((l) => texte(l.querySelector('.notif-texte')))).toEqual([
      'Alice a partagé la playlist « Blue Note » dans « Jazz du jeudi »',
      '3 nouveaux messages de Bruno',
      'Chloé a accepté votre invitation',
    ]);
    expect(lignes.map((l) => l.classList.contains('non-lue'))).toEqual([true, true, false]);
    expect(texte(bloc!.querySelector('.notifs-compte'))).toBe('2 non lues');
  });

  it('lire une notification part sans corps, met à jour le compteur et ouvre la playlist', async () => {
    const el = await poser();
    (el.querySelector('.notif[data-genre="playlist_shared"] .notif-ligne') as HTMLButtonElement).click();
    await laisserFaire();
    const lus = vers(/\/notifications\/17\/read$/);
    expect(lus.map((a) => [a.method, a.body])).toEqual([['POST', undefined]]);
    expect(get(notifsCercle).nonLues).toBe(1);
    // La vue de la playlist s'ouvre : elle lit la playlist désignée.
    expect(vers(/\/ext\/circle\/playlists\/9$/).length).toBeGreaterThan(0);
  });

  it('« Tout marquer comme lu » vide la pastille', async () => {
    const el = await poser();
    (el.querySelector('.tout-lu') as HTMLButtonElement).click();
    await laisserFaire();
    expect(vers(/\/notifications\/read-all$/).map((a) => [a.method, a.body])).toEqual([['POST', undefined]]);
    expect(get(notifsCercle).nonLues).toBe(0);
    expect(el.querySelectorAll('.notif.non-lue')).toHaveLength(0);
    expect(el.querySelector('.tout-lu')).toBeNull();
  });

  it('un interrupteur par type ; seul le type basculé part', async () => {
    const el = await poser();
    (el.querySelector('.notifs-reglages-bascule') as HTMLButtonElement).click();
    await laisserFaire();
    const inter = [...el.querySelectorAll('.interrupteur-notif')] as HTMLButtonElement[];
    expect(inter.map((b) => b.dataset.type)).toEqual(['playlist_shared', 'circle_invitation', 'message', 'contact']);
    expect(inter.every((b) => b.getAttribute('aria-checked') === 'true')).toBe(true);
    expect(texte(el.querySelector('.notifs-reglages'))).toContain('ni e-mail, ni notification sur le téléphone');

    inter[2].click();
    await laisserFaire();
    expect(vers(/\/notifications\/preferences$/).filter((a) => a.method === 'PUT').map((a) => a.body)).toEqual([{ message: false }]);
    expect((el.querySelector('.interrupteur-notif[data-type="message"]') as HTMLElement).getAttribute('aria-checked')).toBe('false');
  });

  it('serveur sans les routes (404) : aucune section, l’écran reste celui d’avant', async () => {
    liste = null;
    const el = await poser();
    expect(el.querySelector('.notifs-cercle')).toBeNull();
    expect(el.querySelector('.v2-circle .intro')).not.toBeNull();
    expect(get(notifsCercle).relais).toBe('absent');
  });

  it('cloud en panne : la phrase d’erreur, la dernière liste reste', async () => {
    const el = await poser();
    panne = true;
    await relireNotifications();
    await laisserFaire();
    expect(el.querySelector('.notifs-cercle [role="alert"]')).not.toBeNull();
    expect(el.querySelectorAll('.notif')).toHaveLength(3);
  });
});

describe('Tune Circle rc9 — pastille et suivi espacé', () => {
  it('la pastille montre les non-lues, et rien à zéro ou sans les routes', async () => {
    notifsCercle.set({ relais: 'ok', nonLues: 4, liste: [] });
    const el = await poser(PastilleNotifsCercle);
    expect(texte(el.querySelector('.pastille-notifs'))).toBe('4');
    expect(el.querySelector('.pastille-notifs')!.getAttribute('aria-label')).toBe('4 non lues');
    notifsCercle.set({ relais: 'ok', nonLues: 120, liste: [] }); flushSync();
    expect(texte(el.querySelector('.pastille-notifs'))).toBe('99+');
    notifsCercle.set({ relais: 'ok', nonLues: 0, liste: [] }); flushSync();
    expect(el.querySelector('.pastille-notifs')).toBeNull();
    notifsCercle.set({ relais: 'absent', nonLues: 3, liste: [] }); flushSync();
    expect(el.querySelector('.pastille-notifs')).toBeNull();
  });

  it('relit toutes les minutes onglet visible, pas onglet caché, et au retour sur l’onglet', async () => {
    let cache = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => cache });
    demarrerSuiviNotifications();
    await laisserFaire();
    const lectures = () => vers(/\/notifications$/).length;
    expect(lectures()).toBe(1);
    await vi.advanceTimersByTimeAsync(INTERVALLE_NOTIFS_MS);
    expect(lectures()).toBe(2);
    cache = true;
    await vi.advanceTimersByTimeAsync(INTERVALLE_NOTIFS_MS * 3);
    expect(lectures()).toBe(2);
    cache = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await laisserFaire();
    expect(lectures()).toBe(3);
    expect(vers(/presence|online|seen/)).toHaveLength(0);
  });

  it('serveur sans les routes : une seule lecture, puis plus rien', async () => {
    liste = null;
    demarrerSuiviNotifications();
    await laisserFaire();
    await vi.advanceTimersByTimeAsync(INTERVALLE_NOTIFS_MS * 5);
    expect(vers(/\/notifications/)).toHaveLength(1);
  });
});
