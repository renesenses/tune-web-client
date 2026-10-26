// @vitest-environment jsdom
//
// web#2145 — Tades, fil 2245 (Tune OS, rc4) : « toujours aucune piste
// apparente alors que j'ai relancé plusieurs fois "rescanner" ».
//
// Le serveur refuse tout scan pendant qu'un autre tourne : POST /system/scan
// rend 409 `{"status":"already_scanning"}`. `rescanFolder` (Répertoires)
// avalait ce refus dans un `console.error` : le bouton se réactivait, le
// dossier était relu tel quel, et rien ne disait pourquoi.
//
// On monte le VRAI écran Répertoires, on entre dans un dossier, on clique
// « Rescanner » contre un serveur simulé qui refuse en 409.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import BrowseView from '../../components/v2-heritage/BrowseView.svelte';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const RACINE = { name: 'Musique', path: '/music', track_count: 0, exists: true };
let reponseScan: { status: number; corps: unknown } = { status: 409, corps: { status: 'already_scanning', scanning: true } };
let scans = 0;

function repondre(url: string, init?: RequestInit) {
  const u = new URL(url, 'http://localhost');
  const p = u.pathname.replace(/^\/api\/v1/, '');
  let status = 200;
  let corps: unknown = {};
  if (p === '/library/browse') corps = { roots: [RACINE] };
  else if (p === '/library/browse/dir') corps = { path: '/music', parent: null, music_root: '/music', directories: [], tracks: [], accessible: true };
  else if (p === '/system/scan' && init?.method === 'POST') { scans++; ({ status, corps } = reponseScan); }
  else if (p === '/system/scan/status') corps = { scanning: false };
  return {
    ok: status < 400, status, statusText: status === 409 ? 'Conflict' : 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
    clone() { return this; },
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendreQue(cond: () => boolean, quoi: string, ms = 4_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fin) throw new Error(`jamais atteint : ${quoi}`);
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
}

const boutonRescan = () =>
  [...hote!.querySelectorAll<HTMLButtonElement>('.rescan-btn')].find((b) => b.textContent?.includes('Rescanner'));
const erreurs = () => get(notifications).filter((n) => n.level === 'error').map((n) => n.message);

beforeEach(async () => {
  scans = 0;
  try { localStorage.clear(); } catch { /* jsdom sans stockage */ }
  for (const n of get(notifications)) notifications.dismiss(n.id);
  locale.set('fr');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => repondre(String(url), init)));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(BrowseView, { target: hote, props: {} });
  flushSync();
  // L'écran peut rouvrir le dernier dossier visité : on part de là où il est.
  await attendreQue(() => !!hote!.querySelector('.root-item') || !!boutonRescan(), 'l\'écran Répertoires');
  if (!boutonRescan()) {
    hote!.querySelector<HTMLButtonElement>('.root-item')!.click();
    flushSync();
  }
  await attendreQue(() => !!boutonRescan(), 'le bouton Rescanner du dossier');
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('web#2145 — « Rescanner » refusé pendant une analyse le dit', () => {
  it('🔴 409 already_scanning : un message nomme l\'analyse en cours', async () => {
    boutonRescan()!.click();
    await attendreQue(() => erreurs().length > 0, 'un message');
    expect(erreurs().join(' | ')).toContain('déjà en cours');
    await attendreQue(() => !boutonRescan()!.disabled, 'le bouton réactivé');
  });

  it('un autre échec le dit aussi, le motif du serveur replié (#2417)', async () => {
    reponseScan = { status: 400, corps: { error: 'chemin hors bibliothèque' } };
    boutonRescan()!.click();
    await attendreQue(() => erreurs().length > 0, 'un message');
    expect(erreurs().join(' | ')).not.toContain('chemin hors bibliothèque');
    // #2417 — le motif part au « Détails » replié du bandeau.
    expect(get(notifications).map((n) => n.detail ?? '').join(' | ')).toContain('chemin hors bibliothèque');
    reponseScan = { status: 409, corps: { status: 'already_scanning', scanning: true } };
  });

  it('un rescan accepté ne montre aucune erreur', async () => {
    reponseScan = { status: 202, corps: { status: 'scanning' } };
    boutonRescan()!.click();
    await attendreQue(() => scans === 1, 'l\'envoi du scan');
    await new Promise((r) => setTimeout(r, 2_300));
    flushSync();
    expect(erreurs()).toEqual([]);
    reponseScan = { status: 409, corps: { status: 'already_scanning', scanning: true } };
  });
});

describe('web#2145 — un dossier sans piste en base ne se dit plus simplement « vide »', () => {
  it('🔴 « Aucune piste » explique que seules les pistes analysées s\'affichent, et que « Rescanner » les analyse', async () => {
    await attendreQue(() => !!hote!.querySelector('[data-aucune-piste]'), 'le dossier vide');
    const texte = hote!.querySelector('[data-aucune-piste]')!.textContent ?? '';
    expect(texte).toContain('Aucune piste dans ce répertoire');
    expect(texte).toContain('déjà analysées');
    expect(texte).toContain('« Rescanner »');
  });
});
