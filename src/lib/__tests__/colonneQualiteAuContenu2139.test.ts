// @vitest-environment jsdom
//
// web#2139 (fil 2248) — « agrandir un peu la colonne "titres" en rognant un peu
// sur la colonne "qualité" ». La colonne Qualité valait 196 px fixes, même sur
// un album entièrement en CD. Elle prend désormais la largeur de la pastille la
// plus longue de la liste ; le Titre, en `fr`, prend le reste. Les pastilles
// longues (« HI-RES MAX ✦ FLAC 192/24 ») ne sont jamais coupées.
//
// jsdom ne fait aucune mise en page : on lit le gabarit posé sur le tableau
// (`--tcols`) et on le compare au modèle de chasse prudent de web#1683.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ListePistesV2 from '../../components/v2/ListePistesV2.svelte';
import { preferences } from '../stores/preferences';
import {
  ANCIENNE_LARGEUR_QUALITE_PX, PLANCHER_QUALITE_PX, largeurColonneQualite, largeurPastille,
} from '../largeurQualite';

const CD = { format: 'flac', sample_rate: 44100, bit_depth: 16, source: 'local' };
const HIRES_MAX = { format: 'flac', sample_rate: 192000, bit_depth: 24, source: 'local' };
const LA_PLUS_LONGUE = { format: 'aiff', sample_rate: 352800, bit_depth: 24, source: 'local' };

describe('web#2139 — largeur de la colonne Qualité au contenu', () => {
  it('un album en CD libère de la place : la colonne est bien plus étroite que 196 px', () => {
    const l = largeurColonneQualite([CD, CD, CD]);
    expect(l).toBeLessThan(ANCIENNE_LARGEUR_QUALITE_PX - 40);
    expect(l).toBeGreaterThanOrEqual(largeurPastille(CD));
  });

  it('🔴 la pastille la plus longue de la liste n’est jamais coupée', () => {
    const l = largeurColonneQualite([CD, HIRES_MAX, CD]);
    expect(l).toBeGreaterThanOrEqual(largeurPastille(HIRES_MAX));
    expect(largeurColonneQualite([CD, LA_PLUS_LONGUE])).toBeGreaterThanOrEqual(largeurPastille(LA_PLUS_LONGUE));
  });

  it('CONTRE-ÉPREUVE : le modèle mesure — HI-RES MAX FLAC 192/24 dépasse la largeur d’un CD', () => {
    expect(largeurPastille(HIRES_MAX)).toBeGreaterThan(largeurColonneQualite([CD]));
  });

  it('sans aucune pastille, la colonne garde un plancher lisible pour son en-tête', () => {
    expect(largeurColonneQualite([])).toBe(PLANCHER_QUALITE_PX);
    expect(largeurColonneQualite([{ source: 'local' }])).toBe(PLANCHER_QUALITE_PX);
  });
});

describe('web#2139 — le tableau applique la largeur calculée', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => [], text: async () => '[]',
    }) as unknown as Response));
    preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
  });

  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  function gabarit(pistes: Record<string, unknown>[]): string {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(ListePistesV2, {
      target: hote,
      props: { pistes: pistes.map((p, i) => ({ id: i + 1, title: `T${i}`, ...p })), onLire: () => {} } as any,
    });
    flushSync();
    const tbl = hote.querySelector('.tbl') as HTMLElement;
    return tbl.getAttribute('style') ?? '';
  }

  it('🔴 album en CD : le gabarit ne contient plus 196px, mais la largeur calculée', () => {
    const style = gabarit([CD, CD]);
    expect(style).not.toContain(`${ANCIENNE_LARGEUR_QUALITE_PX}px`);
    expect(style).toContain(`${largeurColonneQualite([CD])}px`);
  });

  it('album haute résolution : la colonne s’élargit à la pastille la plus longue', () => {
    const style = gabarit([CD, HIRES_MAX]);
    expect(style).toContain(`${largeurColonneQualite([HIRES_MAX])}px`);
  });

  it('le gabarit reste en pixels (pas d’`auto`) : en-tête et lignes alignés', () => {
    expect(gabarit([CD])).not.toMatch(/auto|content/);
  });
});
