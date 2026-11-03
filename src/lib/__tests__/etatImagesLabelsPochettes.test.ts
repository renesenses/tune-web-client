// @vitest-environment jsdom
//
// Écran « État du serveur » (Bertrand, 01/11/2026) — les LOGOS DE LABELS et
// les POCHETTES D'ALBUMS : combien ont une image sur le total, combien
// manquent, la passe en cours et sa progression, la dernière passe et son
// bilan, et un bouton « Lancer la passe » désactivé tant qu'une passe tourne.
//
// Contrat serveur lu sur le lot rc10 de tune-server-rust (PR de la même
// demande) : `GET /library/artwork/enrich/status` (`albums_total`,
// `albums_with_cover`, `running`, `progress`, `result.finished_at`),
// `GET /library/labels/logos/status`, `POST /library/labels/logos/enrich`
// (202 / 409 `already_running` / 200 `skipped`).
//
// Contre-épreuve : sans les deux cartes dans `TuneHealthV2.svelte`, les tests
// 🔴 « écran monté » tombent (aucune carte, aucun bouton, aucun POST).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
  };
});

import TuneHealthV2 from '../../components/v2/TuneHealthV2.svelte';
import { preferences } from '../stores/preferences';
import { tachesDeFond as magasinTaches } from '../stores/tachesDeFond';
import { carteLogosLabels, cartePochettesAlbums, boutonPasseActif, type OutilsCarte } from '../santeImages';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

const outils: OutilsCarte = {
  t: (k) => fr[k] ?? k,
  nombre: (n) => String(n),
  date: () => 'DATE',
};

describe('lecture des statuts (santeImages)', () => {
  it('pochettes : couverture au repos, bilan de la dernière passe daté', () => {
    const c = cartePochettesAlbums({
      albums_total: 3844, albums_with_cover: 3795, albums_without_cover: 49, running: false,
      result: { total: 53, enriched: 4, failed: 49, status: 'done', finished_at: 1793525105 },
    }, outils);
    expect(c.etat).toBe('done');
    expect(c.ligne).toBe(fr['v2.health.albumCoversLine'].replace('{a}', '3795').replace('{t}', '3844').replace('{m}', '49'));
    expect(c.fait).toBe(3795);
    expect(c.total).toBe(3844);
    expect(c.detail).toBe(fr['v2.health.albumCoversLast'].replace('{d}', 'DATE').replace('{f}', '4').replace('{t}', '53'));
  });

  it('pochettes : pendant la passe, la jauge et la ligne disent la passe', () => {
    const c = cartePochettesAlbums({
      albums_total: 10, albums_with_cover: 6, albums_without_cover: 4, running: true,
      progress: { processed: 1, total: 4 },
      result: { total: 4, enriched: 0, status: 'running' },
    }, outils);
    expect(c.etat).toBe('running');
    expect(c.fait).toBe(1);
    expect(c.total).toBe(4);
    expect(c.detail).toBe(fr['v2.health.imagesPassRunning'].replace('{n}', '1').replace('{t}', '4'));
  });

  it('pochettes : serveur d’avant (ni total ni `running`) — pas de chiffre inventé', () => {
    const c = cartePochettesAlbums({ albums_without_cover: 49, result: { total: 53, enriched: 4, failed: 49 } }, outils);
    expect(c.ligne).toBe(fr['v2.health.albumCoversMissingOnly'].replace('{m}', '49'));
    expect(c.sansJauge).toBe(true);
    expect(c.fait).toBeUndefined();
    // Un `result.status` resté à `running` après un arrêt brutal ne fait
    // pas une passe en cours : seul `running` le dit.
    expect(cartePochettesAlbums({ albums_without_cover: 1, result: { total: 1, status: 'running' } }, outils).etat).toBe('idle');
  });

  it('logos : comptes, passe en cours, bilan, route absente', () => {
    const repos = carteLogosLabels({ labels_total: 338, with_logo: 133, without_logo: 205, running: false, last_run: null }, outils);
    expect(repos.etat).toBe('idle');
    expect(repos.ligne).toBe(fr['v2.health.labelLogosLine'].replace('{a}', '133').replace('{t}', '338').replace('{m}', '205'));
    expect(repos.detail).toBe(fr['v2.health.coversNone']);

    const enCours = carteLogosLabels({ labels_total: 338, with_logo: 140, running: true, progress: { processed: 7, total: 205 } }, outils);
    expect(enCours.etat).toBe('running');
    expect([enCours.fait, enCours.total]).toEqual([7, 205]);

    const fin = carteLogosLabels({
      labels_total: 338, with_logo: 145, without_logo: 193, running: false,
      last_run: { to_process: 205, processed: 205, found: 12, finished_at: 1 },
    }, outils);
    expect(fin.etat).toBe('done');
    expect(fin.detail).toBe(fr['v2.health.labelLogosLast'].replace('{d}', 'DATE').replace('{f}', '12').replace('{t}', '205'));

    expect(carteLogosLabels(null, outils).etat).toBe('inconnu');
  });

  it('le bouton n’est cliquable qu’au repos ou terminé, hors lancement en vol', () => {
    expect(boutonPasseActif({ etat: 'idle' }, false)).toBe(true);
    expect(boutonPasseActif({ etat: 'done' }, false)).toBe(true);
    expect(boutonPasseActif({ etat: 'running' }, false)).toBe(false);
    expect(boutonPasseActif({ etat: 'inconnu' }, false)).toBe(false);
    expect(boutonPasseActif({ etat: 'idle' }, true)).toBe(false);
  });
});

