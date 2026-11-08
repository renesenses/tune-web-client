// @vitest-environment jsdom
/**
 * Le texte brut d'une exception ne se colle plus au message : il part dans
 * le « Détails » replié (`detail`), et le message reste la phrase traduite.
 * Un motif CONNU (erreur passée par `api.ts`, message déjà traduit) est gardé.
 *
 * 1. Le principe, sur `notifierErreur` seul.
 * 2. Le vrai écran de l'arbre des genres, contre un serveur simulé : panne
 *    réseau, refus premium au code traduit, texte brut français du serveur.
 * 3. Un cliquet : la forme `${$t('x')} : ${e?.message || e}` ne revient pas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ArbreDesGenres from '../../components/v2-heritage/GenreTreeView.svelte';
import { notifications } from '../stores/notifications';
import { locale, t } from '../i18n';
import { notifierErreur, messageEtDetail, motifConnu } from '../notifierErreur';
import { messageRefusPremium } from '../premiumRefus';

vi.setConfig({ testTimeout: 30_000 });

function apiErreur(message: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { status: 400, detail: 'HTTP 400 — texte brut', ...extra });
}

beforeEach(() => {
  locale.set('en');
  for (const n of get(notifications)) notifications.dismiss(n.id);
});

describe('notifierErreur : le principe', () => {
  it('panne réseau : la phrase seule, « Failed to fetch » replié', () => {
    notifierErreur('Could not load', new TypeError('Failed to fetch'));
    const [n] = get(notifications);
    expect(n.message).toBe('Could not load');
    expect(n.detail).toBe('Failed to fetch');
  });

  it('erreur locale en français : la phrase seule, le brut replié', () => {
    const r = messageEtDetail('Could not save', new Error('Réglage non enregistré'));
    expect(r.message).toBe('Could not save');
    expect(r.detail).toBe('Réglage non enregistré');
  });

  it('motif connu (api.ts) : gardé, collé à la phrase ; le brut serveur replié', () => {
    const e = apiErreur('The track could not be decoded.', { code: 'track_decode_failed' });
    expect(motifConnu(e)).toBe('The track could not be decoded.');
    const r = messageEtDetail('Playback error', e);
    expect(r.message).toBe('Playback error : The track could not be decoded.');
    expect(r.detail).toBe('HTTP 400 — texte brut');
  });

  it('motifSeul : le motif connu remplace la phrase, comme avant', () => {
    const e = apiErreur('The track could not be decoded.');
    expect(messageEtDetail('Playback error', e, { motifSeul: true }).message).toBe('The track could not be decoded.');
    expect(messageEtDetail('Playback error', new Error('boom'), { motifSeul: true }).message).toBe('Playback error');
  });

  it('le générique, une sentinelle ou un code nu ne sont jamais un motif', () => {
    expect(motifConnu(apiErreur(get(t)('erreursServeur.generique')))).toBeNull();
    expect(motifConnu(apiErreur('Session expired', { status: 401 }))).toBeNull();
    expect(motifConnu(apiErreur('premium_required', { status: 402 }))).toBeNull();
    expect(motifConnu(new Error('sans statut'))).toBeNull();
    expect(motifConnu('chaîne')).toBeNull();
  });

  it('une valeur jetée qui n\'est pas une Error part dans le détail', () => {
    expect(messageEtDetail('Error', 'quelque chose').detail).toBe('quelque chose');
    expect(messageEtDetail('Error', null).detail).toBe('');
  });
});

// ── L'écran réel ────────────────────────────────────────────────────────
let reponse: { status: number; corps: unknown; reseau?: boolean } = { status: 200, corps: {} };
let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function repondre(url: string) {
  const p = new URL(url, 'http://localhost').pathname.replace(/^\/api\/v1/, '');
  const r = p === '/library/genre-tree' ? reponse : { status: 200, corps: [] };
  if (r.reseau) throw new TypeError('Failed to fetch');
  return {
    ok: r.status < 400, status: r.status, statusText: String(r.status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => r.corps, text: async () => JSON.stringify(r.corps),
    clone() { return this; },
  } as unknown as Response;
}

/**
 * La notification de l'ÉCRAN — celle qui commence par sa phrase. Une panne
 * réseau pose aussi le bandeau « serveur injoignable » du client HTTP : ce
 * n'est pas celui qu'on juge ici.
 */
async function attendreNotif(): Promise<{ message: string; detail?: string }> {
  const fin = Date.now() + 4_000;
  const deLEcran = (n: { level: string; message: string }) => n.level === 'error' && n.message.startsWith(get(t)('genreTree.loadError'));
  while (!get(notifications).some(deLEcran)) {
    if (Date.now() > fin) throw new Error('aucune notification d\'erreur');
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
  return get(notifications).find(deLEcran)!;
}

describe('GenreTreeView : échec du chargement', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (u: string) => repondre(String(u))));
    hote = document.createElement('div');
    document.body.appendChild(hote);
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    vi.unstubAllGlobals();
  });

  const phrase = () => get(t)('genreTree.loadError');

  it('panne réseau : la phrase traduite, sans « Failed to fetch » au message', async () => {
    reponse = { status: 0, corps: null, reseau: true };
    monte = mount(ArbreDesGenres, { target: hote! });
    const n = await attendreNotif();
    expect(n.message).toBe(phrase());
    expect(n.message).not.toContain('Failed to fetch');
    expect(n.detail).toContain('Failed to fetch');
  });

  it('texte brut français du serveur : replié, jamais au message', async () => {
    reponse = { status: 500, corps: { error: 'arbre des genres illisible : fichier corrompu' } };
    monte = mount(ArbreDesGenres, { target: hote! });
    const n = await attendreNotif();
    expect(n.message).toBe(phrase());
    expect(n.detail).toContain('arbre des genres illisible');
  });

  it('refus premium (code connu) : sa traduction reste au message', async () => {
    reponse = { status: 402, corps: { code: 'premium_required', message: 'fonction réservée au Premium' } };
    monte = mount(ArbreDesGenres, { target: hote! });
    const n = await attendreNotif();
    const attendu = messageRefusPremium({ code: 'premium_required', message: 'fonction réservée au Premium' } as any);
    expect(attendu).not.toContain('réservée');
    expect(n.message).toBe(`${phrase()} : ${attendu}`);
  });
});

// ── Le cliquet ──────────────────────────────────────────────────────────
describe('cliquet : le brut ne se recolle pas au message', () => {
  const RACINE = resolve(__dirname, '../..');
  const COLLE = /notifications\.error\(\s*`\$\{[^`]*\} : \$\{(?:e|err|error)\??\.message/;
  function* fichiers(d: string): Generator<string> {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== '__tests__') yield* fichiers(p); }
      else if (/\.(svelte|ts)$/.test(f) && !f.includes('.test.')) yield p;
    }
  }
  it('aucune forme `${$t(x)} : ${e?.message…}` dans src', () => {
    const fautes: string[] = [];
    for (const p of fichiers(RACINE)) {
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (COLLE.test(l)) fautes.push(`${p}:${i + 1}`); });
    }
    expect(fautes).toEqual([]);
  });
});
