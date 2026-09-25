// @vitest-environment jsdom
//
// jsdom : sans `window`, `$effect` ne se déclenche pas et l'écran ne lirait
// jamais `/ext/circle` — un test vert qui n'aurait rien exécuté.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import PluginsV2 from '../../components/v2/PluginsV2.svelte';
import { preparerLocale } from '../i18n';
import { activeView } from '../stores/navigation';
import { dialogs } from '../stores/dialogs';
import { circlePlugin, motifCercle, nomCercleValide, RELECTURE_CERCLE_MS } from '../circle';
import fr from '../locales/fr';

/**
 * Écran Tune Circle — renesenses/tune-server-rust#5018, étape T1, avec
 * l'avenant « PLUSIEURS cercles par utilisateur » (25/09/2026).
 *
 * Le faux serveur ci-dessous suit le contrat du greffon `circle` (#5027) et du
 * cloud (site-mozaiklabs#223) : `GET /` rend `{members, sent, received,
 * circles}` ou `{connected:false}` ; 201 à l'invitation ; `accept` rend le
 * contact ; `decline` et les `DELETE` rendent `{ok:true}` ; 404
 * `{error:"not_found"}` ; 409/422 avec leur motif ; 429 avec `Retry-After` ;
 * 412 `circle.not_connected` ; 503 `circle.cloud_unavailable`.
 *
 * Il porte un ÉTAT, comme le cloud : c'est la relecture de `GET /` après
 * chaque geste qui doit faire apparaître ou disparaître une ligne. Un écran
 * qui retoucherait sa liste lui-même sans relire serait vert par accident ;
 * le compteur de `GET` le démasque.
 */

type Contact = { user_id: number; name: string; since: string; [k: string]: unknown };
type Invitation = { id: number; name_or_email: string; created_at: string; expires_at: string; [k: string]: unknown };
type Cercle = { id: number; name: string; member_ids: number[] };
type Refus = { status: number; corps: unknown; entetes?: Record<string, string> };

let connecte = true;
let contacts: Contact[] = [];
let envoyees: Invitation[] = [];
let recues: Invitation[] = [];
let cercles: Cercle[] = [];
let extra: Record<string, unknown> = {};
let prochainId = 100;
let greffon: unknown[] = [];
/** Refus imposé à la PROCHAINE requête dont l'URL et la méthode correspondent. */
let refus: { motif: RegExp; methode: string; reponse: Refus } | null = null;
let panneGet = false;

type Appel = { url: string; method: string; body: unknown };
let appels: Appel[] = [];

