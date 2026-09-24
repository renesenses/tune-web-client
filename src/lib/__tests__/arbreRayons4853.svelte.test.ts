// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';

vi.mock('../api', async (orig) => {
  const vrai = await orig<typeof import('../api')>();
  return {
    ...vrai,
    placeCollectionInFolder: vi.fn(async () => ({})),
    moveCollectionFolder: vi.fn(async () => ({})),
  };
});

import * as api from '../api';
import type { ArbreCollections } from '../api';
import ArbreRayons from '../../components/v2/ArbreRayons.svelte';
import { locale } from '../i18n';

/**
 * L'arbre des rayons, monté pour de vrai (tune-server-rust#4853) : l'imbrication
 * rendue, et un déplacement qui part au serveur avec la SORTE de la collection.
 */
const arbre: ArbreCollections = {
  max_depth: 3,
  folders: [
    {
      id: 1, name: 'Rock', parent_id: null, position: 0, depth: 1,
      folders: [{
        id: 2, name: 'Hard', parent_id: 1, position: 0, depth: 2, folders: [],
        collections: [{ kind: 'collection', id: 1, name: 'favorites', description: null, icon: null, color: '#123456', folder_id: 2, position: 0 }],
      }],
      collections: [],
    },
    { id: 3, name: 'Jazz', parent_id: null, position: 1, depth: 1, folders: [], collections: [] },
  ],
  collections: [{ kind: 'smart', id: 1, name: 'Audiophile', description: null, icon: null, color: null, folder_id: null, position: null }],
};

describe('ArbreRayons monté dans un DOM', () => {
  let hote: HTMLElement;
  let composant: Record<string, any> | null = null;
  const ouvertes: [string, number][] = [];

  beforeEach(() => {
    locale.set('fr');
    try { localStorage.clear(); } catch { /* */ }
    hote = document.createElement('div');
    document.body.appendChild(hote);
    ouvertes.length = 0;
    vi.mocked(api.placeCollectionInFolder).mockClear();
  });
  afterEach(() => {
    if (composant) unmount(composant);
    composant = null;
    hote.remove();
  });

  function monter(compact = false) {
    composant = mount(ArbreRayons, {
      target: hote,
      props: { arbre, compact, onOuvrir: (k: string, id: number) => ouvertes.push([k, id]), onChange: () => {} },
    });
    flushSync();
  }

  it('rend l’imbrication : Hard est DANS Rock, favorites est DANS Hard', () => {
    monter();
    const rock = hote.querySelector('[data-rayon="1"]')!;
    expect(rock).not.toBeNull();
    const hard = rock.querySelector('[data-rayon="2"]')!;
    expect(hard).not.toBeNull();
    expect(hard.textContent).toContain('favorites');
    expect(rock.querySelector('[data-rayon="3"]')).toBeNull();
    // Hors rayon : l'intelligente de même id 1, SANS confusion avec la simple.
    expect(hote.querySelector('.hors')!.textContent).toContain('Audiophile');
  });

  it('replier un rayon masque son contenu', () => {
    monter();
    const pli = hote.querySelector('[data-rayon="1"] .pli') as HTMLButtonElement;
    pli.click();
    flushSync();
    expect(hote.querySelector('[data-rayon="2"]')).toBeNull();
  });

  it('« Déplacer vers… » range la collection avec sa sorte et le rayon choisi', async () => {
    monter();
    const ligne = [...hote.querySelectorAll('.hors .col')].find((l) => l.textContent?.includes('Audiophile'))!;
    (ligne.querySelector('.geste') as HTMLButtonElement).click();
    flushSync();
    const choix = [...ligne.querySelectorAll('.menu button')].find((b) => b.textContent?.includes('Jazz')) as HTMLButtonElement;
    expect(choix).toBeTruthy();
    choix.click();
    await tick();
    expect(api.placeCollectionInFolder).toHaveBeenCalledWith('smart', 1, 3);
  });

  it('un clic sur une collection l’ouvre, par sa sorte', () => {
    monter(true);
    (hote.querySelector('[data-rayon="2"] .ouvre') as HTMLButtonElement).click();
    expect(ouvertes).toEqual([['collection', 1]]);
    // En barre latérale : ni gestes, ni « hors rayon ».
    expect(hote.querySelector('.geste')).toBeNull();
    expect(hote.querySelector('.hors')).toBeNull();
  });
});
