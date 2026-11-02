// @vitest-environment jsdom
//
// tune-server-rust#7128 — Rob Sykes (r5yk5), fil 2465 : dans Oxygen, filtrer
// « Genre = Jazz ET Genre = Vocal », puis appliquer le tag « Vocal Jazz » à
// TOUT le résultat, au-delà de la page affichée, en un geste.
//
// Ces témoins montent le vrai composant et regardent ce qui part au serveur :
// les FILTRES (jamais une liste d'identifiants), l'aperçu avant confirmation,
// puis le toast. Et, en contre-épreuve : face à un serveur d'avant (404) ou
// sans filtre posé, le bouton n'existe pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import OxygenEtiquetageFiltre from '../../components/v2-heritage/OxygenEtiquetageFiltre.svelte';
import {
  etiquetageParFiltreDisponible, filtreActif, oublierLaSonde, parametresDuFiltre,
} from '../etiquetageParFiltre';
import { notifications } from '../stores/notifications';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

const FILTRE_ROB = { genre: ['Jazz', 'Vocal'], all_of: ['genre'] };

interface Appel { url: string; method: string; body: unknown }
let appels: Appel[] = [];
let serveurAncien = false;
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

function reponse(corps: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

const respirer = async () => {
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); }
};

beforeEach(() => {
  locale.set('fr');
  appels = [];
  serveurAncien = false;
  oublierLaSonde();
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: RequestInit) => {
    const url = String(entree);
    const method = init?.method ?? 'GET';
    appels.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (/\/library\/tag-by-filter/.test(url)) {
      if (serveurAncien) return reponse({ error: 'not found' }, 404);
      const q = new URL(url, 'http://tune.local').searchParams;
      const filtre = [...q.keys()].some((k) => k !== 'all_of' && k !== 'item_type');
      if (!filtre) return reponse({ error: 'no active filter', code: 'empty_filter' }, 400);
      if (method === 'POST') return reponse({ tag_id: 4, item_type: 'track', removed: false, matched: 1234, changed: 1234 });
      return reponse({ item_type: q.get('item_type'), count: q.get('item_type') === 'album' ? 87 : 1234, limit: 20000, over_limit: false });
    }
    if (/\/tags\/?(\?|$)/.test(url)) return reponse([{ id: 4, name: 'Vocal Jazz', color: '#808080' }]);
    return reponse({});
  }));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

async function monter(props: Record<string, unknown>) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OxygenEtiquetageFiltre, { target: hote, props: props as never });
  await respirer();
  return hote;
}

const bouton = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

describe('#7128 — les filtres, pas les identifiants', () => {
  it('la chaîne de requête répète la clé, comme /library/tracks', () => {
    expect(parametresDuFiltre(FILTRE_ROB).toString()).toBe('genre=Jazz&genre=Vocal&all_of=genre');
  });
  it('🔴 un filtre vide (ou l’opérateur seul) n’est pas actif', () => {
    expect(filtreActif({})).toBe(false);
    expect(filtreActif({ all_of: ['genre'] })).toBe(false);
    expect(filtreActif({ genre: [] })).toBe(false);
    expect(filtreActif(FILTRE_ROB)).toBe(true);
  });
});

describe('#7128 — la sonde du serveur', () => {
  it('400 empty_filter : la route existe', async () => {
    expect(await etiquetageParFiltreDisponible()).toBe(true);
  });
  it('🔴 404 (serveur d’avant) : pas de route', async () => {
    serveurAncien = true;
    expect(await etiquetageParFiltreDisponible()).toBe(false);
  });
});

describe('#7128 — Tout sélectionner, puis Appliquer un tag…', () => {
  it('🔴 le geste complet : aperçu, confirmation, POST des filtres, toast', async () => {
    const vus: string[] = [];
    const desabo = notifications.subscribe((l) => { for (const n of l) vus.push(n.message); });
    await monter({ filtres: FILTRE_ROB, cibleParDefaut: 'track', nombre: 1234 });

    const tout = bouton('oxy-select-all');
    expect(tout, 'le bouton « Tout sélectionner » est absent').not.toBeNull();
    expect(tout!.textContent).toContain('1');
    expect(tout!.textContent).toContain('234');
    tout!.click();
    await respirer();
    bouton('oxy-apply-tag')!.click();
    await respirer();

    const apercu = document.querySelector('[data-testid="oxy-preview"]')!;
    expect(apercu.textContent).toMatch(/1[\s,.  ]?234 morceaux seront tagués/);
    const confirmer = bouton('oxy-confirm-tag')!;
    expect(confirmer.disabled, 'confirmer sans tag choisi').toBe(true);

    const choix = document.querySelector<HTMLSelectElement>('[data-testid="oxy-tag-choice"]')!;
    choix.value = '4';
    choix.dispatchEvent(new Event('change'));
    await respirer();
    expect(confirmer.disabled).toBe(false);
    confirmer.click();
    await respirer();

    const post = appels.find((a) => a.method === 'POST' && a.url.includes('/library/tag-by-filter'));
    expect(post, 'aucun POST d’étiquetage').toBeDefined();
    expect(new URL(post!.url, 'http://tune.local').search).toBe('?genre=Jazz&genre=Vocal&all_of=genre');
    expect(post!.body).toEqual({ tag_id: 4, item_type: 'track', remove: false });
    expect(JSON.stringify(post!.body)).not.toContain('item_ids');
    expect(vus.some((m) => m.includes('Vocal Jazz') && /1[\s,.  ]?234/.test(m)), `toast : ${vus.join(' | ')}`).toBe(true);
    expect(document.querySelector('[role="dialog"]'), 'le dialogue reste ouvert').toBeNull();
    desabo();
  });

  it('vue cartes : la cible par défaut est l’album', async () => {
    await monter({ filtres: FILTRE_ROB, cibleParDefaut: 'album', nombre: 87 });
    bouton('oxy-select-all')!.click();
    await respirer();
    bouton('oxy-apply-tag')!.click();
    await respirer();
    const previsu = appels.filter((a) => a.url.includes('/preview?genre='));
    expect(previsu.at(-1)!.url).toContain('item_type=album');
    expect(document.querySelector('[data-testid="oxy-preview"]')!.textContent).toContain('87 albums seront tagués');
  });

  it('🔴 contre-épreuve : serveur d’avant (404), pas de bouton', async () => {
    serveurAncien = true;
    await monter({ filtres: FILTRE_ROB, cibleParDefaut: 'track', nombre: 1234 });
    expect(bouton('oxy-select-all')).toBeNull();
  });

  it('🔴 contre-épreuve : sans filtre, pas de bouton (jamais « tout taguer »)', async () => {
    await monter({ filtres: {}, cibleParDefaut: 'track', nombre: 46877 });
    expect(bouton('oxy-select-all')).toBeNull();
    expect(appels.some((a) => a.method === 'POST')).toBe(false);
  });
});
