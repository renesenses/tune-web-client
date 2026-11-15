// @vitest-environment jsdom
//
// #2762 (demande HCFR, fil « TUNE by Mozaiklabs ») — filtrer la Collection
// par chef d'orchestre, ensemble / orchestre et œuvre.
//
// Le serveur sert ces trois facettes depuis tune-server-rust#8325
// (`fields=…,conductor,ensemble,work`). Ces gardes MONTENT le vrai rail de
// facettes : les trois facettes s'affichent avec leurs libellés, se trient
// A→Z / par nombre comme les autres, et — face à un serveur rc11 qui ne les
// sert pas — n'apparaissent pas, sans erreur.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import OxygenFacetRail from '../../components/v2-heritage/OxygenFacetRail.svelte';
import type { FacetValue } from '../api';
import { t } from '../i18n';
import { OXYGEN_FACETS_ALL } from '../stores/preferences';
import { FACETTES_COMBINABLES_EN_ET } from '../facettesEtOu';
import { ONZE_LANGUES, dictionnaire } from './onzeDictionnaires';

let monte: Record<string, unknown> | null = null;
let hote: HTMLDivElement | null = null;

const CLASSIQUES = ['conductor', 'ensemble', 'work'] as const;

function poserRail(serverFacets: Record<string, FacetValue[]>, selected: Record<string, string[]> = {}): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(OxygenFacetRail as never, {
    target: hote,
    props: {
      tracks: [],
      serverFacets,
      facets: ['composer', ...CLASSIQUES],
      limit: 200,
      selected,
      onSelect: () => {},
    } as never,
  });
  return hote;
}

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  try { localStorage.clear(); } catch { /* mode privé */ }
});

const titres = (el: HTMLElement) =>
  [...el.querySelectorAll('.ghtitle .ghlabel')].map((s) => s.textContent?.trim() ?? '');

const SERVEUR_8325: Record<string, FacetValue[]> = {
  composer: [{ value: 'Ludwig van Beethoven', count: 9 }],
  conductor: [
    { value: 'Claudio Abbado', count: 2 },
    { value: 'Herbert von Karajan', count: 5 },
  ],
  ensemble: [
    { value: 'Rundfunkchor Berlin', count: 1 },
    { value: 'Berliner Philharmoniker', count: 7 },
  ],
  work: [{ value: 'Symphonie n° 9', count: 4 }],
};

describe('Collection : facettes Chefs, Ensembles / orchestres, Œuvres (#2762)', () => {
  it('les trois facettes sont livrées dans Réglages et dans le rail', () => {
    for (const f of CLASSIQUES) expect(OXYGEN_FACETS_ALL).toContain(f);
  });

  it('servies par le serveur, elles s’affichent avec leurs libellés traduits', () => {
    const el = poserRail(SERVEUR_8325);
    const tr = get(t);
    const attendus = ['composer', ...CLASSIQUES].map((f) => tr(`oxygen.facet.${f}`));
    for (const f of CLASSIQUES) {
      expect(tr(`oxygen.facet.${f}`), `libellé manquant : oxygen.facet.${f}`).not.toBe(`oxygen.facet.${f}`);
    }
    expect(titres(el)).toEqual(attendus);
    const valeurs = [...el.querySelectorAll('.val .vl')].map((s) => s.textContent);
    expect(valeurs).toContain('Berliner Philharmoniker');
    expect(valeurs).toContain('Symphonie n° 9');
  });

  it('se trient par nombre puis A→Z, comme les autres facettes', () => {
    const el = poserRail(SERVEUR_8325);
    const groupe = (i: number) => el.querySelectorAll('.group')[i] as HTMLElement;
    const valeursDe = (g: HTMLElement) => [...g.querySelectorAll('.val .vl')].map((s) => s.textContent);
    // Groupe 1 = Chefs (le 0 est Compositeurs). Par défaut : par nombre.
    expect(valeursDe(groupe(1))).toEqual(['Herbert von Karajan', 'Claudio Abbado']);
    (groupe(1).querySelector('.sortbtn') as HTMLButtonElement).click();
    flushSync();
    expect(valeursDe(groupe(1))).toEqual(['Claudio Abbado', 'Herbert von Karajan']);
    (groupe(1).querySelector('.sortbtn') as HTMLButtonElement).click();
    flushSync();
    expect(valeursDe(groupe(1))).toEqual(['Herbert von Karajan', 'Claudio Abbado']);
  });

  it('face à un serveur rc11 qui ne les sert pas, elles n’apparaissent pas, sans erreur', () => {
    const el = poserRail({ composer: SERVEUR_8325.composer });
    expect(el.querySelector('.rail')).not.toBeNull();
    expect(titres(el)).toEqual([get(t)('oxygen.facet.composer')]);
  });

  it('chef et ensemble acceptent « Et » (un chœur ET un orchestre), pas l’œuvre', () => {
    expect(FACETTES_COMBINABLES_EN_ET.has('conductor')).toBe(true);
    expect(FACETTES_COMBINABLES_EN_ET.has('ensemble')).toBe(true);
    expect(FACETTES_COMBINABLES_EN_ET.has('work')).toBe(false);
    const el = poserRail(SERVEUR_8325, { ensemble: ['Berliner Philharmoniker', 'Rundfunkchor Berlin'] });
    expect(el.querySelector('.opbtn')).not.toBeNull();
  });

  it('les libellés existent dans les 15 langues', () => {
    const cles = [
      ...CLASSIQUES.map((f) => `oxygen.facet.${f}`),
      ...['conductor', 'ensemble', 'work', 'movement'].map((c) => `oxygen.col.${c}`),
    ];
    expect(ONZE_LANGUES.length).toBe(15);
    for (const langue of ONZE_LANGUES) {
      const d = dictionnaire(langue);
      for (const c of cles) expect(d[c], `${langue} : ${c}`).toBeTruthy();
    }
  });
});