// ── L'écran monté ──────────────────────────────────────────────────────────

let statutPochettes: unknown;
let statutLogos: unknown;
let statutLogosCode: number;
let reponseLancementLogos: { corps: unknown; code: number };
const postes: string[] = [];

const VIDE = /\/(zones|devices|profiles|shortcuts|collections|service-tokens)(\?|\/|$)/;
function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}
function repondre(chemin: string, methode: string): Response {
  if (methode === 'POST') {
    postes.push(chemin);
    if (chemin.endsWith('/library/labels/logos/enrich')) return json(reponseLancementLogos.corps, reponseLancementLogos.code);
    if (chemin.endsWith('/library/artwork/enrich')) return json({ status: 'accepted', albums_to_process: 4 }, 202);
    return json({});
  }
  if (chemin.endsWith('/library/artwork/enrich/status')) return json(statutPochettes);
  if (chemin.endsWith('/library/labels/logos/status')) return json(statutLogos ?? { error: 'not found' }, statutLogosCode);
  if (chemin.endsWith('/system/background-tasks')) return json({ tasks: [], pausable: [], all_paused: false });
  if (chemin.includes('/system/scan/status')) return json({ scanning: false });
  if (VIDE.test(chemin)) return json([]);
  return json({});
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  postes.length = 0;
  statutPochettes = {
    albums_total: 3844, albums_with_cover: 3795, albums_without_cover: 49, running: false,
    result: { total: 53, enriched: 4, failed: 49, status: 'done', finished_at: 1793525105 },
  };
  statutLogos = { labels_total: 338, with_logo: 133, without_logo: 205, running: false, last_run: null };
  statutLogosCode = 200;
  reponseLancementLogos = { corps: { status: 'accepted', labels_to_process: 205 }, code: 202 };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const brut = String(typeof url === 'string' ? url : (url?.url ?? ''));
    return repondre(brut.replace(/^https?:\/\/[^/]+/, '').split('?')[0], (init?.method ?? 'GET').toUpperCase());
  }));
  magasinTaches.set([]);
  preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  magasinTaches.set([]);
  vi.unstubAllGlobals();
});

async function attendre() {
  await new Promise((r) => setTimeout(r, 120));
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
}
async function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(TuneHealthV2, { target: hote });
  flushSync();
  await attendre();
  return hote;
}
const carte = (titre: string) =>
  (Array.from(hote!.querySelectorAll('article.card')) as HTMLElement[])
    .find((c) => c.querySelector('h2')?.textContent?.trim() === titre) ?? null;
const bouton = (id: string) => hote!.querySelector(`[data-lancer-passe="${id}"]`) as HTMLButtonElement | null;

describe('écran monté — cartes et bouton « Lancer la passe »', () => {
  it('🔴 les deux cartes disent la couverture et portent un bouton actif au repos', async () => {
    await monter();
    const p = carte(fr['v2.health.cardAlbumCovers']);
    const l = carte(fr['v2.health.cardLabelLogos']);
    expect(p, 'aucune carte « Pochettes d’albums »').not.toBeNull();
    expect(l, 'aucune carte « Logos des labels »').not.toBeNull();
    const ligne = (c: HTMLElement) => c.querySelector('.line')!.textContent!.replace(/[\s  .,']/g, '');
    expect(ligne(p!)).toMatch(/3795.*3844.*49/);
    expect(ligne(l!)).toMatch(/133.*338.*205/);
    expect(bouton('albumCovers')?.disabled).toBe(false);
    expect(bouton('labelLogos')?.disabled).toBe(false);
    expect(bouton('labelLogos')?.textContent?.trim()).toBe(fr['v2.health.launchPass']);
  });

  it('🔴 le clic lance la passe des logos par sa route', async () => {
    await monter();
    bouton('labelLogos')!.click();
    await attendre();
    expect(postes).toContain('/api/v1/library/labels/logos/enrich');
    bouton('albumCovers')!.click();
    await attendre();
    expect(postes).toContain('/api/v1/library/artwork/enrich');
  });

  it('🔴 pendant une passe, le bouton est désactivé et l’avancement affiché', async () => {
    statutLogos = { labels_total: 338, with_logo: 140, without_logo: 198, running: true, progress: { processed: 7, total: 205 } };
    await monter();
    const l = carte(fr['v2.health.cardLabelLogos'])!;
    expect(bouton('labelLogos')!.disabled).toBe(true);
    expect(l.textContent).toContain(fr['v2.health.imagesPassRunning'].replace('{n}', '7').replace('{t}', '205'));
    expect(l.querySelector('.bar')).not.toBeNull();
    // L'autre carte, au repos, garde son bouton actif.
    expect(bouton('albumCovers')!.disabled).toBe(false);
  });

  it('un 409 `already_running` n’est pas une panne', async () => {
    reponseLancementLogos = { corps: { status: 'already_running' }, code: 409 };
    await monter();
    bouton('labelLogos')!.click();
    await attendre();
    expect(postes).toContain('/api/v1/library/labels/logos/enrich');
    // L'écran est toujours là, carte comprise.
    expect(carte(fr['v2.health.cardLabelLogos'])).not.toBeNull();
  });

  it('serveur sans la route des logos (404) : carte « inconnu », sans bouton', async () => {
    statutLogos = null;
    statutLogosCode = 404;
    await monter();
    const l = carte(fr['v2.health.cardLabelLogos'])!;
    expect(l.textContent).toContain(fr['v2.health.unavailable']);
    expect(bouton('labelLogos')).toBeNull();
  });
});
