// @vitest-environment jsdom
//
// Tune Circle (renesenses/tune-server-rust#6935) : dans le bloc « Inviter »,
// à côté de l'e-mail — inviter un membre du forum par son pseudo exact, et
// créer, copier, lister, révoquer un lien d'invitation à usage unique.
// Le faux greffon suit le contrat, sous `/api/v1/ext/circle`.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import fr from '../locales/fr';

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let avant6935 = false;
let liens: Array<{ id: number; circle_id: number | null; created_at: string; expires_at: string }> = [];
let refusPseudo: { status: number; corps: unknown } | null = null;
let refusLien: { status: number; corps: unknown } | null = null;
const URL_LIEN = 'https://mozaiklabs.fr/circle/rejoindre/0123456789abcdef0123456789abcdef0123456789abcdef';

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

function greffon(chemin: string, method: string, body: any): Response {
  if (method === 'GET' && chemin === '') {
    return reponse(200, { members: [], sent: [], received: [], circles: [{ id: 7, name: 'Famille', member_ids: [] }] });
  }
  if (chemin === '/invitation-links') {
    if (avant6935) return reponse(404, { message: 'Not Found' });
    if (method === 'GET') return reponse(200, { links: liens });
    if (refusLien) return reponse(refusLien.status, refusLien.corps);
    const l = { id: 31, circle_id: body?.circle_id ?? null, created_at: '2026-10-24T12:00:00Z', expires_at: '2026-10-31T12:00:00Z' };
    liens = [l];
    return reponse(201, { ...l, url: URL_LIEN });
  }
  if (chemin === '/invitation-links/31' && method === 'DELETE') { liens = []; return reponse(200, { ok: true }); }
  if (chemin === '/invitations/by-pseudo' && method === 'POST') {
    if (refusPseudo) return reponse(refusPseudo.status, refusPseudo.corps);
    return reponse(201, { id: 5, name_or_email: body.pseudo, created_at: '2026-10-24T12:00:00Z', expires_at: '2026-11-23T12:00:00Z' });
  }
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = []; avant6935 = false; liens = []; refusPseudo = null; refusLien = null;
  circlePlugin.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/ext/circle')) return greffon(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''), method, body);
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
const vers = (re: RegExp, m?: string) => appels.filter((a) => re.test(a.url) && (!m || a.method === m));
async function saisir(el: Element, sel: string, v: string) {
  const c = el.querySelector(sel) as HTMLInputElement;
  c.value = v;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  await laisserFaire();
}
async function envoyerPseudo(el: Element, p: string) {
  await saisir(el, 'input.pseudo-saisi', p);
  (el.querySelector('form.pseudo') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await laisserFaire();
}

describe('#6935 — dans le bloc « Inviter »', () => {
  it('serveur ou cloud d\'avant #6935 (404) : rien ne s\'affiche, l\'e-mail reste', async () => {
    avant6935 = true;
    const el = await poser();
    expect(el.querySelector('.sans-email')).toBeNull();
    expect(el.querySelector('.bloc.inviter input.email')).not.toBeNull();
  });

  it('les deux gestes sont dans le bloc « Inviter », à côté de l\'e-mail', async () => {
    const el = await poser();
    const bloc = el.querySelector('.bloc.inviter')!;
    expect(bloc.querySelector('input.pseudo-saisi')).not.toBeNull();
    expect(texte(bloc.querySelector('button.creer-lien'))).toBe(fr['v2.circle.link.create']);
  });
});

describe('#6935 — inviter un membre du forum', () => {
  it('le pseudo saisi part tel quel, sans recherche, et le message ne dit pas s\'il existe', async () => {
    const el = await poser();
    expect(vers(/by-pseudo|search|users/, 'GET')).toHaveLength(0);
    await envoyerPseudo(el, '  Bob Marley ');
    const posts = vers(/\/invitations\/by-pseudo$/, 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ pseudo: 'Bob Marley' });
    expect(texte(el.querySelector('.retour-pseudo'))).toBe(fr['v2.circle.invited']);
    expect((el.querySelector('input.pseudo-saisi') as HTMLInputElement).value).toBe('');
    // Aucune requête de lecture n'a été faite pendant la saisie.
    expect(appels.filter((a) => /pseudo/i.test(a.url) && a.method === 'GET')).toHaveLength(0);
  });

  it('le cercle choisi dans le bloc part avec l\'invitation', async () => {
    const el = await poser();
    const sel = el.querySelector('select.ranger-dans') as HTMLSelectElement;
    sel.value = '7';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await laisserFaire();
    await envoyerPseudo(el, 'Zoé');
    expect(vers(/\/invitations\/by-pseudo$/, 'POST')[0].body).toEqual({ pseudo: 'Zoé', circle_id: 7 });
  });

  it('un refus du cloud se dit dans la langue de l\'écran', async () => {
    const el = await poser();
    refusPseudo = { status: 409, corps: { error: 'already_invited' } };
    await envoyerPseudo(el, 'Bob');
    expect(texte(el.querySelector('.retour-pseudo.err'))).toBe(fr['v2.circle.err.alreadyInvited']);
    refusPseudo = { status: 422, corps: { message: 'x', errors: { pseudo: ['x'] } } };
    await envoyerPseudo(el, 'Bob');
    expect(texte(el.querySelector('.retour-pseudo.err'))).toBe(fr['v2.circle.pseudo.err.invalid']);
  });
});

describe('#6935 — lien d\'invitation à usage unique', () => {
  it('créer, copier, voir le lien actif, révoquer', async () => {
    const ecrit = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: ecrit } });
    vi.stubGlobal('isSecureContext', true);
    const el = await poser();
    expect(el.querySelector('.lien-actif')).toBeNull();

    (el.querySelector('button.creer-lien') as HTMLButtonElement).click();
    await laisserFaire();
    expect(vers(/\/invitation-links$/, 'POST')[0].body).toEqual({});
    expect((el.querySelector('input.url-lien') as HTMLInputElement).value).toBe(URL_LIEN);
    expect(texte(el.querySelector('.sans-email'))).toContain(fr['v2.circle.link.onceOnly']);
    expect(el.querySelectorAll('.lien-actif')).toHaveLength(1);

    (el.querySelector('button.copier-lien') as HTMLButtonElement).click();
    await laisserFaire();
    expect(ecrit).toHaveBeenCalledWith(URL_LIEN);
    expect(texte(el.querySelector('button.copier-lien'))).toBe(fr['v2.circle.link.copied']);

    (el.querySelector('button.revoquer-lien') as HTMLButtonElement).click();
    await laisserFaire();
    expect(vers(/\/invitation-links\/31$/, 'DELETE')).toHaveLength(1);
    expect(el.querySelector('.lien-actif')).toBeNull();
    // L'URL révoquée n'est plus montrée.
    expect(el.querySelector('input.url-lien')).toBeNull();
    expect(texte(el.querySelector('.retour-lien'))).toBe(fr['v2.circle.link.revoked']);
  });

  it('dix liens actifs : le refus se dit, aucune URL n\'apparaît', async () => {
    const el = await poser();
    refusLien = { status: 409, corps: { error: 'too_many_links' } };
    (el.querySelector('button.creer-lien') as HTMLButtonElement).click();
    await laisserFaire();
    expect(texte(el.querySelector('.retour-lien.err'))).toBe(fr['v2.circle.link.err.tooMany']);
    expect(el.querySelector('input.url-lien')).toBeNull();
  });
});
