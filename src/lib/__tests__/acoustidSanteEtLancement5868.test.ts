// @vitest-environment jsdom
//
// Identification par empreinte acoustique (AcoustID) — suite web de
// renesenses/tune-server-rust#5868.
//
// Le serveur publie un bloc `acoustid` dans `GET /system/background-tasks`
// (`available`, `reason`, `message`), accepte `POST /library/identify-all?mode=acoustid`
// et répond `409` avec un motif quand `fpcalc` ou la clé manquent.
//
// 🔴 Ces témoins MONTENT l'écran Santé et l'écran Réglages, avec un `fetch`
// simulé : ils lisent ce qui est affiché et la requête qui part vraiment.
// Contre-épreuve : un serveur sans le bloc n'affiche ni carte, ni bouton, ni
// champ de clé, et n'envoie aucune requête `mode=acoustid`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { tachesDeFond } from '../stores/tachesDeFond';
import lFr from '../locales/fr';
import { carteAcoustid, issueDuLancement, lireBlocAcoustid } from '../acoustid';

const fr = lFr as unknown as Record<string, string>;
const tr = (k: string) => fr[k] ?? k;

type Requete = { methode: string; chemin: string; query: string; corps: string | null };
let requetes: Requete[] = [];
/** Le bloc publié par le serveur ; `undefined` = serveur antérieur à #5868. */
let bloc: Record<string, unknown> | undefined;
/** L'état de `GET /library/identify-all/status`. */
let lot: Record<string, unknown>;
/** La réponse du lancement : statut et corps. */
let lancement: { status: number; corps: unknown };

const VIDE = /\/(zones|devices|profiles|shortcuts|collections|service-tokens)(\?|\/|$)/;

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function repondre(methode: string, chemin: string): Response {
  if (chemin.endsWith('/library/identify-all') && methode === 'POST') {
    return json(lancement.corps, lancement.status);
  }
  if (chemin.endsWith('/library/identify-all/status')) return json(lot);
  if (chemin.endsWith('/system/background-tasks')) {
    const base: Record<string, unknown> = { tasks: [], pausable: [], all_paused: false, scan_pausable: false };
    if (bloc) base.acoustid = bloc;
    return json(base);
  }
  if (chemin.endsWith('/system/config')) {
    // Le serveur caviarde le secret : le client ne voit que le masque.
    return json({ music_dirs: [], acoustid_api_key: bloc?.api_key_configured ? '********' : undefined });
  }
  if (chemin.includes('/system/scan/status')) return json({ scanning: false });
  if (VIDE.test(chemin)) return json([]);
  return json({});
}

class ResizeObserverInerte { observe() {} unobserve() {} disconnect() {} }

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  bloc = {
    available: false, fpcalc: false, api_key_configured: false,
    reason: 'fpcalc_absent',
    message: "Identification par empreinte désactivée : l'outil fpcalc (Chromaprint) n'est pas installé sur ce serveur.",
    setting_key: 'acoustid_api_key',
  };
  lot = { status: 'idle', total: 0, traites: 0, identifies: 0, raison: null };
  lancement = { status: 202, corps: { status: 'started', mode: 'acoustid', total: 7 } };
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
    const sansHote = brut.replace(/^https?:\/\/[^/]+/, '');
    const [chemin, query = ''] = sansHote.split('?');
    const methode = String(init?.method ?? 'GET').toUpperCase();
    const corps = typeof init?.body === 'string' ? init.body : null;
    requetes.push({ methode, chemin, query, corps });
    return repondre(methode, chemin);
  }));
  tachesDeFond.set([]);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  tachesDeFond.set([]);
  vi.unstubAllGlobals();
});

async function attendre(tours = 6) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

// ── Santé ─────────────────────────────────────────────────────────────────

async function monterSante() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TuneHealthV2, { target: hote });
  flushSync();
  await new Promise((r) => setTimeout(r, 120));
  await attendre();
  return hote;
}

function carteSante(): HTMLElement | null {
  const cartes = Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[];
  return cartes.find((c) => c.querySelector('h2')?.textContent?.trim() === fr['acoustid.title']) ?? null;
}

