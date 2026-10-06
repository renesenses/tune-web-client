// @vitest-environment jsdom
//
// web#1862 — Didier (fil 2038, 0.9.169) : la balise GROUPING ne découpe plus
// les pistes d'un album. Les sections (#2130) vivaient dans l'ancienne fiche
// (`LibraryView.svelte`), partie en v0.9.158 ; depuis, aucun composant
// n'appelait `lib/library/grouping.ts`, alors que `GET /library/albums/{id}/
// tracks` joint toujours `grouping` aux pistes.
//
// 🔴 CE TÉMOIN MONTE LA LISTE de la fiche d'album et compte les en-têtes de
// section RENDUS, dans les deux formes (tableau et lignes). Son exemple est
// celui du testeur : Le Sacre du printemps, deux parties sur un disque.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import { sectionsParRang } from '../library/grouping';

const P1 = "Part 1: L'Adoration de la Terre";
const P2 = 'Part 2: Le Sacrifice';
const piste = (id: number, n: number, grouping?: string | null, disc = 1) =>
  ({ id, title: `Piste ${id}`, disc_number: disc, track_number: n, source: 'local', grouping }) as any;

const SACRE = [piste(1, 1, P1), piste(2, 2, P1), piste(3, 3, P1), piste(4, 4, P2), piste(5, 5, P2)];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ListePistesV2 as any, { target: hote, props: { onLire: () => {}, ...props } as any });
  flushSync();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({}), text: async () => '{}',
  } as unknown as Response)));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

const sections = (el: HTMLElement) =>
  [...el.querySelectorAll('.grouphead')].map((h) => h.textContent?.trim());

describe('web#1862 — les sections GROUPING sur la fiche d’album V2', () => {
  for (const niveau of ['expert', 'intermediate'] as const) {
    it(`🔴 ${niveau} : deux parties, deux en-têtes, avant la bonne piste`, () => {
      preferences.update((p) => ({ ...p, settingsLevel: niveau }));
      const el = poser({ pistes: SACRE, enTetesDisque: true, numerotation: 'piste' });
      expect(sections(el)).toEqual([P1, P2]);
      const h2 = el.querySelectorAll('.grouphead')[1];
      expect(h2.nextElementSibling?.textContent ?? '').toContain('Piste 4');
    });
  }

  it('une seule valeur sur le disque : aucun en-tête (règle #2130)', () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    const el = poser({ pistes: SACRE.map((p) => ({ ...p, grouping: P1 })), enTetesDisque: true });
    expect(sections(el)).toEqual([]);
  });

  it('sans la propriété, les autres écrans (playlist, file) ne changent pas', () => {
    preferences.update((p) => ({ ...p, settingsLevel: 'expert' }));
    const el = poser({ pistes: SACRE });
    expect(sections(el)).toEqual([]);
  });

  it('par rang : une section ne traverse pas un disque, une piste sans id garde la sienne', () => {
    const coffret = [
      piste(1, 1, 'A'), piste(2, 2, 'B'),
      // Disque 2 : une seule valeur, donc rien — même si elle diffère du disque 1.
      piste(3, 1, 'B', 2), piste(4, 2, 'B', 2),
      // Disque 3 : deux blocs disjoints du même nom font deux sections ; la
      // piste sans GROUPING reste hors section ; l'absence d'id ne compte pas.
      piste(5, 1, 'X', 3), { ...piste(0, 2, null, 3), id: undefined }, { ...piste(0, 3, 'X', 3), id: undefined },
    ];
    expect(sectionsParRang(coffret)).toEqual(['A', 'B', null, null, 'X', null, 'X']);
    expect(sectionsParRang([])).toEqual([]);
  });
});
