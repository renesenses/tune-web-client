// @vitest-environment jsdom
//
// #2108 — opérateur « Et » / « Ou » entre les valeurs cochées d'une même
// facette d'Oxygen (Bertrand, fil 1963 : « utile quand on cherche un
// compositeur ou un interprète en musique classique »).
//
// Le « Ou » de #2168 reste le défaut. Le serveur combine en « Et » les
// facettes nommées par `?all_of=` (tune-server-rust, `facet_filter::combiner`).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import OxygenFacetRail from '../../components/v2-heritage/OxygenFacetRail.svelte';
import { getFilteredTracks } from '../api';
import { basculerOperateur, operateurProposable, parametreEt } from '../facettesEtOu';

const FACET_PARAM = { composer: 'composer', genre: 'genre', year: 'year', source: 'source_media' };

describe('#2108 — le paramètre envoyé au serveur', () => {
  it('nomme les facettes en « Et » qui ont deux valeurs ou plus, par leur nom serveur', () => {
    const sels = { composer: ['Bach', 'Vivaldi'], genre: ['Baroque'], source: ['CD', 'Vinyl'] };
    expect(parametreEt(sels, ['composer', 'genre', 'source'], FACET_PARAM)).toEqual(['composer', 'source_media']);
  });

  it('rien en « Ou » (défaut), ni sur une facette à une valeur par piste', () => {
    expect(parametreEt({ composer: ['Bach', 'Vivaldi'] }, [], FACET_PARAM)).toEqual([]);
    // Deux années en « Et » ne rendraient jamais rien : jamais proposé.
    expect(parametreEt({ year: ['1971', '1972'] }, ['year'], FACET_PARAM)).toEqual([]);
    expect(operateurProposable('year', 2)).toBe(false);
    expect(operateurProposable('composer', 1)).toBe(false);
    expect(operateurProposable('composer', 2)).toBe(true);
  });

  it('la bascule aller-retour', () => {
    expect(basculerOperateur([], 'composer')).toEqual(['composer']);
    expect(basculerOperateur(['composer'], 'composer')).toEqual([]);
  });

  it('getFilteredTracks transmet `all_of` en clé répétée', async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify({ items: [], total: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await getFilteredTracks({ composer: ['Bach', 'Vivaldi'], all_of: ['composer'] });
    } finally {
      vi.unstubAllGlobals();
    }
    const q = new URL(urls[0], 'http://x').searchParams;
    expect(q.getAll('composer')).toEqual(['Bach', 'Vivaldi']);
    expect(q.getAll('all_of')).toEqual(['composer']);
  });
});

describe('#2108 — le rail montre l’opérateur', () => {
  let hote: HTMLDivElement | null = null;
  let monte: Record<string, any> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
  });

  function rail(selected: Record<string, string[]>, enEt: string[] = []) {
    const gestes: string[] = [];
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(OxygenFacetRail, {
      target: hote,
      props: {
        tracks: [],
        serverFacets: {
          composer: [{ value: 'Bach', count: 3 }, { value: 'Vivaldi', count: 2 }],
          year: [{ value: '1971', count: 1 }, { value: '1972', count: 1 }],
        },
        facets: ['composer', 'year'],
        selected,
        enEt,
        onSelect: () => {},
        onBasculerOperateur: (f: string) => gestes.push(f),
      },
    });
    flushSync();
    return { gestes, boutons: () => [...hote!.querySelectorAll<HTMLButtonElement>('button.opbtn')] };
  }

  it('« Ou » par défaut sur deux compositeurs cochés, et le clic le signale', () => {
    const { gestes, boutons } = rail({ composer: ['Bach', 'Vivaldi'] });
    expect(boutons()).toHaveLength(1);
    expect(boutons()[0].dataset.operateur).toBe('ou');
    expect(boutons()[0].getAttribute('aria-pressed')).toBe('false');
    boutons()[0].click();
    expect(gestes).toEqual(['composer']);
  });

  it('« Et » quand le parent le dit', () => {
    const { boutons } = rail({ composer: ['Bach', 'Vivaldi'] }, ['composer']);
    expect(boutons()[0].dataset.operateur).toBe('et');
    expect(boutons()[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('absent avec une seule valeur, et sur une facette à une valeur par piste', () => {
    expect(rail({ composer: ['Bach'] }).boutons()).toHaveLength(0);
    unmount(monte!); monte = null; hote?.remove();
    expect(rail({ year: ['1971', '1972'] }).boutons()).toHaveLength(0);
  });
});

describe('#2108 — l’écran Oxygen est branché', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/components/v2-heritage/OxygenView.svelte'), 'utf-8');

  it('la sélection part avec `all_of`, et un changement d’opérateur recharge', () => {
    expect(src).toContain('const enEt = parametreEt(sels, facetEt, FACET_PARAM);');
    expect(src).toContain('if (enEt.length) out.all_of = enEt;');
    // Les quatre chargements (liste, cartes, effectifs, répertoires) suivent l'opérateur.
    expect(src.match(/void JSON\.stringify\(facetSels\); void JSON\.stringify\(facetEt\);/g)).toHaveLength(4);
    expect(src).toContain('enEt={facetEt} onBasculerOperateur={basculerOperateurFacette}');
  });
});
