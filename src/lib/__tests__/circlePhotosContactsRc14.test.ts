// @vitest-environment jsdom
//
// Tune Circle rc14 — les photos de profil des contacts dans la grille des membres.
// Contrat du cloud : chaque objet de `members` porte `avatar_url: string | null`,
// URL https absolue d'une image carrée 512×512 (webp). Seule une URL `https:`
// valide entre dans le DOM ; sinon, ou si l'image échoue, les initiales.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin, photosContacts, urlAvatarSure, RELECTURE_CERCLE_MS } from '../circle';
import { demandeConversation, nonLusMessagerie } from '../circleMessagerie';

const PHOTO = 'https://mozaiklabs.fr/storage/avatars/12-512.webp';
const CASSEE = 'https://mozaiklabs.fr/storage/avatars/14-512.webp';
const SANS_EXTENSION = 'https://mozaiklabs.fr/avatars/abc';
const TROP_LONGUE = `https://mozaiklabs.fr/avatars/${'a'.repeat(2048)}.webp`;
/** Témoins de la relecture : identifiants, longueur, hôte hors liste blanche. */
const REFUSEES: [number, string, string, string][] = [
  [20, 'Gaston', 'G', 'https://u:p@mozaiklabs.fr/a'],
  [21, 'Hugo', 'H', TROP_LONGUE],
  [22, 'Inès', 'I', 'https://evil.example/x.webp'],
  [23, 'Jules', 'J', 'https://evilmozaiklabs.fr/x'],
];
let panne = false;

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}
function cloud(chemin: string): Response {
  if (chemin === '' && panne) return reponse(500, { error: 'server_error' });
  if (chemin === '') return reponse(200, {
    members: [
      { user_id: 12, name: 'Alice Martin', since: '2026-09-01T10:00:00Z', avatar_url: PHOTO },
      { user_id: 13, name: 'Bruno', since: '2026-09-01T10:00:00Z', avatar_url: null },
      { user_id: 14, name: 'Chloé Durand', since: '2026-09-01T10:00:00Z', avatar_url: CASSEE },
      { user_id: 15, name: 'Denis', since: '2026-09-01T10:00:00Z', avatar_url: 'javascript:void(0)' },
      { user_id: 16, name: 'Emma', since: '2026-09-01T10:00:00Z', avatar_url: 'http://mozaiklabs.fr/a.webp' },
      { user_id: 17, name: 'Fanny', since: '2026-09-01T10:00:00Z' },
      { user_id: 18, name: 'Karim', since: '2026-09-01T10:00:00Z', avatar_url: SANS_EXTENSION },
      ...REFUSEES.map(([user_id, name, , avatar_url]) => ({ user_id, name, since: '2026-09-01T10:00:00Z', avatar_url })),
    ],
    sent: [], received: [], circles: [],
  });
  if (chemin === '/me/location') return reponse(204);
  if (chemin === '/contacts/locations') return reponse(200, []);
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  vi.useFakeTimers();
  circlePlugin.set(null); demandeConversation.set(null); nonLusMessagerie.set(0); photosContacts.set(new Map()); panne = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/ext/circle')) return cloud(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''));
    if (u.endsWith('/plugins')) return reponse(200, [{ name: 'circle', installed: true, enabled: true }]);
    return reponse(200, {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals(); vi.useRealTimers();
});
async function laisserFaire() { for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); } }
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div'); document.body.appendChild(hote);
  monte = mount(CircleV2 as any, { target: hote }); flushSync(); await laisserFaire();
  return hote;
}
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
function carte(el: Element, nom: string): HTMLElement {
  const c = [...el.querySelectorAll('#circle-panneau-cercle ul.grille-membres li.carte-membre')]
    .find((li) => texte(li.querySelector('.nom')) === nom);
  expect(c, nom).toBeDefined();
  return c as HTMLElement;
}

