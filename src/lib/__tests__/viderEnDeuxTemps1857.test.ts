// @vitest-environment jsdom
/**
 * web#1857 — « Vider » en DEUX TEMPS (Didier, fil forum 2067).
 *
 * Premier appui : la suite part, la lecture continue (règle du 20/09/2026,
 * gardée par `viderLaFileNeCoupePas.test.ts`). Second appui — c'est-à-dire
 * dès que plus rien ne SUIT le morceau en cours — : la lecture s'arrête et le
 * morceau est retiré. Avant ce correctif, ce second appui refaisait
 * `keep_current` sur une file sans suite : il ne faisait rien.
 *
 * On monte le VRAI écran et on lit les requêtes RÉELLEMENT parties vers un
 * faux serveur dont la file évolue comme celle du vrai.
 *
 * ## Contre-épreuve, mesurée
 *
 *  1. `gesteVider` qui rend toujours `'suite'` (l'ancien comportement) ⇒
 *     les cas « second appui », « libellé » et « fin de file » tombent ;
 *  2. `executerVider` sans `stopAndSync` ⇒ « l'arrêt part » tombe ;
 *  3. `gesteVider` jugé sur `longueur === 1` au lieu du curseur ⇒ le cas
 *     « pistes déjà jouées » tombe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { currentZoneId, zones } from '../stores/zones';
import { queueTracks, queuePosition } from '../stores/queue';
import { gesteVider } from '../viderFile';
import type { Track, Zone } from '../types';
import QueueV2 from '../../components/v2/QueueV2.svelte';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

const DELAI_MONTAGE = 60_000;
const ZONE = 22;

function piste(id: number): Track {
  return { id, title: `Piste ${id}`, artist_name: 'X', duration_ms: 1000 } as Track;
}

/** L'état du faux serveur : il applique `keep_current` comme le vrai. */
let file: { tracks: Track[]; position: number };
let appels: { url: string; body: unknown }[];

function serveur() {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    appels.push({ url, body });
    const json = (o: unknown) => new Response(JSON.stringify(o), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
    if (/\/queue\/clear$/.test(url)) {
      if ((body as any)?.keep_current) file = { tracks: file.tracks.slice(0, file.position + 1), position: file.position };
      else file = { tracks: [], position: 0 };
      return new Response(null, { status: 204 });
    }
    if (/\/queue$/.test(url)) return json(file);
    if (/\/stop$/.test(url)) return json({ id: ZONE, name: 'Salon', state: 'stopped' });
    return json({});
  }));
}

const vidages = () => appels.filter((a) => /\/queue\/clear$/.test(a.url));
const arrets = () => appels.filter((a) => /\/stop$/.test(a.url));

let cible: HTMLElement;
let monte: Record<string, any> | null = null;

function poser(tracks: Track[], position: number) {
  file = { tracks, position };
  queueTracks.set(tracks);
  queuePosition.set(position);
}

async function ecran() {
  monte = mount(QueueV2, { target: cible, props: {} });
  flushSync();
  await vi.waitFor(() => expect(cible.querySelector('.v2-actions')).toBeTruthy());
  return cible;
}

function boutonVider(): HTMLButtonElement {
  const b = cible.querySelector<HTMLButtonElement>('.v2-actions button.danger');
  if (!b) throw new Error('pas de bouton Vider');
  return b;
}

beforeEach(() => {
  serveur();
  currentZoneId.set(ZONE);
  zones.set([{ id: ZONE, name: 'Salon', state: 'playing' } as Zone]);
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

describe('la règle — sur l\'ÉTAT de la file, pas sur un délai', () => {
  it('quelque chose suit ⇒ « suite » ; plus rien ne suit ⇒ « tout » ; file vide ⇒ rien', () => {
    expect(gesteVider(3, 0)).toBe('suite');
    expect(gesteVider(3, 1)).toBe('suite');
    expect(gesteVider(3, 2)).toBe('tout');
    expect(gesteVider(1, 0)).toBe('tout');
    expect(gesteVider(0, 0)).toBeNull();
  });

  it('🔴 jugé sur le CURSEUR : des pistes déjà jouées restent avant lui après un premier appui', () => {
    // `keep_current` garde la piste en cours ET ce qui la précède (#4170).
    expect(gesteVider(4, 3)).toBe('tout');
  });

  it('un curseur absent ou négatif vaut le début de la file', () => {
    expect(gesteVider(2, -1)).toBe('suite');
    expect(gesteVider(2, Number.NaN)).toBe('suite');
  });
});

describe('QueueV2 — deux appuis sur le même bouton', () => {
  it('🔴 premier appui : la suite part, pas d\'arrêt ; second appui : arrêt et file vidée', { timeout: DELAI_MONTAGE }, async () => {
    poser([piste(1), piste(2), piste(3)], 0);
    await ecran();
    expect(boutonVider().textContent?.trim()).toBe('Vider la file');

    boutonVider().click();
    await vi.waitFor(() => expect(vidages()).toHaveLength(1));
    expect(vidages()[0].body).toEqual({ keep_current: true });
    expect(arrets()).toHaveLength(0);

    // La file relue ne garde que le morceau en cours : le bouton l'annonce.
    await vi.waitFor(() => expect(boutonVider().textContent?.trim()).toBe('Arrêter et vider'));
    expect(boutonVider().title).toBe('Plus rien ne suit : arrête la lecture et retire la piste en cours.');

    boutonVider().click();
    await vi.waitFor(() => expect(vidages()).toHaveLength(2));
    expect(arrets()).toHaveLength(1);
    // Le second vidage part SANS keep_current : le serveur arrête et retire tout.
    expect(vidages()[1].body).toBeUndefined();
    // L'arrêt part AVANT le vidage complet.
    expect(appels.findIndex((a) => /\/stop$/.test(a.url)))
      .toBeLessThan(appels.findIndex((a, i) => i > 0 && /\/queue\/clear$/.test(a.url) && a.body === undefined));
    // La file vide fait disparaître le bouton.
    await vi.waitFor(() => expect(cible.querySelector('.v2-actions button.danger')).toBeNull());
  });

  it('en fin de file (dernière piste en cours), le PREMIER appui est déjà le second temps', { timeout: DELAI_MONTAGE }, async () => {
    poser([piste(1), piste(2)], 1);
    await ecran();
    expect(boutonVider().textContent?.trim()).toBe('Arrêter et vider');
    boutonVider().click();
    await vi.waitFor(() => expect(vidages()).toHaveLength(1));
    expect(vidages()[0].body).toBeUndefined();
    expect(arrets()).toHaveLength(1);
  });

  it('tant que quelque chose suit, l\'infobulle annonce le second temps', { timeout: DELAI_MONTAGE }, async () => {
    poser([piste(1), piste(2)], 0);
    await ecran();
    expect(boutonVider().title).toContain('un nouvel appui arrête la lecture');
  });
});

describe('les 11 langues portent les deux libellés', () => {
  const dicos = ONZE_LANGUES.map((c) => [c, dictionnaire(c)] as const);

  it('chaque dictionnaire a « Arrêter et vider » et son infobulle, distincts de la première', () => {
    expect(dicos).toHaveLength(11);
    for (const [nom, d] of dicos) {
      expect(d['queue.clearAllLabel'], nom).toBeTruthy();
      expect(d['queue.clearAllTip'], nom).toBeTruthy();
      expect(d['queue.clearAllTip'], nom).not.toBe(d['queue.clearTip']);
      expect(d['queue.clearAllLabel'], nom).not.toBe(d['v2.queue.clear']);
    }
  });
});
