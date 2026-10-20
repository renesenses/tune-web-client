// @vitest-environment jsdom
//
// tune-server-rust#4805 lot 2 — le composant des passes de lot (BPM, Discogs)
// MONTÉ, avec un `fetch` simulé : ce qui est affiché, et les requêtes qui
// partent vraiment.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

import PassesMetarustV2 from '../../components/v2/PassesMetarustV2.svelte';
import lFr from '../locales/fr';

const fr = lFr as unknown as Record<string, string>;

type Requete = { methode: string; chemin: string };
let requetes: Requete[] = [];
let etats: Record<string, unknown>;
let lancement: { status: number; corps: unknown };

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  etats = {
    bpm: { status: 'idle', mode: 'bpm', total: 0, traites: 0, compte: {}, annonce: {}, raison: null, en_pause: false },
    discogs: { status: 'idle', mode: 'discogs', total: 0, traites: 0, compte: {}, annonce: {}, raison: null, en_pause: false },
  };
  lancement = { status: 202, corps: { status: 'started', total: 3, annonce: {} } };
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
    const chemin = String(typeof url === 'string' ? url : url?.url ?? '').replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const methode = String(init?.method ?? 'GET').toUpperCase();
    requetes.push({ methode, chemin });
    const m = chemin.match(/\/library\/(bpm|discogs)-all(\/status)?$/);
    if (m && m[2]) return json(etats[m[1]]);
    if (m && methode === 'POST') return json(lancement.corps, lancement.status);
    if (chemin.includes('/system/background-tasks/enrichment/')) return json({ tasks: [] });
    return json({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function attendre(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PassesMetarustV2, { target: hote });
  flushSync();
  await attendre();
  return hote;
}

const statuts = () => requetes.filter((r) => r.chemin.endsWith('/status')).length;

describe('Réglages ▸ Enrichissement — passes de lot (#4805 lot 2)', () => {
  it('affiche les deux passes, et ne relit pas l\'état en boucle', async () => {
    const h = await monter();
    expect(h.querySelector('[data-passe="bpm"]')?.textContent).toContain(fr['v2.passes.bpmTitle']);
    expect(h.querySelector('[data-passe="discogs"]')?.textContent).toContain(fr['v2.passes.discogsTitle']);
    // La mention exigée par les conditions de l'API Discogs.
    expect(h.textContent).toContain(fr['v2.passes.discogsNotice']);
    // Un tour de lecture au montage : une requête par passe, pas une boucle.
    await attendre(20);
    expect(statuts()).toBe(2);
  });

  it('une passe en cours montre l\'avancement et « Suspendre », qui suspend l\'enrichissement', async () => {
    etats.bpm = { status: 'running', mode: 'bpm', total: 8, traites: 2, compte: { pistes_signal: 11 }, annonce: {}, raison: null, en_pause: false };
    const h = await monter();
    const ligne = h.querySelector('[data-passe-etat="bpm"]')?.textContent ?? '';
    expect(ligne).toContain('2 album(s) sur 8');
    const bouton = h.querySelector('[data-passe="bpm"] button') as HTMLButtonElement;
    expect(bouton.textContent?.trim()).toBe(fr['v2.passes.pause']);
    bouton.click();
    await attendre();
    expect(requetes.some((r) => r.methode === 'POST' && r.chemin.endsWith('/system/background-tasks/enrichment/pause'))).toBe(true);
  });

  it('sans jeton Discogs, le refus est dit en clair', async () => {
    lancement = { status: 412, corps: { code: 'discogs_token_absent', error: 'discogs_token not configured' } };
    const h = await monter();
    (h.querySelector('[data-passe="discogs"] button') as HTMLButtonElement).click();
    await attendre();
    expect(requetes.some((r) => r.methode === 'POST' && r.chemin.endsWith('/library/discogs-all'))).toBe(true);
    expect(h.querySelector('[data-passe-refus="discogs"]')?.textContent).toBe(fr['v2.discogs.noToken']);
  });
});
