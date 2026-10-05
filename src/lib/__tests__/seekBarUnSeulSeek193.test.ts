// @vitest-environment jsdom
// Ticket 193 — un clic sur la barre de progression n'envoie qu'UN Seek.
//
// Le navigateur produit `mousedown`, `mouseup` puis `click` pour un simple
// clic. `mouseup` (fin d'un glisser de longueur nulle) et `click` appelaient
// chacun `api.seek` à la même position : deux Seek au renderer à ~150 ms.
//
// Contre-épreuve : sans le drapeau `seekEnvoyeAuRelachement`, le cas « un
// clic » compte 2 appels.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Writable } from 'svelte/store';
import SeekBar from '../../components/partages/SeekBar.svelte';
import { currentZone } from '../stores/zones';

const DELAI_MONTAGE = 60_000;

const seek = vi.fn(async (_zoneId: number, positionMs: number) => ({ position_ms: positionMs }));

vi.mock('../api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../api')>();
  return { ...reel, seek: (zoneId: number, positionMs: number) => seek(zoneId, positionMs) };
});

// La zone courante devient un magasin qu'on écrit : la barre lit `zone.id`.
vi.mock('../stores/zones', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../stores/zones')>();
  const { writable: magasin } = await import('svelte/store');
  return { ...reel, currentZone: magasin(null) };
});
const zoneCourante = currentZone as unknown as Writable<Record<string, unknown> | null>;

let cible: HTMLElement;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  seek.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
  zoneCourante.set({ id: 11, name: 'Salon', state: 'paused', output_type: 'dlna' });
  cible = document.createElement('div');
  document.body.appendChild(cible);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  cible.remove();
  vi.unstubAllGlobals();
});

/** La barre, montée, avec une géométrie connue : 0 → 1000 px. */
function barre(): HTMLElement {
  monte = mount(SeekBar, { target: cible, props: { positionMs: 0, durationMs: 100_000 } });
  flushSync();
  const piste = cible.querySelector<HTMLElement>('.seek-track');
  if (!piste) throw new Error('aucune barre de progression');
  piste.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 10, right: 1000, bottom: 10, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return piste;
}

const souris = (type: string, clientX: number) => new MouseEvent(type, { bubbles: true, clientX });

describe('ticket 193 — un geste sur la barre, un seul Seek', () => {
  it('un clic envoie UN Seek, pas deux', { timeout: DELAI_MONTAGE }, () => {
    const piste = barre();
    piste.dispatchEvent(souris('mousedown', 500));
    window.dispatchEvent(souris('mouseup', 500));
    piste.dispatchEvent(souris('click', 500));

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(11, 50_000);
  });

  it('un glisser envoie UN Seek, à la position relâchée', { timeout: DELAI_MONTAGE }, () => {
    const piste = barre();
    piste.dispatchEvent(souris('mousedown', 200));
    window.dispatchEvent(souris('mousemove', 700));
    window.dispatchEvent(souris('mouseup', 700));

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(11, 70_000);
  });

  it('deux clics successifs envoient deux Seek', { timeout: DELAI_MONTAGE }, () => {
    const piste = barre();
    for (const x of [300, 800]) {
      piste.dispatchEvent(souris('mousedown', x));
      window.dispatchEvent(souris('mouseup', x));
      piste.dispatchEvent(souris('click', x));
    }
    expect(seek.mock.calls.map((c) => c[1])).toEqual([30_000, 80_000]);
  });
});
