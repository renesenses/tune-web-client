// @vitest-environment jsdom
//
// Fil 2204 (Gros Bidon, 1.0.0-rc3) — tune-web-client#2061 : pendant la
// lecture d'un CD, l'écran « Lecture CD » ne distinguait aucune piste.
//
// Contrat serveur (tune-server-rust, plugins/tune-cd/src/fournisseur.rs) :
// une piste de CD jouée porte `now_playing.source = "cd"` et
// `now_playing.source_id = "<disc_id>/<numéro>"`.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LectureCdV2 from '../../components/v2/LectureCdV2.svelte';
import { preparerLocale } from '../i18n';
import { currentZoneId, zones } from '../stores/zones';
import { cdPlugin, numeroPisteCdEnCours } from '../lectureCd';
import type { Zone } from '../types';

const DISC = 'Wn8eRBtfLDfM0qjYPdxrz.Zjs_U-';
const DISQUE = {
  disc_id: DISC, metadonnees: 'musicbrainz', titre: 'The Beatles', artiste: 'The Beatles', pochette: null,
  pistes: [1, 2, 3].map((n) => ({ numero: n, titre: `T${n}`, artiste: 'The Beatles', duree_ms: 1000 })),
};

function reponse(status: number, corps: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

function zone(source: string, sourceId: string | null, state = 'playing'): Zone {
  return { id: 3, name: 'Salon', state, current_track: { title: 'x', source, source_id: sourceId } } as unknown as Zone;
}

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  vi.useFakeTimers();
  cdPlugin.set(null);
  currentZoneId.set(3);
  zones.set([]);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/ext/cd/etat')) return reponse(200, { plateforme_prise_en_charge: true, lecteur: '/dev/sr0', presence: 'disque' });
    if (u.includes('/ext/cd/disque')) return reponse(200, DISQUE);
    if (u.endsWith('/plugins')) return reponse(200, [{ name: 'cd', type: 'sdk', installed: true, enabled: true, compatible: true, description: 'CD', version: '1' }]);
    return reponse(200, {});
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

async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(LectureCdV2 as any, { target: hote });
  for (let i = 0; i < 6; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); }
  return hote;
}

const enCours = (el: HTMLElement) =>
  [...el.querySelectorAll('li.piste')].map((li) => li.classList.contains('en-cours') && li.getAttribute('aria-current') === 'true');

describe('Lecture CD — la piste en cours se voit (fil 2204)', () => {
  it('numeroPisteCdEnCours : seulement une piste « cd » du MÊME disque', () => {
    expect(numeroPisteCdEnCours(zone('cd', `${DISC}/7`).current_track, DISC)).toBe(7);
    expect(numeroPisteCdEnCours(zone('cd', 'autre-disque/7').current_track, DISC)).toBeNull();
    expect(numeroPisteCdEnCours(zone('local', `${DISC}/7`).current_track, DISC)).toBeNull();
    expect(numeroPisteCdEnCours(zone('cd', `${DISC}/x`).current_track, DISC)).toBeNull();
    expect(numeroPisteCdEnCours(null, DISC)).toBeNull();
  });

  it('la ligne de la piste jouée est marquée, et elle seule', async () => {
    zones.set([zone('cd', `${DISC}/2`)]);
    const el = await poser();
    expect(enCours(el)).toEqual([false, true, false]);
    expect(el.querySelector('li.piste.en-cours .num .egaliseur')).not.toBeNull();
  });

  it('elle suit le changement de piste', async () => {
    zones.set([zone('cd', `${DISC}/2`)]);
    const el = await poser();
    zones.set([zone('cd', `${DISC}/3`)]);
    flushSync();
    expect(enCours(el)).toEqual([false, false, true]);
  });

  it('rien n’est marqué quand la zone joue autre chose ou est arrêtée', async () => {
    zones.set([zone('qobuz', '123')]);
    const el = await poser();
    expect(enCours(el)).toEqual([false, false, false]);
    zones.set([zone('cd', `${DISC}/1`, 'stopped')]);
    flushSync();
    expect(enCours(el)).toEqual([false, false, false]);
  });
});