function reponse(status: number, corps: unknown, entetes: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json', ...entetes }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const introuvable = () => reponse(404, { error: 'not_found' });

function cloud(u: string, method: string, body: any): Response {
  const chemin = u.replace(/^.*\/api\/v1\/ext\/circle/, '');
  if (refus && refus.methode === method && refus.motif.test(chemin)) {
    const r = refus.reponse; refus = null;
    return reponse(r.status, r.corps, r.entetes);
  }
  if (method === 'GET' && chemin === '') {
    if (panneGet) return reponse(503, { connected: true, code: 'circle.cloud_unavailable', upstream_status: 500 });
    if (!connecte) return reponse(200, { connected: false });
    return reponse(200, JSON.parse(JSON.stringify({ members: contacts, sent: envoyees, received: recues, circles: cercles, ...extra })));
  }
  if (!connecte) return reponse(412, { connected: false, code: 'circle.not_connected' });
  let m: RegExpMatchArray | null;
  if (method === 'POST' && chemin === '/invitations') {
    // Même réponse, adresse connue ou non : aucune énumération des comptes.
    const inv = { id: prochainId++, name_or_email: body.email, created_at: '2026-09-25T10:00:00Z', expires_at: '2026-10-25T10:00:00Z' };
    envoyees.push(inv);
    return reponse(201, inv);
  }
  if (method === 'POST' && (m = chemin.match(/^\/invitations\/(\d+)\/accept$/))) {
    const inv = recues.find((i) => i.id === Number(m![1]));
    if (!inv) return introuvable();
    recues = recues.filter((i) => i !== inv);
    const c = { user_id: 50 + inv.id, name: inv.name_or_email, since: '2026-09-25T10:00:00Z' };
    contacts.push(c);
    return reponse(200, c);
  }
  if (method === 'POST' && (m = chemin.match(/^\/invitations\/(\d+)\/decline$/))) {
    if (!recues.some((i) => i.id === Number(m![1]))) return introuvable();
    recues = recues.filter((i) => i.id !== Number(m![1]));
    return reponse(200, { ok: true });
  }
  if (method === 'DELETE' && (m = chemin.match(/^\/invitations\/(\d+)$/))) {
    if (!envoyees.some((i) => i.id === Number(m![1]))) return introuvable();
    envoyees = envoyees.filter((i) => i.id !== Number(m![1]));
    return reponse(200, { ok: true });
  }
  if (method === 'DELETE' && (m = chemin.match(/^\/members\/(\d+)$/))) {
    const uid = Number(m[1]);
    if (!contacts.some((c) => c.user_id === uid)) return introuvable();
    // Révocation : hors des contacts ET de tous les cercles, en même temps.
    contacts = contacts.filter((c) => c.user_id !== uid);
    cercles = cercles.map((c) => ({ ...c, member_ids: c.member_ids.filter((x) => x !== uid) }));
    return reponse(200, { ok: true });
  }
  if (method === 'POST' && chemin === '/circles') {
    const c = { id: prochainId++, name: body.name, member_ids: [] };
    cercles.push(c);
    return reponse(201, c);
  }
  if ((m = chemin.match(/^\/circles\/(\d+)$/))) {
    const c = cercles.find((x) => x.id === Number(m![1]));
    if (!c) return introuvable();
    if (method === 'PATCH') { c.name = body.name; return reponse(200, c); }
    if (method === 'DELETE') { cercles = cercles.filter((x) => x !== c); return reponse(200, { ok: true }); }
  }
  if ((m = chemin.match(/^\/circles\/(\d+)\/members\/(\d+)$/))) {
    const c = cercles.find((x) => x.id === Number(m![1]));
    const uid = Number(m[2]);
    if (!c) return introuvable();
    if (method === 'PUT') {
      if (!contacts.some((x) => x.user_id === uid)) return introuvable();
      if (!c.member_ids.includes(uid)) c.member_ids.push(uid);
      return reponse(200, c);
    }
    if (method === 'DELETE') { c.member_ids = c.member_ids.filter((x) => x !== uid); return reponse(200, { ok: true }); }
  }
  return introuvable();
}

beforeAll(async () => { await preparerLocale('fr'); });

beforeEach(() => {
  vi.useFakeTimers();
  appels = [];
  connecte = true;
  panneGet = false;
  refus = null;
  extra = {};
  prochainId = 100;
  contacts = [
    { user_id: 12, name: 'Alice', since: '2026-09-01T10:00:00Z' },
    { user_id: 13, name: 'Bruno', since: '2026-09-02T10:00:00Z' },
  ];
  recues = [{ id: 21, name_or_email: 'Chloé', created_at: '2026-09-20T10:00:00Z', expires_at: '2026-10-20T10:00:00Z' }];
  envoyees = [{ id: 31, name_or_email: 'denis@example.test', created_at: '2026-09-21T10:00:00Z', expires_at: '2026-10-21T10:00:00Z' }];
  cercles = [
    { id: 7, name: 'Famille', member_ids: [12] },
    { id: 8, name: 'Jazz', member_ids: [12, 13] },
  ];
  greffon = [{ name: 'circle', type: 'sdk', installed: true, enabled: true, compatible: true, description: 'Circle', version: '1' }];
  circlePlugin.set(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      appels.push({ url: u, method, body });
      if (u.includes('/ext/circle')) return cloud(u, method, body);
      if (u.includes('/marketplace')) return reponse(200, { plugins: [] });
      if (u.endsWith('/plugins')) return reponse(200, greffon);
      if (u.includes('/plugins/docs')) return reponse(200, {});
      return reponse(200, {});
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  // Un dialogue resté ouvert ne doit pas fuir dans le test suivant.
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function laisserFaire() {
  for (let i = 0; i < 8; i++) {
    await vi.advanceTimersByTimeAsync(0);
    flushSync();
  }
}

async function poser(Vue: typeof CircleV2 | typeof PluginsV2): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue as any, { target: hote });
  flushSync();
  await laisserFaire();
  return hote;
}

const appelsCercle = () => appels.filter((a) => a.url.includes('/ext/circle'));
const lectures = () => appelsCercle().filter((a) => a.method === 'GET').length;
const gestes = () => appelsCercle().filter((a) => a.method !== 'GET');
const texte = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const noms = (el: Element, sel: string) => [...el.querySelectorAll(sel)].map((n) => texte(n));

function bouton(el: Element, sel: string): HTMLButtonElement {
  const b = el.querySelector(sel) as HTMLButtonElement | null;
  if (!b) throw new Error(`bouton introuvable : ${sel}`);
  return b;
}

async function cliquer(el: Element, sel: string) {
  bouton(el, sel).click();
  await laisserFaire();
}

async function saisir(el: Element, sel: string, valeur: string) {
  const champ = el.querySelector(sel) as HTMLInputElement | HTMLSelectElement;
  champ.value = valeur;
  champ.dispatchEvent(new Event(champ.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  await laisserFaire();
}

/** Le dialogue ouvert (confirmation ou saisie) : son message, puis la réponse. */
async function repondre(valeur: boolean | string | null): Promise<string> {
  const d = get(dialogs)[0];
  if (!d) throw new Error('aucun dialogue ouvert');
  dialogs.settle(d.id, valeur);
  await laisserFaire();
  return d.message;
}

async function inviter(el: Element, adresse: string) {
  await saisir(el, 'input.email', adresse);
  await cliquer(el, 'button.envoyer');
}

function contactDe(el: Element, nom: string): Element {
  const li = [...el.querySelectorAll('li.contact')].find((n) => n.querySelector('.nom')?.textContent === nom);
  if (!li) throw new Error(`contact introuvable : ${nom}`);
  return li;
}

function cercleDe(el: Element, nom: string): Element {
  const a = [...el.querySelectorAll('article.cercle')].find((n) => n.querySelector('.cercle-nom')?.textContent === nom);
  if (!a) throw new Error(`cercle introuvable : ${nom}`);
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Tune Circle — connexion et lecture', () => {
  it('non connecté à mozaiklabs : une phrase et le bouton de connexion, sans autre appel', async () => {
    connecte = false;
    const el = await poser(CircleV2);
    expect(texte(el.querySelector('.deconnecte')!)).toContain(fr['v2.circle.notConnected']);
    expect(texte(bouton(el, 'button.se-connecter'))).toBe(fr['v2.circle.signIn']);
    expect(appelsCercle().map((a) => a.method)).toEqual(['GET']);
    expect(el.querySelector('section.contacts')).toBeNull();
  });

  it('connecté : contacts, invitations reçues, envoyées, et mes cercles', async () => {
    const el = await poser(CircleV2);
    expect(noms(el, 'li.contact .nom')).toEqual(['Alice', 'Bruno']);
    expect(texte(contactDe(el, 'Alice'))).toMatch(/depuis le/);
    expect(noms(el, 'li.invitation-recue .nom')).toEqual(['Chloé']);
    expect(el.querySelector('li.invitation-recue button.accepter')).not.toBeNull();
    expect(el.querySelector('li.invitation-recue button.refuser')).not.toBeNull();
    const env = el.querySelector('li.invitation-envoyee')!;
    expect(texte(env.querySelector('.nom')!)).toBe('denis@example.test');
    expect(texte(env)).toMatch(/expire le/);
    expect(env.querySelector('button.annuler')).not.toBeNull();
    expect(noms(el, '.cercle-nom')).toEqual(['Famille', 'Jazz']);
    expect(noms(cercleDe(el, 'Jazz'), 'li.membre-cercle .nom')).toEqual(['Alice', 'Bruno']);
    // Aucun bandeau d'erreur, aucun code brut.
    expect(el.querySelector('.err')).toBeNull();
  });
});

describe('Tune Circle — inviter', () => {
  it('201, « Invitation envoyée », puis la relecture montre l’invitation', async () => {
    const el = await poser(CircleV2);
    const avant = lectures();
    await inviter(el, 'eve@example.test');
    const post = gestes();
    expect(post).toHaveLength(1);
    expect(post[0].method).toBe('POST');
    expect(post[0].url).toMatch(/\/ext\/circle\/invitations$/);
    expect(post[0].body).toEqual({ email: 'eve@example.test' });
    expect(texte(el.querySelector('.retour-invitation')!)).toBe(fr['v2.circle.invited']);
    expect(lectures()).toBe(avant + 1);
    expect(noms(el, 'li.invitation-envoyee .nom')).toContain('eve@example.test');
    expect((el.querySelector('input.email') as HTMLInputElement).value).toBe('');
  });

  it('adresse sans compte : EXACTEMENT le même message qu’une adresse connue', async () => {
    const el = await poser(CircleV2);
    await inviter(el, 'connue@example.test');
    const connue = texte(el.querySelector('.retour-invitation')!);
    await inviter(el, 'inconnue@example.test');
    const inconnue = texte(el.querySelector('.retour-invitation')!);
    expect(inconnue).toBe(connue);
    expect(inconnue).toBe(fr['v2.circle.invited']);
    expect(texte(el)).not.toMatch(/compte|account|inscri/i);
  });

  it('« ranger dans le cercle… » envoie `circle_id`, facultatif', async () => {
    const el = await poser(CircleV2);
    await saisir(el, 'select.ranger-dans', '8');
    await inviter(el, 'fred@example.test');
    expect(gestes()[0].body).toEqual({ email: 'fred@example.test', circle_id: 8 });
  });

  const refusInvitation: Array<[string, Refus, string]> = [
    ['409 déjà dans le cercle', { status: 409, corps: { error: 'already_member' } }, fr['v2.circle.err.alreadyMember']],
    ['409 invitation déjà en attente', { status: 409, corps: { error: 'already_invited' } }, fr['v2.circle.err.alreadyInvited']],
    ['409 invitation croisée', { status: 409, corps: { error: 'invitation_received' } }, fr['v2.circle.err.invitationReceived']],
    ['422 sa propre adresse', { status: 422, corps: { error: 'self_invitation' } }, fr['v2.circle.err.selfInvitation']],
    ['422 adresse invalide', { status: 422, corps: { message: 'The email field must be a valid email address.', errors: { email: ['The email field must be a valid email address.'] } } }, fr['v2.circle.err.emailInvalid']],
  ];
  for (const [nom, r, attendu] of refusInvitation) {
    it(`${nom} : une phrase traduite, jamais le motif brut`, async () => {
      const el = await poser(CircleV2);
      refus = { motif: /^\/invitations$/, methode: 'POST', reponse: r };
      await inviter(el, 'x@example.test');
      const msg = el.querySelector('.retour-invitation')!;
      expect(texte(msg)).toBe(attendu);
      expect(msg.getAttribute('role')).toBe('alert');
      expect(texte(el)).not.toMatch(/already_|self_invitation|The email field/);
      expect(document.body.textContent ?? '').not.toContain('Server error');
    });
  }

  it('429 : « réessayez dans N min », N tiré de Retry-After', async () => {
    const el = await poser(CircleV2);
    refus = { motif: /^\/invitations$/, methode: 'POST', reponse: { status: 429, corps: { message: 'Too Many Attempts.' }, entetes: { 'Retry-After': '300' } } };
    await inviter(el, 'x@example.test');
    expect(texte(el.querySelector('.retour-invitation')!)).toBe(fr['v2.circle.err.tooManyWait'].replace('{n}', '5'));
  });
});

describe('Tune Circle — invitations reçues et envoyées', () => {
  it('accepter : POST accept, puis la relecture fait entrer le contact', async () => {
    const el = await poser(CircleV2);
    await cliquer(el, 'li.invitation-recue button.accepter');
    expect(gestes().map((a) => `${a.method} ${a.url.replace(/^.*ext\/circle/, '')}`)).toEqual(['POST /invitations/21/accept']);
    expect(el.querySelector('li.invitation-recue')).toBeNull();
    expect(noms(el, 'li.contact .nom')).toContain('Chloé');
  });

  it('refuser : POST decline, l’invitation disparaît à la relecture', async () => {
    const el = await poser(CircleV2);
    await cliquer(el, 'li.invitation-recue button.refuser');
    expect(gestes().map((a) => `${a.method} ${a.url.replace(/^.*ext\/circle/, '')}`)).toEqual(['POST /invitations/21/decline']);
    expect(el.querySelector('li.invitation-recue')).toBeNull();
    expect(noms(el, 'li.contact .nom')).not.toContain('Chloé');
  });

  it('annuler une invitation envoyée : DELETE, puis elle disparaît', async () => {
    const el = await poser(CircleV2);
    await cliquer(el, 'li.invitation-envoyee button.annuler');
    expect(gestes().map((a) => `${a.method} ${a.url.replace(/^.*ext\/circle/, '')}`)).toEqual(['DELETE /invitations/31']);
    expect(el.querySelector('li.invitation-envoyee')).toBeNull();
  });
});

describe('Tune Circle — révocation et retrait d’un cercle', () => {
  it('retirer un contact : confirmation (immédiat, tous les cercles, réinviter), puis relecture sans lui', async () => {
    const el = await poser(CircleV2);
    bouton(contactDe(el, 'Alice'), 'button.revoquer').click();
    await laisserFaire();
    // Annuler : rien ne part.
    const message = await repondre(false);
    expect(message).toBe(fr['v2.circle.confirmRevoke'].split('{name}').join('Alice'));
    expect(message).toMatch(/immédiat/);
    expect(message).toMatch(/tous vos cercles/);
    expect(message).toMatch(/inviter à nouveau/);
    expect(gestes()).toHaveLength(0);

    bouton(contactDe(el, 'Alice'), 'button.revoquer').click();
    await laisserFaire();
    const avant = lectures();
    await repondre(true);
    expect(gestes().map((a) => `${a.method} ${a.url.replace(/^.*ext\/circle/, '')}`)).toEqual(['DELETE /members/12']);
    expect(lectures()).toBe(avant + 1);
    expect(noms(el, 'li.contact .nom')).toEqual(['Bruno']);
    // Et hors de TOUS ses cercles.
    expect(noms(cercleDe(el, 'Famille'), 'li.membre-cercle .nom')).toEqual([]);
    expect(noms(cercleDe(el, 'Jazz'), 'li.membre-cercle .nom')).toEqual(['Bruno']);
  });

  it('retirer d’UN cercle : DELETE du cercle seulement, jamais la révocation', async () => {
    const el = await poser(CircleV2);
    const famille = cercleDe(el, 'Famille');
    await cliquer(famille, 'li.membre-cercle button.retirer-du-cercle');
    expect(gestes().map((a) => `${a.method} ${a.url.replace(/^.*ext\/circle/, '')}`)).toEqual(['DELETE /circles/7/members/12']);
    expect(appelsCercle().some((a) => /\/ext\/circle\/members\//.test(a.url))).toBe(false);
    expect(noms(cercleDe(el, 'Famille'), 'li.membre-cercle .nom')).toEqual([]);
    // Toujours un contact, toujours dans « Jazz ».
    expect(noms(el, 'li.contact .nom')).toEqual(['Alice', 'Bruno']);
    expect(noms(cercleDe(el, 'Jazz'), 'li.membre-cercle .nom')).toEqual(['Alice', 'Bruno']);
    expect(texte(el)).toContain(fr['v2.circle.circlesHint']);
  });
});

describe('Tune Circle — mes cercles', () => {
  it('ajouter un contact : le choix ne propose que ceux qui n’y sont pas, puis PUT', async () => {
    const el = await poser(CircleV2);
    const famille = cercleDe(el, 'Famille');
    const options = [...famille.querySelectorAll('select.choix-contact option')].map((o) => o.textContent);
    expect(options).toEqual([fr['v2.circle.addContactPick'], 'Bruno']);
    expect(cercleDe(el, 'Jazz').querySelector('select.choix-contact'), 'tous déjà dedans').toBeNull();
    await saisir(famille, 'select.choix-contact', '13');
    await cliquer(cercleDe(el, 'Famille'), 'button.ranger');
    expect(gestes().map((a) => `${a.method} ${a.url.replace(/^.*ext\/circle/, '')}`)).toEqual(['PUT /circles/7/members/13']);
    expect(noms(cercleDe(el, 'Famille'), 'li.membre-cercle .nom')).toEqual(['Alice', 'Bruno']);
  });

  it('créer : POST {name}, puis le cercle apparaît à la relecture', async () => {
    const el = await poser(CircleV2);
    await saisir(el, '#circle-nouveau', '  Voisins  ');
    await cliquer(el, 'button.creer');
    expect(gestes().map((a) => [a.method, a.body])).toEqual([['POST', { name: 'Voisins' }]]);
    expect(noms(el, '.cercle-nom')).toEqual(['Famille', 'Jazz', 'Voisins']);
  });

  it('créer : 409 circle_name_taken et 422 too_many_circles ont leur phrase', async () => {
    const el = await poser(CircleV2);
    refus = { motif: /^\/circles$/, methode: 'POST', reponse: { status: 409, corps: { error: 'circle_name_taken' } } };
    await saisir(el, '#circle-nouveau', 'famille');
    await cliquer(el, 'button.creer');
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.err.nameTaken']);
    refus = { motif: /^\/circles$/, methode: 'POST', reponse: { status: 422, corps: { error: 'too_many_circles' } } };
    await saisir(el, '#circle-nouveau', 'Cinquante et un');
    await cliquer(el, 'button.creer');
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.err.tooManyCircles']);
  });

  it('un nom de plus de 60 caractères n’est pas envoyé', async () => {
    const el = await poser(CircleV2);
    await saisir(el, '#circle-nouveau', 'x'.repeat(61));
    await cliquer(el, 'button.creer');
    expect(gestes()).toHaveLength(0);
    expect(texte(el.querySelector('.retour')!)).toBe(fr['v2.circle.err.nameInvalid']);
    expect(nomCercleValide('x'.repeat(60))).toBe('x'.repeat(60));
    expect(nomCercleValide('   ')).toBeNull();
  });

  it('renommer : PATCH {name}', async () => {
    const el = await poser(CircleV2);
    bouton(cercleDe(el, 'Jazz'), 'button.renommer').click();
    await laisserFaire();
    await repondre('Jazz & blues');
    expect(gestes().map((a) => `${a.method} ${a.url.replace(/^.*ext\/circle/, '')}`)).toEqual(['PATCH /circles/8']);
    expect(gestes()[0].body).toEqual({ name: 'Jazz & blues' });
    expect(noms(el, '.cercle-nom')).toEqual(['Famille', 'Jazz & blues']);
  });

  it('supprimer : confirmation « les contacts restent », DELETE, et les contacts restent', async () => {
    const el = await poser(CircleV2);
    bouton(cercleDe(el, 'Famille'), 'button.supprimer').click();
    await laisserFaire();
    const message = await repondre(true);
    expect(message).toBe(fr['v2.circle.confirmDeleteCircle'].replace('{name}', 'Famille'));
    expect(message).toMatch(/restent/);
    expect(gestes().map((a) => `${a.method} ${a.url.replace(/^.*ext\/circle/, '')}`)).toEqual(['DELETE /circles/7']);
    expect(noms(el, '.cercle-nom')).toEqual(['Jazz']);
    expect(noms(el, 'li.contact .nom')).toEqual(['Alice', 'Bruno']);
  });

  it('vie privée : aucun nom de cercle ne vient d’ailleurs que de `GET /` → `circles`', async () => {
    // Des noms de cercle glissés dans d'autres champs (ceux d'un AUTRE
    // utilisateur, par exemple) ne doivent jamais s'afficher.
    contacts[0] = { ...contacts[0], circles: [{ id: 99, name: 'Secret de Bruno' }], circle_name: 'Cercle caché A' };
    recues[0] = { ...recues[0], circle_name: 'Cercle caché B', circle: { name: 'Cercle caché C' } };
    envoyees[0] = { ...envoyees[0], circle_id: 7, circle_name: 'Cercle caché D' };
    extra = { friend_circles: [{ id: 5, name: 'Cercle caché E', member_ids: [12] }] };
    const el = await poser(CircleV2);
    expect(noms(el, '.cercle-nom')).toEqual(cercles.map((c) => c.name));
    const choix = [...el.querySelectorAll('select.ranger-dans option')].slice(1).map((o) => o.textContent);
    expect(choix).toEqual(cercles.map((c) => fr['v2.circle.fileIntoNamed'].replace('{name}', c.name)));
    expect(texte(el)).not.toMatch(/Secret de Bruno|Cercle caché/);
  });
});

describe('Tune Circle — pannes et relecture', () => {
  it('503 à la lecture : « service indisponible » et Réessayer, qui relit', async () => {
    panneGet = true;
    const el = await poser(CircleV2);
    const panne = el.querySelector('.panne')!;
    expect(texte(panne)).toContain(fr['v2.circle.err.unavailable']);
    expect(panne.getAttribute('role')).toBe('alert');
    expect(texte(el)).not.toMatch(/circle\.cloud_unavailable|503/);
    expect(document.body.textContent ?? '').not.toContain('Server error');
    panneGet = false;
    await cliquer(el, '.panne button.reessayer');
    expect(noms(el, 'li.contact .nom')).toEqual(['Alice', 'Bruno']);
  });

  it('503 sur un geste : la phrase, et Réessayer rejoue le geste', async () => {
    const el = await poser(CircleV2);
    refus = { motif: /^\/invitations$/, methode: 'POST', reponse: { status: 503, corps: { connected: true, code: 'circle.cloud_unavailable', upstream_status: null } } };
    await inviter(el, 'gus@example.test');
    expect(texte(el.querySelector('.retour-invitation span')!)).toBe(fr['v2.circle.err.unavailable']);
    await cliquer(el, '.retour-invitation button.reessayer');
    expect(gestes().filter((a) => a.method === 'POST')).toHaveLength(2);
    expect(texte(el.querySelector('.retour-invitation')!)).toBe(fr['v2.circle.invited']);
  });

  it('relecture modérée : 60 s onglet visible ; rien onglet masqué ; rien après fermeture', async () => {
    await poser(CircleV2);
    const a = lectures();
    await vi.advanceTimersByTimeAsync(RELECTURE_CERCLE_MS - 1000);
    expect(lectures(), 'pas avant 60 s').toBe(a);
    await vi.advanceTimersByTimeAsync(1000);
    expect(lectures()).toBe(a + 1);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try {
      await vi.advanceTimersByTimeAsync(RELECTURE_CERCLE_MS * 3);
      expect(lectures(), 'onglet masqué').toBe(a + 1);
    } finally {
      delete (document as unknown as Record<string, unknown>).hidden;
    }
    unmount(monte!); monte = null;
    await vi.advanceTimersByTimeAsync(RELECTURE_CERCLE_MS * 3);
    expect(lectures(), 'écran fermé').toBe(a + 1);
  });

  it('motifs : 412 non connecté, 404 introuvable, 429 sans délai', () => {
    expect(motifCercle({ status: 412, code: 'circle.not_connected' }).deconnecte).toBe(true);
    expect(motifCercle({ status: 404, code: 'not_found' }).cle).toBe('v2.circle.err.notFound');
    expect(motifCercle({ status: 429 }).cle).toBe('v2.circle.err.tooMany');
    expect(motifCercle({ status: 429, retryAfter: 61 }).minutes).toBe(2);
    expect(motifCercle({ status: 422, corps: { errors: { name: ['x'] } } }, 'name').cle).toBe('v2.circle.err.nameInvalid');
  });
});

describe('Tune Circle — masqué sans le greffon', () => {
  it('greffon absent : l’écran le dit et n’interroge pas ses routes', async () => {
    greffon = [];
    const el = await poser(CircleV2);
    expect(appelsCercle()).toHaveLength(0);
    expect(texte(el.querySelector('.absent')!)).toBe(fr['v2.circle.notInstalled']);
  });

  it('greffon installé mais pas encore chargé : idem', async () => {
    greffon = [{ name: 'circle', installed: true, enabled: false }];
    await poser(CircleV2);
    expect(appelsCercle()).toHaveLength(0);
  });

  it('Extensions : « Ouvrir » n’existe que pour un greffon circle actif, et mène à l’écran', async () => {
    greffon = [{ name: 'circle', type: 'sdk', installed: false, enabled: false, compatible: true, description: 'Circle', version: '1' }];
    let el = await poser(PluginsV2);
    expect(el.querySelector('button.ouvrir-circle')).toBeNull();
    unmount(monte!); monte = null; hote?.remove();

    greffon = [{ name: 'circle', type: 'sdk', installed: true, enabled: true, compatible: true, description: 'Circle', version: '1' }];
    el = await poser(PluginsV2);
    const ouvrir = el.querySelector('button.ouvrir-circle') as HTMLButtonElement | null;
    expect(ouvrir).not.toBeNull();
    ouvrir!.click();
    expect(get(activeView)).toBe('circle');
  });
});
