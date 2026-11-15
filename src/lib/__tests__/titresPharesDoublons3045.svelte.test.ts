// @vitest-environment jsdom
//
// web#3045 (John Rasfig, fil 2822) — page artiste de Supertramp, rc11 :
// « Titres phares » reste sur « Chargement » et l'interface ne répond plus,
// sauf les boutons de lecture. Deux titres phares désignaient le même
// enregistrement (ajout « mes plus écoutés » du serveur, #7416), donc la même
// clé de rendu : Svelte lève `each_key_duplicate` et la mise à jour s'arrête
// (précédent : web#1856).
//
// Le témoin MONTE `ListePistesV2` avec deux titres de même clé : la liste doit
// se rendre, puis se mettre à jour. Les titres phares sont aussi dédoublonnés
// avant le rendu, en gardant la première occurrence.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { clefTitrePhare, titresPharesJouables } from '../titresPharesArtiste';
import { currentZoneId } from '../stores/zones';
import { locale } from '../i18n';
import type { Track } from '../types';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

const LOGICAL = { id: 4201, title: 'The Logical Song', artist_name: 'Supertramp', source: 'local', duration_ms: 248_000 };
const LOGICAL_BIS = { ...LOGICAL, duration_ms: 253_000 };
const DREAMER = { title: 'Dreamer', artist_name: 'Supertramp', source: 'qobuz', source_id: 'q-77' };
const DREAMER_BIS = { ...DREAMER, title: 'Dreamer (Remastered)' };
const BLOODY = { title: 'Bloody Well Right', artist_name: 'Supertramp', source: 'qobuz', source_id: 'q-78' };

const hotes: HTMLDivElement[] = [];
const montes: Record<string, any>[] = [];

beforeEach(() => {
  locale.set('fr');
  currentZoneId.set(1);
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => [], text: async () => '[]',
  }) as unknown as Response));
});

afterEach(() => {
  while (montes.length) unmount(montes.pop()!);
  while (hotes.length) hotes.pop()!.remove();
  vi.unstubAllGlobals();
});

const titresRendus = (h: HTMLElement) =>
  [...h.querySelectorAll('.trow .td.titre')].map((e) => e.getAttribute('title'));

describe('web#3045 — deux titres de même clé ne figent plus la liste', () => {
  it('🔴 ListePistesV2 monte, puis se met à jour, avec deux pistes de même clé', () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    hotes.push(hote);
    const props = $state({
      pistes: [LOGICAL, LOGICAL_BIS] as unknown as Track[],
      onLire: () => {},
      clef: clefTitrePhare,
    });
    montes.push(mount(ListePistesV2, { target: hote, props: props as any }));
    flushSync();
    expect(titresRendus(hote)).toEqual(['The Logical Song', 'The Logical Song']);

    // La mise à jour suivante doit encore se rendre (rien n'est figé).
    props.pistes = [LOGICAL, LOGICAL_BIS, BLOODY] as unknown as Track[];
    flushSync();
    expect(titresRendus(hote)).toEqual(['The Logical Song', 'The Logical Song', 'Bloody Well Right']);
  });

  it('🔴 la clé par défaut (`id`) supporte aussi le doublon', () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    hotes.push(hote);
    montes.push(mount(ListePistesV2, {
      target: hote, props: { pistes: [LOGICAL, LOGICAL_BIS], onLire: () => {} } as any,
    }));
    flushSync();
    expect(titresRendus(hote)).toHaveLength(2);
  });

  it('les titres phares sont dédoublonnés par leur clé, la première occurrence gardée', () => {
    const titres = titresPharesJouables(
      [LOGICAL, DREAMER, LOGICAL_BIS, DREAMER_BIS, BLOODY] as unknown as Track[], 'qobuz',
    );
    expect(titres.map((t) => t.title)).toEqual(['The Logical Song', 'Dreamer', 'Bloody Well Right']);
    expect(titres[0].duration_ms).toBe(248_000);
  });

  it('un titre sans identifiant n’est jamais écarté', () => {
    const sansId = { title: 'Goodbye Stranger', artist_name: 'Supertramp' };
    const titres = titresPharesJouables([sansId, { ...sansId }] as unknown as Track[], 'qobuz');
    expect(titres).toHaveLength(2);
  });
});