describe('rc14 — photos de profil des contacts (grille des membres)', () => {
  it('avec `avatar_url` https : une img ronde, paresseuse, sans référent, à la bonne src', async () => {
    const el = await poser();
    const img = carte(el, 'Alice Martin').querySelector('.avatar-membre img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe(PHOTO);
    expect(img!.getAttribute('alt')).toBe('');
    expect(img!.getAttribute('loading')).toBe('lazy');
    expect(img!.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(texte(carte(el, 'Alice Martin').querySelector('.avatar-membre'))).toBe('');
  });

  it('sans `avatar_url` (null ou absente) : les initiales, aucune img', async () => {
    const el = await poser();
    for (const [nom, ini] of [['Bruno', 'B'], ['Fanny', 'F']]) {
      expect(carte(el, nom).querySelector('.avatar-membre img')).toBeNull();
      expect(texte(carte(el, nom).querySelector('.avatar-membre'))).toBe(ini);
    }
  });

  it('image en erreur : retour aux initiales', async () => {
    const el = await poser();
    const img = carte(el, 'Chloé Durand').querySelector('.avatar-membre img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(CASSEE);
    img.dispatchEvent(new Event('error'));
    flushSync();
    expect(carte(el, 'Chloé Durand').querySelector('.avatar-membre img')).toBeNull();
    expect(texte(carte(el, 'Chloé Durand').querySelector('.avatar-membre'))).toBe('CD');
  });

  it('`javascript:` ou `http:` : jamais dans le DOM, les initiales', async () => {
    const el = await poser();
    for (const [nom, ini] of [['Denis', 'D'], ['Emma', 'E']]) {
      expect(carte(el, nom).querySelector('img')).toBeNull();
      expect(texte(carte(el, nom).querySelector('.avatar-membre'))).toBe(ini);
    }
    expect(el.innerHTML).not.toContain('javascript:');
    expect(el.innerHTML).not.toContain('http://mozaiklabs.fr/a.webp');
  });

  it('la messagerie reçoit les seules photos sûres, par contact', async () => {
    await poser();
    expect([...get(photosContacts).entries()]).toEqual([[12, PHOTO], [14, CASSEE], [18, SANS_EXTENSION]]);
  });

  it('relecture : identifiants, plus de 2048 caractères, hôte hors mozaiklabs.fr → initiales, aucune img', async () => {
    const el = await poser();
    for (const [, nom, ini, url] of REFUSEES) {
      expect(carte(el, nom).querySelector('img'), nom).toBeNull();
      expect(texte(carte(el, nom).querySelector('.avatar-membre')), nom).toBe(ini);
      expect(el.innerHTML).not.toContain(url);
    }
    const img = carte(el, 'Karim').querySelector('.avatar-membre img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe(SANS_EXTENSION);
  });

  it('lecture en échec : la messagerie ne garde pas les photos précédentes', async () => {
    await poser();
    expect(get(photosContacts).size).toBeGreaterThan(0);
    panne = true;
    await vi.advanceTimersByTimeAsync(RELECTURE_CERCLE_MS + 10); await laisserFaire();
    expect(get(photosContacts).size).toBe(0);
  });

  it('urlAvatarSure : https valide seulement', () => {
    expect(urlAvatarSure(PHOTO)).toBe(PHOTO);
    expect(urlAvatarSure(SANS_EXTENSION)).toBe(SANS_EXTENSION);
    expect(urlAvatarSure('https://cdn.MozaikLabs.fr/a.webp')).toBe('https://cdn.mozaiklabs.fr/a.webp');
    for (const [, , , url] of REFUSEES) expect(urlAvatarSure(url), url.slice(0, 60)).toBeNull();
    expect(urlAvatarSure('https://mozaiklabs.fr.evil.example/a.webp')).toBeNull();
    expect(urlAvatarSure('https://u@mozaiklabs.fr/a')).toBeNull();
    for (const v of ['javascript:void(0)', 'http://x.fr/a.webp', 'data:image/webp;base64,AAAA', '/storage/a.webp', '//x.fr/a.webp', 'https://', '', null, undefined, 42]) {
      expect(urlAvatarSure(v), String(v)).toBeNull();
    }
  });
});
