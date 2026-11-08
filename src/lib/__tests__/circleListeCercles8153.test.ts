// @vitest-environment jsdom
//
// tune-server-rust#8153 : la liste des cercles montre mes cercles, les cercles
// dont je suis membre (« Cercle de {propriétaire} ») et les invitations en
// attente (Accepter, Refuser). Scénario : A crée un cercle et invite B ; B voit
// l'invitation, l'accepte, puis voit le cercle et peut y écrire.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import { demandeConversation, messagerieSupport } from '../circleMessagerie';
import fr from '../locales/fr';

type Appel = { url: string; method: string };
let appels: Appel[] = [];

/** Le cloud de B : une invitation d'Alice, qui range B dans « Famille » à l'acceptation. */
let invitationEnAttente = true;
let accepte = false;
let mesCercles: unknown[] = [];

const rep = (status: number, corps?: unknown): Response => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => corps, text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
}) as unknown as Response;

function cloud(chemin: string, method: string): Response {
  if (method === 'GET' && chemin === '') {
    const e: Record<string, unknown> = {
      members: accepte ? [{ user_id: 1, name: 'Alice', since: '2026-11-08T10:00:00Z' }] : [],
      sent: [],
      received: invitationEnAttente
        ? [{ id: 41, name_or_email: 'Alice', created_at: '2026-11-08T09:00:00Z', expires_at: '2026-12-08T09:00:00Z' }]
        : [],
    };
    if (mesCercles.length > 0) e.circles = mesCercles;
    if (accepte) e.member_of = [{ circle_id: 12, owner_id: 1, owner_name: 'Alice', circle_name: 'Famille' }];
    return rep(200, e);
  }
  if (method === 'POST' && chemin === '/invitations/41/accept') {
    invitationEnAttente = false; accepte = true;
    return rep(200, { user_id: 1, name: 'Alice', since: '2026-11-08T10:00:00Z' });
  }
  if (method === 'POST' && chemin === '/invitations/41/decline') {
    invitationEnAttente = false;
    return rep(200, { ok: true });
  }
  // La messagerie est là : sinon l'écran cache « Écrire au cercle » (404).
  if (chemin === '/conversations') return rep(200, { conversations: [] });
  if (chemin === '/library-sync') return rep(200, { last_sync: null });
  if (chemin === '/shared-with-me') return rep(200, []);
  if (chemin === '/playlists') return rep(200, []);
  if (chemin === '/recoverable-playlists') return rep(200, []);
  if (chemin === '/blocks') return rep(200, []);
  return rep(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  vi.useFakeTimers();
  appels = []; invitationEnAttente = true; accepte = false; mesCercles = [];
  circlePlugin.set(null);
  demandeConversation.set(null);
  messagerieSupport.set(true);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: u, method });
    if (u.includes('/ext/circle')) return cloud(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''), method);
    if (u.endsWith('/plugins')) return rep(200, [{ name: 'circle', installed: true, enabled: true }]);
    return rep(200, {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  messagerieSupport.set(null); demandeConversation.set(null);
  vi.unstubAllGlobals(); vi.useRealTimers();
});
async function laisserFaire() { for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); } }
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(CircleV2 as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const liste = (el: HTMLElement) => el.querySelector('section.cercles') as HTMLElement;

describe('#8153 : la liste des cercles', () => {
  it('B voit l\'invitation d\'Alice dans la liste des cercles, l\'accepte, puis voit « Famille » et peut y écrire', async () => {
    const el = await poser();
    const avant = liste(el);
    expect(avant).not.toBeNull();
    // L'invitation en attente est dans la liste des cercles, avec Accepter et Refuser.
    const inv = avant.querySelector('.recues li.invitation-recue');
    expect(inv).not.toBeNull();
    expect(texte(avant.querySelector('.recues h3'))).toBe(fr['v2.circle.received']);
    expect(texte(inv!.querySelector('.nom'))).toBe('Alice');
    expect(inv!.querySelector('button.accepter')).not.toBeNull();
    expect(inv!.querySelector('button.refuser')).not.toBeNull();
    // Pas encore membre : aucun cercle d'Alice, ni son nom de cercle.
    expect(avant.querySelector('.cercle-membre')).toBeNull();
    expect(texte(el)).not.toContain('Famille');

    (inv!.querySelector('button.accepter') as HTMLButtonElement).click();
    await laisserFaire();
    expect(appels.some((a) => a.method === 'POST' && a.url.endsWith('/ext/circle/invitations/41/accept'))).toBe(true);

    const apres = liste(el);
    expect(apres.querySelector('li.invitation-recue')).toBeNull();
    const c = apres.querySelector('.cercles-invite article.cercle-membre');
    expect(c).not.toBeNull();
    expect(texte(c!.querySelector('.cercle-nom'))).toBe('Famille');
    expect(texte(c!.querySelector('.cercle-de'))).toBe('Cercle de Alice');
    // Ce n'est pas MON cercle : ni renommer, ni supprimer.
    expect(c!.querySelector('.renommer')).toBeNull();
    expect(c!.querySelector('.supprimer')).toBeNull();
    // « Écrire au cercle » ouvre la conversation de CE cercle.
    const ecrire = c!.querySelector('button.ecrire-au-cercle') as HTMLButtonElement;
    expect(texte(ecrire)).toBe(fr['v2.circle.msg.writeToCircle']);
    ecrire.click();
    expect(get(demandeConversation)).toEqual({ cercle: 12 });
  });

  it('mes cercles, ceux dont je suis membre et les invitations sont dans la même section, dans cet ordre', async () => {
    mesCercles = [{ id: 5, name: 'Jazz', member_ids: [] }];
    accepte = true; // membre de « Famille »…
    invitationEnAttente = true; // …et une invitation encore en attente.
    const el = await poser();
    const s = liste(el);
    const mien = s.querySelector('article.cercle');
    const membre = s.querySelector('article.cercle-membre');
    const invitation = s.querySelector('li.invitation-recue');
    expect(texte(mien!.querySelector('.cercle-nom'))).toBe('Jazz');
    expect(mien!.querySelector('.renommer')).not.toBeNull();
    expect(texte(membre!.querySelector('.cercle-nom'))).toBe('Famille');
    expect(invitation).not.toBeNull();
    expect(mien!.compareDocumentPosition(membre!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(membre!.compareDocumentPosition(invitation!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Plus de section séparée hors de la liste.
    expect(el.querySelectorAll('.cercles-invite')).toHaveLength(1);
    expect(el.querySelectorAll('.recues')).toHaveLength(1);
  });

  it('refuser : l\'invitation quitte la liste, aucun cercle n\'apparaît', async () => {
    const el = await poser();
    (liste(el).querySelector('li.invitation-recue button.refuser') as HTMLButtonElement).click();
    await laisserFaire();
    expect(appels.some((a) => a.method === 'POST' && a.url.endsWith('/ext/circle/invitations/41/decline'))).toBe(true);
    expect(liste(el).querySelector('li.invitation-recue')).toBeNull();
    expect(liste(el).querySelector('.cercle-membre')).toBeNull();
  });
});
