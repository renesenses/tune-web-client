// @vitest-environment jsdom
//
// Tune Circle (#2434, décision de Bertrand du 26/10/2026) : un cercle est un
// vrai groupe. L'invité voit « Cercles où je suis invité » (nom de l'inviteur
// et du cercle) et y partage une playlist ; l'inviteur est prévenu que ses
// membres voient le nom du cercle. Cloud ou serveur plus ancien (pas de
// `member_of`) : aucune section.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { circlePlugin, cerclesOuJeSuisInvite } from '../circle';
import { playlistCercle } from '../circlePlaylists';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';

type Appel = { url: string; method: string; body: any };
let appels: Appel[] = [];
let memberOf: unknown = undefined;
let playlists: unknown[] = [];

const rep = (status: number, corps?: unknown): Response => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => corps, text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
}) as unknown as Response;

function cloud(chemin: string, method: string, body: any): Response {
  if (method === 'GET' && chemin === '') {
    const e: Record<string, unknown> = { members: [{ user_id: 7, name: 'Bertrand', since: '2026-09-01T10:00:00Z' }], sent: [], received: [] };
    if (memberOf !== undefined) e.member_of = memberOf;
    return rep(200, e);
  }
  if (chemin === '/library-sync') return rep(200, { last_sync: null });
  if (chemin === '/shared-with-me') return rep(200, []);
  if (chemin === '/playlists' && method === 'GET') return rep(200, playlists);
  if (chemin === '/playlists' && method === 'POST') return rep(201, { id: 99, name: body?.name, version: 1, mine: true, items: [] });
  if (chemin === '/recoverable-playlists') return rep(200, []);
  if (chemin === '/blocks') return rep(200, []);
  return rep(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  vi.useFakeTimers();
  appels = []; memberOf = undefined; playlists = [];
  circlePlugin.set(null);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url: u, method, body });
    if (u.includes('/ext/circle')) return cloud(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''), method, body);
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

const MEMBRE = { circle_id: 3, owner_id: 7, owner_name: 'Bertrand', circle_name: 'Bêta-testeurs' };

describe('lecture défensive de member_of', () => {
  it('garde les entrées complètes, ignore le reste', () => {
    const e: any = { members: [], sent: [], received: [], member_of: [MEMBRE, { circle_id: 4 }, null, { ...MEMBRE, circle_name: '' }, 'x'] };
    expect(cerclesOuJeSuisInvite(e)).toEqual([MEMBRE]);
    // Contre-épreuve : pas de clé, ou pas un tableau.
    expect(cerclesOuJeSuisInvite({ members: [], sent: [], received: [] })).toEqual([]);
    expect(cerclesOuJeSuisInvite({ members: [], sent: [], received: [], member_of: {} } as any)).toEqual([]);
    expect(cerclesOuJeSuisInvite(null)).toEqual([]);
  });

  it('une playlist partagée : can_remove, circle_name et circle_owner_id sont lus ; sans can_remove, seul `mine` compte', () => {
    const base = { id: 1, name: 'n', version: 1, items: [] };
    expect(playlistCercle({ ...base, mine: false, can_remove: true })!.can_remove).toBe(true);
    expect(playlistCercle({ ...base, mine: false })!.can_remove).toBe(false);
    expect(playlistCercle({ ...base, mine: true })!.can_remove).toBe(true);
  });
});

describe('écran : Cercles où je suis invité', () => {
  it('la section dit le cercle et son inviteur', async () => {
    memberOf = [MEMBRE];
    const el = await poser();
    const s = el.querySelector('.cercles-invite');
    expect(s).not.toBeNull();
    expect(texte(s!.querySelector('h2'))).toBe(fr['v2.circle.memberOf.title']);
    expect(texte(s!.querySelector('.cercle-invite'))).toContain('Bêta-testeurs');
    expect(texte(s!.querySelector('.cercle-invite'))).toContain('Invité par Bertrand');
    // Ce n'est pas MON cercle : aucun article de gestion pour lui.
    expect(el.querySelector('article.cercle')).toBeNull();
  });

  it('contre-épreuve : pas de member_of (cloud plus ancien) ou liste vide : aucune section', async () => {
    let el = await poser();
    expect(el.querySelector('.cercles-invite')).toBeNull();
    unmount(monte!); monte = null; el.remove(); hote = null;
    memberOf = [];
    el = await poser();
    expect(el.querySelector('.cercles-invite')).toBeNull();
  });

  it('partager une playlist ici : POST /playlists avec le circle_id du cercle de l\'inviteur, et le texte dit qui la verra', async () => {
    memberOf = [MEMBRE];
    const el = await poser();
    (el.querySelector('.partager-ici') as HTMLButtonElement).click();
    await laisserFaire();
    const d = get(dialogs)[0];
    expect(d.message).toContain(fr['v2.circle.memberOf.shareNote']);
    dialogs.settle(d.id, 'Mes trouvailles');
    await laisserFaire();
    const posts = appels.filter((a) => a.method === 'POST' && /\/playlists$/.test(a.url));
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ circle_id: 3, name: 'Mes trouvailles' });
  });

  it('une playlist d\'un autre membre porte le nom du cercle et celui du partageur', async () => {
    memberOf = [MEMBRE];
    playlists = [{ id: 8, name: 'Pépites', owner: { user_id: 9, name: 'Yves' }, mine: false, can_remove: false,
      count: 2, version: 1, updated_at: '2026-10-26T18:00:00Z', circle_id: null, circle_name: 'Bêta-testeurs', circle_owner_id: 7 }];
    const el = await poser();
    const ligne = texte(el.querySelector('.playlist-cercle'));
    expect(ligne).toContain('Pépites');
    expect(ligne).toContain('Yves');
    expect(ligne).toContain('Bêta-testeurs');
  });
});

describe('texte d\'aide côté propriétaire', () => {
  it('le champ de nom dit que les membres voient le nom du cercle, et l\'aide que les autres y partagent', async () => {
    const el = await poser();
    expect(texte(el.querySelector('.nom-visible'))).toBe('Les membres que vous y rangez voient le nom de ce cercle.');
    expect(fr['v2.circle.circlesHint']).toContain('ce que les autres y partagent');
    expect(fr['v2.circle.circlesHint']).not.toContain('classements privés');
  });

  it('les 15 langues portent les 8 clés, et plus l\'ancienne promesse « privé »', async () => {
    const langues = import.meta.glob('../locales/*.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;
    const cles = ['v2.circle.circlesHint', 'v2.circle.newCircleHint', 'v2.circle.memberOf.title', 'v2.circle.memberOf.hint',
      'v2.circle.memberOf.by', 'v2.circle.memberOf.share', 'v2.circle.memberOf.shareNamed', 'v2.circle.memberOf.shareNote'];
    const fichiers = Object.entries(langues).filter(([p]) => !p.endsWith('/index.ts'));
    expect(fichiers).toHaveLength(15);
    for (const [p, m] of fichiers) {
      for (const k of cles) expect(m.default[k], `${p} ${k}`).toBeTruthy();
      expect(m.default['v2.circle.memberOf.by'], p).toContain('{name}');
      expect(m.default['v2.circle.memberOf.shareNamed'], p).toContain('{circle}');
    }
    // Contre-épreuve : l'ancienne phrase a disparu de l'anglais et de l'allemand.
    expect(en['v2.circle.circlesHint']).not.toContain('private groupings');
    expect(de['v2.circle.circlesHint']).not.toContain('private Einteilungen');
  });
});
