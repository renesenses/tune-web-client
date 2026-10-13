// @vitest-environment jsdom
//
// #1868 — chaque source garde ses favoris (décision de Bertrand, 12/10/2026).
//
// Trois testeurs (Daniel LEVY fil 2089, Didier fil 2127, FabienM fil 2199) ont
// vu un favori Qobuz allumer le cœur de la piste LOCALE de même titre et même
// artiste, et la faire figurer sous le filtre « Bibliothèque ». FabienM : « Je
// veux bien séparer les 2 sources. Si je veux voir l'ensemble de mes favoris,
// je clique sur le filtre Toutes. »
//
// Ce banc MONTE le vrai cœur (`HeartButton`) avec un favori Qobuz homonyme
// dans le magasin, et exerce le vrai filtre de l'écran Favoris.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

import HeartButton from '../../components/partages/HeartButton.svelte';
import { clePisteJumelee, favoriteStreamingTrackKeys, favoriteTrackIds } from '../stores/profile';
import { SOURCE_BIBLIOTHEQUE, sourcesPresentes, trierEtFiltrer } from '../favorisTriFiltre';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function monterCoeur(props: Record<string, unknown>): HTMLButtonElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(HeartButton, { target: hote, props });
  flushSync();
  return hote.querySelector('button.heart-btn') as HTMLButtonElement;
}

beforeEach(() => {
  favoriteTrackIds.set(new Set());
  // Le favori Qobuz « The Bitter End » de Placebo : son jumeau titre+artiste.
  favoriteStreamingTrackKeys.set(new Set([clePisteJumelee('The Bitter End', 'Placebo')]));
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  favoriteTrackIds.set(new Set());
  favoriteStreamingTrackKeys.set(new Set());
});

describe('#1868 — le cœur d’une piste locale', () => {
  it('reste VIDE quand seul son homonyme Qobuz est favori', () => {
    const coeur = monterCoeur({ trackId: 56480, titre: 'The Bitter End', artiste: 'Placebo' });
    expect(coeur.classList.contains('active')).toBe(false);
    expect(coeur.getAttribute('aria-label')).toBe('Add to favorites');
  });

  it('se remplit par son PROPRE favori local (contre-épreuve)', () => {
    favoriteTrackIds.set(new Set([56480]));
    const coeur = monterCoeur({ trackId: 56480, titre: 'The Bitter End', artiste: 'Placebo' });
    expect(coeur.classList.contains('active')).toBe(true);
  });
});

describe('#1868 — l’écran Favoris range chaque objet sous SA source', () => {
  // Un favori Qobuz (id NUL, `source`), et un favori local.
  const QOBUZ = { id: null, title: 'The Bitter End', artist_name: 'Placebo', source: 'qobuz', source_id: '172107193' };
  const LOCAL = { id: 59014, title: 'Everything in Its Right Place', artist_name: 'Radiohead' };

  it('un favori Qobuz n’apparaît pas sous « Bibliothèque »', () => {
    expect(trierEtFiltrer([QOBUZ, LOCAL], SOURCE_BIBLIOTHEQUE, 'alpha').map((o) => o.title)).toEqual([
      'Everything in Its Right Place',
    ]);
    expect(trierEtFiltrer([QOBUZ, LOCAL], 'qobuz', 'alpha').map((o) => o.title)).toEqual(['The Bitter End']);
  });

  it('« Toutes » réunit les deux sources, sans doublon', () => {
    expect(trierEtFiltrer([QOBUZ, LOCAL], null, 'alpha')).toHaveLength(2);
    expect(sourcesPresentes([QOBUZ])).toEqual(['qobuz']);
    expect(sourcesPresentes([QOBUZ, LOCAL])).toEqual([SOURCE_BIBLIOTHEQUE, 'qobuz']);
  });

  it('l’écran ne résout plus de jumeaux locaux', () => {
    const ecran = readFileSync(resolve(process.cwd(), 'src/components/v2/FavoritesV2.svelte'), 'utf-8')
      .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(ecran).not.toContain('jumelesLocaux');
    expect(ecran).not.toContain('favoriteStreamingTrackKeys');
    expect(ecran).toContain('return $favoriteTrackIds.has(idLocal);');
  });
});
