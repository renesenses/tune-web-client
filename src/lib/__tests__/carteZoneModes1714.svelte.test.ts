// @vitest-environment jsdom
/**
 * tune-web-client#1714 — aléatoire et boucle sur la carte de zone de la
 * première ligne de l'Accueil.
 *
 * `GET /zones` porte `shuffle` et `repeat` par zone. La carte doit :
 *   1. montrer les deux boutons AVEC l'état dit par le serveur ;
 *   2. ne rien montrer quand le serveur (plus ancien) ne dit rien — un bouton
 *      « éteint » par défaut mentirait ;
 *   3. écrire sur LA zone de la carte, dans la bonne direction.
 *
 * Ce banc monte la vraie carte et clique ; il ne lit pas le source.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, tick } from 'svelte';
import { get } from 'svelte/store';
import CarteZoneL1 from '../../components/v2/ligne1/CarteZoneL1.svelte';
import { zones } from '../stores/zones';
import { locale } from '../i18n';
import type { Zone } from '../types';

function reponse(corps: unknown): Response {
  const t = JSON.stringify(corps);
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps, text: async () => t,
  } as unknown as Response;
}

let appels: string[] = [];

beforeEach(() => {
  locale.set('fr');
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url, 'http://tune.test');
    if (init?.method === 'POST') appels.push(`${u.pathname}${u.search}`);
    if (u.pathname.endsWith('/shuffle')) return reponse({ shuffle: u.searchParams.get('enabled') === 'true' });
    if (u.pathname.endsWith('/repeat')) return reponse({ repeat: u.searchParams.get('mode') });
    return reponse({});
  }));
});

let cible: HTMLElement | null = null;
let instance: ReturnType<typeof mount> | null = null;
afterEach(() => {
  if (instance) unmount(instance);
  cible?.remove();
  instance = null;
  cible = null;
  zones.set([]);
  vi.unstubAllGlobals();
});

function zoneDe(champs: Partial<Zone>): Zone {
  return {
    id: 7, name: 'Salon', state: 'playing', position_ms: 0,
    current_track: { title: 'Titre', artist_name: 'Artiste', duration_ms: 200_000 } as any,
    ...champs,
  } as Zone;
}

/** Monte la carte sur la zone telle qu'elle est DANS le magasin, et la suit. */
function monter(champs: Partial<Zone>) {
  zones.set([zoneDe(champs)]);
  cible = document.createElement('div');
  document.body.appendChild(cible);
  const props = $state({ zone: get(zones)[0] });
  const desabonner = zones.subscribe((zs) => { if (zs[0]) props.zone = zs[0]; });
  instance = mount(CarteZoneL1, { target: cible, props });
  flushSync();
  return { desabonner };
}

const aleatoire = () => cible!.querySelector<HTMLButtonElement>('button.mode.aleatoire');
const repetition = () => cible!.querySelector<HTMLButtonElement>('button.mode.repetition');

async function attendre() {
  for (let i = 0; i < 5; i++) { await Promise.resolve(); await tick(); }
  flushSync();
}

describe('#1714 — aléatoire et boucle sur la carte de zone', () => {
  it('🔴 montre les deux boutons avec l’état que dit le serveur', () => {
    const { desabonner } = monter({ shuffle: true, repeat: 'one' });
    expect(aleatoire(), 'bouton aléatoire').not.toBeNull();
    expect(aleatoire()!.getAttribute('aria-pressed')).toBe('true');
    expect(aleatoire()!.classList.contains('actif')).toBe(true);
    expect(repetition(), 'bouton boucle').not.toBeNull();
    expect(repetition()!.getAttribute('aria-label')).toBe('Répéter : la piste en cours');
    desabonner();
  });

  it('ne montre RIEN quand le serveur ne dit rien (serveur ancien)', () => {
    const { desabonner } = monter({});
    expect(aleatoire()).toBeNull();
    expect(repetition()).toBeNull();
    desabonner();
  });

  it('🔴 le clic sur aléatoire écrit l’inverse, sur LA zone de la carte', async () => {
    const { desabonner } = monter({ shuffle: false, repeat: 'off' });
    aleatoire()!.click();
    await attendre();
    expect(appels).toEqual(['/api/v1/zones/7/shuffle?enabled=true']);
    expect(get(zones)[0].shuffle).toBe(true);
    expect(aleatoire()!.getAttribute('aria-pressed')).toBe('true');
    desabonner();
  });

  it('🔴 le clic sur boucle fait tourner off → one → all → off', async () => {
    const { desabonner } = monter({ shuffle: false, repeat: 'off' });
    for (const attendu of ['one', 'all', 'off']) {
      repetition()!.click();
      await attendre();
      expect(get(zones)[0].repeat).toBe(attendu);
    }
    expect(appels).toEqual([
      '/api/v1/zones/7/repeat?mode=one',
      '/api/v1/zones/7/repeat?mode=all',
      '/api/v1/zones/7/repeat?mode=off',
    ]);
    desabonner();
  });
});
