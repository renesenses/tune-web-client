// @vitest-environment jsdom
//
// Tune Circle (renesenses/tune-server-rust#6935) : « Bloquer » l'auteur d'une
// invitation reçue, avec une confirmation DANS la page, et la liste repliée
// « Personnes bloquées » avec « Débloquer ». Le faux greffon suit le contrat
// de site-mozaiklabs#353 relayé par tune-server-rust#6950, sous
// `/api/v1/ext/circle`.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin, lirePersonnesBloquees } from '../circle';
import fr from '../locales/fr';

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];
let avant6935 = false;
let recues: Array<{ id: number; name_or_email: string; created_at: string; expires_at: string }> = [];
let bloquees: Array<{ user_id: number; name: string; since: string }> = [];
let refusBlocage: { status: number; corps: unknown } | null = null;

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}

function greffon(chemin: string, method: string): Response {
  if (method === 'GET' && chemin === '') {
    return reponse(200, { members: [], sent: [], received: recues, circles: [] });
  }
  if (chemin === '/invitation-links' && method === 'GET') return reponse(200, { links: [] });
  if (chemin === '/blocks' && method === 'GET') {
    if (avant6935) return reponse(404, { message: 'Not Found' });
    return reponse(200, { blocks: bloquees });
  }
  const b = chemin.match(/^\/invitations\/(\d+)\/block$/);
  if (b && method === 'POST') {
    if (avant6935) return reponse(404, { message: 'Not Found' });
    if (refusBlocage) return reponse(refusBlocage.status, refusBlocage.corps);
    const id = Number(b[1]);
    const inv = recues.find((r) => r.id === id);
    if (!inv) return reponse(404, { error: 'not_found' });
    recues = recues.filter((r) => r.id !== id);
    bloquees = [...bloquees, { user_id: 42, name: inv.name_or_email, since: '2026-10-24T12:00:00Z' }];
    return reponse(200, { ok: true });
  }
  const d = chemin.match(/^\/blocks\/(\d+)$/);
  if (d && method === 'DELETE') {
    const avant = bloquees.length;
    bloquees = bloquees.filter((x) => x.user_id !== Number(d[1]));
    return bloquees.length < avant ? reponse(200, { ok: true }) : reponse(404, { error: 'not_found' });
  }
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = []; avant6935 = false; refusBlocage = null; bloquees = [];
  recues = [{ id: 5, name_or_email: 'Bob', created_at: '2026-10-20T12:00:00Z', expires_at: '2026-11-19T12:00:00Z' }];
  circlePlugin.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/ext/circle')) return greffon(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''), method);
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
const avec = (cle: keyof typeof fr, nom: string) => (fr[cle] as string).split('{name}').join(nom);
async function cliquer(el: Element, sel: string) {
  (el.querySelector(sel) as HTMLButtonElement).click();
  await laisserFaire();
}

describe('#6935 — « Bloquer » une invitation reçue', () => {
  it('serveur ou cloud d\'avant #6935 (404 sur /blocks) : ni « Bloquer » ni liste, Accepter/Refuser restent', async () => {
    avant6935 = true;
    const el = await poser();
    const ligne = el.querySelector('.invitation-recue')!;
    expect(ligne).not.toBeNull();
    expect(ligne.querySelector('button.accepter')).not.toBeNull();
    expect(ligne.querySelector('button.refuser')).not.toBeNull();
    expect(el.querySelector('button.bloquer')).toBeNull();
    expect(el.querySelector('.bloquees')).toBeNull();
  });

  it('« Bloquer » est un vrai bouton à côté de « Refuser », nommé pour la personne', async () => {
    const el = await poser();
    const b = el.querySelector('.invitation-recue .gestes button.bloquer') as HTMLButtonElement;
    expect(b).not.toBeNull();
    expect(b.tagName).toBe('BUTTON');
    expect(texte(b)).toBe(fr['v2.circle.block.action']);
    expect(b.getAttribute('aria-label')).toBe(avec('v2.circle.block.named', 'Bob'));
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });

  it('la confirmation est dans la page, dit que la personne ne sera pas prévenue ; « Annuler » n\'envoie rien', async () => {
    const confirmer = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmer);
    const el = await poser();
    await cliquer(el, 'button.bloquer');
    expect(confirmer).not.toHaveBeenCalled();
    const boite = el.querySelector('.confirmer-blocage')!;
    expect(boite.getAttribute('role')).toBe('group');
    expect(texte(boite.querySelector('p'))).toBe(avec('v2.circle.block.confirm', 'Bob'));
    expect(document.activeElement).toBe(boite.querySelector('button.confirmer-bloquer'));
    expect(el.querySelector('button.bloquer')!.getAttribute('aria-expanded')).toBe('true');

    await cliquer(el, 'button.annuler-bloquer');
    expect(el.querySelector('.confirmer-blocage')).toBeNull();
    expect(vers(/\/block$/, 'POST')).toHaveLength(0);
    expect(document.activeElement).toBe(el.querySelector('button.bloquer'));
  });

  it('confirmé : POST /invitations/{id}/block sans corps, annonce aria-live, la personne passe dans la liste repliée', async () => {
    const el = await poser();
    await cliquer(el, 'button.bloquer');
    await cliquer(el, 'button.confirmer-bloquer');
    const posts = vers(/\/ext\/circle\/invitations\/5\/block$/, 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toBeUndefined();
    const annonce = el.querySelector('.annonce-blocage')!;
    expect(annonce.getAttribute('aria-live')).toBe('polite');
    expect(texte(annonce)).toBe(avec('v2.circle.block.done', 'Bob'));
    expect(el.querySelector('.invitation-recue')).toBeNull();

    const liste = el.querySelector('details.bloquees') as HTMLDetailsElement;
    expect(liste).not.toBeNull();
    expect(liste.open).toBe(false);
    expect(texte(liste.querySelector('summary'))).toBe(fr['v2.circle.block.list'].replace('{n}', '1'));
    expect(texte(liste.querySelector('.personne-bloquee .nom'))).toBe('Bob');
  });

  it('un refus du cloud se dit, la ligne reste', async () => {
    const el = await poser();
    refusBlocage = { status: 404, corps: { error: 'not_found' } };
    await cliquer(el, 'button.bloquer');
    await cliquer(el, 'button.confirmer-bloquer');
    expect(texte(el.querySelector('.err.retour'))).toBe(fr['v2.circle.err.notFound']);
    expect(texte(el.querySelector('.annonce-blocage'))).toBe('');
    expect(el.querySelector('.invitation-recue')).not.toBeNull();
  });
});

describe('#6935 — « Personnes bloquées »', () => {
  it('aucune personne bloquée : la liste ne s\'affiche pas', async () => {
    const el = await poser();
    expect(el.querySelector('.bloquees')).toBeNull();
  });

  it('« Débloquer » : DELETE /blocks/{user_id}, annonce, la liste se vide', async () => {
    recues = [];
    bloquees = [{ user_id: 42, name: 'Bob', since: '2026-10-01T08:00:00Z' }];
    const el = await poser();
    const b = el.querySelector('details.bloquees button.debloquer') as HTMLButtonElement;
    expect(texte(b)).toBe(fr['v2.circle.block.unblock']);
    expect(b.getAttribute('aria-label')).toBe(avec('v2.circle.block.unblockNamed', 'Bob'));
    await cliquer(el, 'button.debloquer');
    expect(vers(/\/ext\/circle\/blocks\/42$/, 'DELETE')).toHaveLength(1);
    expect(texte(el.querySelector('.annonce-blocage'))).toBe(avec('v2.circle.block.undone', 'Bob'));
    expect(el.querySelector('.bloquees')).toBeNull();
  });
});

describe('#6935 — lecture de GET /blocks', () => {
  it('ne garde que les lignes bien formées', () => {
    expect(lirePersonnesBloquees({ blocks: [
      { user_id: 1, name: 'A', since: '2026-10-01T00:00:00Z' },
      { user_id: '2', name: 'B', since: 'x' },
      null,
      { user_id: 3, since: 'x' },
    ] })).toEqual([{ user_id: 1, name: 'A', since: '2026-10-01T00:00:00Z' }]);
    expect(lirePersonnesBloquees(null)).toEqual([]);
    expect(lirePersonnesBloquees({ blocks: 'non' })).toEqual([]);
  });
});
