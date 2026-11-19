// @vitest-environment jsdom
//
// Tune Circle #3283 (site-mozaiklabs#568, go de Bertrand du 19/11/2026) : le
// cercle partagé. Le propriétaire partage un cercle entre ses membres ; chaque
// membre choisit « Me montrer aux autres membres de « X » » (faux par défaut).
// Le globe ajoute les membres des cercles partagés qui ont accepté, comme moi.
// Cloud plus ancien (sans les drapeaux) : aucun interrupteur.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { circlePlugin, cerclesOuJeSuisInvite, motifCercle, meMontrerDansCercle, CODE_ROUTE_ABSENTE } from '../circle';
import { lieuxDuGlobeValides } from '../circleMonde';
import { construireScene, noeudsDeVue, idEpingleMembre } from '../champCercle/scene';
import fr from '../locales/fr';

type Appel = { url: string; method: string };
let appels: Appel[] = [];
let memberOf: unknown = undefined;
let circles: unknown = undefined;
let routesPresentes = true;
/** `undefined` : route absente (404) ; `null` : pas de ville (204) ; sinon ma ville. */
let monLieu: unknown = undefined;

const rep = (status: number, corps?: unknown): Response => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => corps, text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
}) as unknown as Response;

function cloud(chemin: string, method: string): Response {
  if (method === 'GET' && chemin === '') {
    const e: Record<string, unknown> = { members: [{ user_id: 7, name: 'Bertrand', since: '2026-09-01T10:00:00Z' }], sent: [], received: [] };
    if (memberOf !== undefined) e.member_of = memberOf;
    if (circles !== undefined) e.circles = circles;
    return rep(200, e);
  }
  if (/^\/member-of\/\d+\/show-me$/.test(chemin) || /^\/circles\/\d+\/sharing\/members$/.test(chemin)) {
    // Greffon plus ancien : 404 sans corps du cloud.
    return routesPresentes ? rep(200, {}) : rep(404);
  }
  if (chemin === '/me/location' && method === 'GET') return monLieu === undefined ? rep(404, { error: 'not_found' }) : monLieu === null ? rep(204) : rep(200, monLieu);
  if (chemin === '/contacts/locations' || chemin === '/world/points') return rep(200, []);
  if (chemin === '/library-sync') return rep(200, { last_sync: null });
  if (chemin === '/shared-with-me') return rep(200, []);
  if (chemin === '/blocks') return rep(200, []);
  return rep(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  vi.useFakeTimers();
  appels = []; memberOf = undefined; circles = undefined; routesPresentes = true; monLieu = undefined;
  circlePlugin.set(null);
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
const ecrits = () => appels.filter((a) => a.method !== 'GET').map((a) => `${a.method} ${a.url.replace(/^.*\/ext\/circle/, '')}`);

const MEMBRE = { circle_id: 3, owner_id: 7, owner_name: 'Bertrand', circle_name: 'Bêta-testeurs' };

describe('lecture défensive', () => {
  it('member_of : drapeaux lus seulement s’ils sont booléens ; un accord sans partage ne vaut rien', () => {
    const e = { members: [], sent: [], received: [], member_of: [
      { ...MEMBRE, members_see_each_other: true, show_me: true },
      { ...MEMBRE, circle_id: 4, members_see_each_other: false, show_me: true },
      { ...MEMBRE, circle_id: 5 },
    ] };
    const m = cerclesOuJeSuisInvite(e as any);
    expect(m[0]).toMatchObject({ members_see_each_other: true, show_me: true });
    expect(cerclesOuJeSuisInvite({ ...e, member_of: [{ ...MEMBRE, members_see_each_other: true, audience_count: 4 }] } as any)[0].audience_count).toBe(4);
    expect(cerclesOuJeSuisInvite({ ...e, member_of: [{ ...MEMBRE, members_see_each_other: true, audience_count: -1 }] } as any)[0].audience_count).toBeUndefined();
    expect(m[1]).toMatchObject({ members_see_each_other: false, show_me: false });
    expect('members_see_each_other' in m[2]).toBe(false);
  });

  it('le globe sépare contacts et membres de cercles, et ne montre jamais un contact deux fois', () => {
    const r = lieuxDuGlobeValides([
      { contact_id: 7, label: 'Dijon', country_code: 'FR', lat: 47.5, lon: 5 },
      { member_id: 9, name: 'Élodie', circles: ['Bêta-testeurs', 42], label: 'Lyon', country_code: 'FR', lat: 46, lon: 5, email: 'x@y' },
      { member_id: 7, name: 'Bertrand', circles: [], label: 'Dijon', lat: 47.5, lon: 5 },
      { member_id: 10, name: '', label: 'Paris', lat: 49, lon: 2.5 },
      { member_id: 11, name: 'Sans lieu' },
    ]);
    expect([...r.contacts.keys()]).toEqual([7]);
    expect(r.membres).toEqual([{ id: 9, nom: 'Élodie', cercles: ['Bêta-testeurs'], lieu: { label: 'Lyon', country_code: 'FR', lat: 46, lon: 5 } }]);
  });

  it('les membres de cercles sont des épingles du globe SEULEMENT, jamais des contacts du réseau', () => {
    const s = construireScene({
      moi: { nom: 'Moi', albums: null, genres: [], lieu: { label: 'Dijon', country_code: 'FR', lat: 47.5, lon: 5 } },
      contacts: [], cercles: [], focus: null, maxAutour: 8, maxGrappes: 4,
      membresDeCercles: [{ id: 9, nom: 'Élodie', cercles: ['Bêta-testeurs'], lieu: { label: 'Lyon', country_code: 'FR', lat: 46, lon: 5 } }],
    });
    const pin = noeudsDeVue(s, 'monde').find((n) => n.id === idEpingleMembre(9));
    expect(pin).toMatchObject({ kind: 'pin', label: 'Élodie', place: 'Lyon', viaCercles: ['Bêta-testeurs'] });
    expect(pin?.contactId).toBeUndefined();
    expect(noeudsDeVue(s, 'reseau').some((n) => n.label === 'Élodie')).toBe(false);
  });

  it('un 404 sans code (greffon ancien) dit « mettez Tune à jour », pas « introuvable »', async () => {
    routesPresentes = false;
    let err: unknown = null;
    try { await meMontrerDansCercle(3, true); } catch (e) { err = e; }
    expect((err as any)?.code).toBe(CODE_ROUTE_ABSENTE);
    expect(motifCercle(err).cle).toBe('v2.circle.members.err.updateServer');
    expect(motifCercle({ status: 409, code: 'circle_not_shared' }).cle).toBe('v2.circle.members.err.notShared');
  });
});

describe('écran Tune Circle', () => {
  it('cloud ancien : aucun interrupteur de cercle partagé', async () => {
    memberOf = [MEMBRE];
    circles = [{ id: 1, name: 'Amis', member_ids: [7] }];
    const el = await poser();
    expect(el.querySelector('.interrupteur-membres')).toBeNull();
    expect(el.querySelector('.interrupteur-montrer')).toBeNull();
  });

  it('membre : pas d’interrupteur tant que le propriétaire ne partage pas', async () => {
    memberOf = [{ ...MEMBRE, members_see_each_other: false, show_me: false }];
    const el = await poser();
    expect(el.querySelector('.interrupteur-montrer')).toBeNull();
  });

  it('membre : « Me montrer aux autres membres de « X » », éteint par défaut, PUT puis DELETE', async () => {
    memberOf = [{ ...MEMBRE, members_see_each_other: true, show_me: false }];
    const el = await poser();
    const bouton = el.querySelector('.interrupteur-montrer') as HTMLButtonElement;
    expect(bouton).not.toBeNull();
    expect(bouton.getAttribute('aria-checked')).toBe('false');
    expect(texte(bouton)).toBe(fr['v2.circle.members.showMe'].replace('{circle}', 'Bêta-testeurs'));
    // Ce qui est montré est dit : nom, cercle, ville arrondie.
    expect(texte(el.querySelector('.montrer-quoi'))).toContain('Bêta-testeurs');
    expect(texte(el.querySelector('.montrer-quoi'))).toMatch(/nom.*ville/);

    bouton.click();
    await laisserFaire();
    expect(ecrits()).toEqual(['PUT /member-of/3/show-me']);

    memberOf = [{ ...MEMBRE, members_see_each_other: true, show_me: true }];
    monte && unmount(monte); monte = null; hote?.remove();
    const el2 = await poser();
    const b2 = el2.querySelector('.interrupteur-montrer') as HTMLButtonElement;
    expect(b2.getAttribute('aria-checked')).toBe('true');
    appels = [];
    b2.click();
    await laisserFaire();
    expect(ecrits()).toEqual(['DELETE /member-of/3/show-me']);
  });

  it('sans ville posée : interrupteur grisé et « posez votre ville » ; avec une ville : actif ; l’audience est dite', async () => {
    memberOf = [{ ...MEMBRE, members_see_each_other: true, show_me: false, audience_count: 12 }];
    monLieu = null;
    const el = await poser();
    const bouton = el.querySelector('.interrupteur-montrer') as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(texte(el.querySelector('.montrer-sans-ville'))).toBe(fr['v2.circle.members.needCity']);
    expect(texte(el.querySelector('.montrer-audience'))).toContain('12 autres membres');
    expect(texte(el.querySelector('.montrer-quoi'))).toMatch(/présents et futurs.*50 km/);
    bouton.click();
    await laisserFaire();
    expect(ecrits()).toEqual([]);

    monte && unmount(monte); monte = null; hote?.remove();
    monLieu = { label: 'Dijon', country_code: 'FR', lat: 47.5, lon: 5 };
    const el2 = await poser();
    expect((el2.querySelector('.interrupteur-montrer') as HTMLButtonElement).disabled).toBe(false);
    expect(el2.querySelector('.montrer-sans-ville')).toBeNull();
  });

  it('propriétaire : « Partager ce cercle entre ses membres » ; couper demande confirmation', async () => {
    circles = [{ id: 1, name: 'Amis', member_ids: [7], members_see_each_other: false }];
    const el = await poser();
    const bouton = el.querySelector('.interrupteur-membres') as HTMLButtonElement;
    expect(bouton.getAttribute('aria-checked')).toBe('false');
    expect(texte(el.querySelector('.membres-quoi'))).toBe(fr['v2.circle.members.what']);
    bouton.click();
    await laisserFaire();
    expect(ecrits()).toEqual(['PUT /circles/1/sharing/members']);

    circles = [{ id: 1, name: 'Amis', member_ids: [7], members_see_each_other: true }];
    monte && unmount(monte); monte = null; hote?.remove();
    const el2 = await poser();
    appels = [];
    const confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    (el2.querySelector('.interrupteur-membres') as HTMLButtonElement).click();
    await laisserFaire();
    expect(confirm).toHaveBeenCalledOnce();
    expect(ecrits()).toEqual([]);
    confirm.mockResolvedValue(true);
    (el2.querySelector('.interrupteur-membres') as HTMLButtonElement).click();
    await laisserFaire();
    expect(ecrits()).toEqual(['DELETE /circles/1/sharing/members']);
  });
});