describe('Santé — le bloc `acoustid` (#5868)', () => {
  it('fpcalc absent : la carte dit le motif et le code', async () => {
    await monterSante();
    const c = carteSante();
    expect(c, 'aucune carte AcoustID').not.toBeNull();
    expect(c!.textContent).toContain(fr['acoustid.reasonFpcalc']);
    expect(c!.textContent).toContain('fpcalc_absent');
    expect(c!.textContent).toContain(fr['v2.health.stOff']);
  });

  it('clé manquante : le motif de la clé', async () => {
    bloc = { ...bloc, fpcalc: true, reason: 'acoustid_cle_absente', message: 'x' };
    await monterSante();
    expect(carteSante()!.textContent).toContain(fr['acoustid.reasonKey']);
    expect(carteSante()!.textContent).toContain('acoustid_cle_absente');
  });

  it('passe en cours : l’avancement chiffré', async () => {
    bloc = { ...bloc, available: true, fpcalc: true, api_key_configured: true, reason: null };
    lot = { status: 'running', mode: 'acoustid', total: 40, traites: 10, identifies: 6 };
    await monterSante();
    const c = carteSante()!;
    expect(c.textContent).toContain(fr['v2.health.stRunning']);
    expect(c.textContent).toContain('10');
    expect(c.textContent).toContain('40');
    expect(c.textContent).toContain('25 %');
  });

  it('passe terminée : identifiés et sans majorité', async () => {
    bloc = { ...bloc, available: true, fpcalc: true, api_key_configured: true, reason: null };
    lot = { status: 'done', mode: 'acoustid', total: 8, traites: 8, identifies: 5, sans_majorite: 3 };
    await monterSante();
    const c = carteSante()!;
    expect(c.textContent).toContain(fr['v2.health.stDone']);
    expect(c.textContent).toContain(
      fr['acoustid.done'].replace('{ok}', '5').replace('{sans}', '3').replace('{total}', '8'),
    );
  });

  it('contre-épreuve : la passe d’un AUTRE mode n’est pas la nôtre', async () => {
    bloc = { ...bloc, available: true, fpcalc: true, api_key_configured: true, reason: null };
    lot = { status: 'running', mode: 'labels', total: 40, traites: 10 };
    await monterSante();
    const c = carteSante()!;
    expect(c.textContent).toContain(fr['acoustid.available']);
    expect(c.textContent).not.toContain(fr['v2.health.stRunning']);
  });

  it('contre-épreuve : serveur sans le bloc, aucune carte et aucune lecture de l’état', async () => {
    bloc = undefined;
    await monterSante();
    expect(carteSante()).toBeNull();
    expect(requetes.some((r) => r.chemin.endsWith('/library/identify-all/status'))).toBe(false);
  });
});

// ── Réglages : le bouton et le 409 ─────────────────────────────────────────

async function monterReglages(ongletCle: string) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === fr[ongletCle],
  );
  expect(onglet, `onglet ${ongletCle} introuvable`).toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return hote;
}

function boutonAcoustid(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector('[data-acoustid="lancer"] button') as HTMLButtonElement | null;
}

describe('Réglages — « Identifier par empreinte acoustique » (#5868)', () => {
  it('le clic envoie POST /library/identify-all?mode=acoustid', async () => {
    bloc = { ...bloc, available: true, fpcalc: true, api_key_configured: true, reason: null };
    const el = await monterReglages('settings.tabLibrary');
    const rangee = el.querySelector('[data-acoustid="lancer"]');
    expect(rangee, 'aucune rangée AcoustID').not.toBeNull();
    expect(rangee!.textContent).toContain(fr['acoustid.launch']);
    boutonAcoustid(el)!.click();
    await attendre(10);
    const posts = requetes.filter((r) => r.methode === 'POST' && r.chemin.endsWith('/library/identify-all'));
    expect(posts).toHaveLength(1);
    expect(posts[0].query).toBe('mode=acoustid');
    expect(el.querySelector('[data-acoustid="refus"]')).toBeNull();
  });

  it('🔴 un 409 fpcalc_absent : le motif est dit, dans la langue de l’écran', async () => {
    lancement = {
      status: 409,
      corps: { code: 'fpcalc_absent', error: 'fpcalc_absent', message: 'texte serveur', setting_key: 'acoustid_api_key' },
    };
    const el = await monterReglages('settings.tabLibrary');
    // Indisponible : le motif est déjà sous le bouton…
    expect(el.querySelector('[data-acoustid="motif"]')!.textContent).toContain(fr['acoustid.reasonFpcalc']);
    boutonAcoustid(el)!.click();
    await attendre(10);
    // … et le refus du serveur est dit après le clic.
    const refus = el.querySelector('[data-acoustid="refus"]');
    expect(refus, 'le 409 n’est pas affiché').not.toBeNull();
    expect(refus!.textContent).toContain(fr['acoustid.reasonFpcalc']);
    expect(boutonAcoustid(el)!.disabled).toBe(false);
  });

  it('un 409 au motif inconnu de ce client : le message du serveur', async () => {
    bloc = { ...bloc, available: true, fpcalc: true, api_key_configured: true, reason: null };
    lancement = { status: 409, corps: { code: 'motif_futur', message: 'Message du serveur.' } };
    const el = await monterReglages('settings.tabLibrary');
    boutonAcoustid(el)!.click();
    await attendre(10);
    expect(el.querySelector('[data-acoustid="refus"]')!.textContent).toContain('Message du serveur.');
  });

  it('contre-épreuve : serveur sans le bloc, aucun bouton', async () => {
    bloc = undefined;
    const el = await monterReglages('settings.tabLibrary');
    // La section est bien là (le bouton des crédits y est)…
    expect(el.textContent).toContain(fr['settings.credits']);
    // … mais pas la rangée AcoustID.
    expect(el.querySelector('[data-acoustid="lancer"]')).toBeNull();
    expect(requetes.some((r) => r.query.includes('mode=acoustid'))).toBe(false);
  });
});

// ── Réglages : la clé ──────────────────────────────────────────────────────

describe('Réglages — la clé AcoustID (#5868)', () => {
  it('🔴 configurée : le champ reste VIDE, jamais pré-rempli du masque', async () => {
    bloc = { ...bloc, api_key_configured: true, fpcalc: true, available: true, reason: null };
    const el = await monterReglages('settings.tabAccess');
    const carte = el.querySelector('[data-acoustid="cle"]');
    expect(carte, 'aucune carte de clé AcoustID').not.toBeNull();
    const champ = carte!.querySelector('input') as HTMLInputElement;
    expect(champ.type).toBe('password');
    expect(champ.value).toBe('');
    expect(champ.placeholder).toBe(fr['serviceTokens.configuredPlaceholder']);
    expect(carte!.textContent).not.toContain('********');
  });

  it('enregistrer envoie PATCH /system/config avec la clé tapée, et vide le champ', async () => {
    bloc = { ...bloc, fpcalc: true, reason: 'acoustid_cle_absente' };
    const el = await monterReglages('settings.tabAccess');
    const carte = el.querySelector('[data-acoustid="cle"]')!;
    const champ = carte.querySelector('input') as HTMLInputElement;
    champ.value = 'ma-cle';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    (carte.querySelector('button') as HTMLButtonElement).click();
    await attendre(10);
    // D'autres réglages de l'onglet peuvent écrire leur propre PATCH : on ne
    // lit que ceux qui portent la clé.
    const patch = requetes.filter(
      (r) => r.methode === 'PATCH' && r.chemin.endsWith('/system/config') && (r.corps ?? '').includes('acoustid'),
    );
    expect(patch).toHaveLength(1);
    expect(JSON.parse(patch[0].corps!)).toEqual({ acoustid_api_key: 'ma-cle' });
    expect((el.querySelector('[data-acoustid="cle"] input') as HTMLInputElement).value).toBe('');
  });

  it('contre-épreuve : un champ vide n’envoie rien (il effacerait la clé)', async () => {
    bloc = { ...bloc, api_key_configured: true };
    const el = await monterReglages('settings.tabAccess');
    (el.querySelector('[data-acoustid="cle"] button') as HTMLButtonElement).click();
    await attendre(10);
    expect(requetes.some((r) => r.methode === 'PATCH' && (r.corps ?? '').includes('acoustid'))).toBe(false);
  });

  it('contre-épreuve : serveur sans le bloc, aucun champ', async () => {
    bloc = undefined;
    const el = await monterReglages('settings.tabAccess');
    expect(el.querySelector('[data-acoustid="cle"]')).toBeNull();
  });
});

// ── La lecture, sans écran ────────────────────────────────────────────────

describe('lib/acoustid — lecture des réponses', () => {
  it('un instantané sans bloc, ou un bloc mal formé, rend null', () => {
    expect(lireBlocAcoustid({ tasks: [] })).toBeNull();
    expect(lireBlocAcoustid({ tasks: [], acoustid: { reason: 'x' } })).toBeNull();
    expect(lireBlocAcoustid(null)).toBeNull();
    expect(carteAcoustid(null, null, tr)).toBeNull();
  });

  it('202 started : lancé, avec le total', () => {
    expect(issueDuLancement({ status: 'started', total: 12 }, tr)).toEqual({ genre: 'lance', total: 12 });
  });

  it('409 : le motif connu prime sur le message du serveur', () => {
    const i = issueDuLancement({ code: 'acoustid_cle_absente', message: 'texte serveur' }, tr);
    expect(i).toEqual({ genre: 'refuse', code: 'acoustid_cle_absente', phrase: fr['acoustid.reasonKey'] });
  });

  it('une passe en pause passe avant la disponibilité', () => {
    const c = carteAcoustid(
      { available: false, reason: 'fpcalc_absent' },
      { status: 'paused', mode: 'acoustid', total: 9, traites: 4 },
      tr,
    );
    expect(c!.ligne).toBe(fr['acoustid.paused'].replace('{n}', '4').replace('{total}', '9'));
  });
});
