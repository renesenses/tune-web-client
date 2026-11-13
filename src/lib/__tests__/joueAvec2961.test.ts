// @vitest-environment jsdom
//
// « JOUE AVEC » LISIBLE — web#2961 (recette rc12 du 13/11 sur le .18, page
// « DjeuhDjoah & Lieutenant Nicholson ») : « pas très lisible et manque des
// liens hypertexte ». Le bloc était une grille de 7 colonnes aux noms
// tronqués, « 20 pistes en commun » en chasse fixe sur chaque ligne, et les
// musiciens sans fiche n'étaient pas cliquables.
//
// Le serveur (tune-server-rust, lot rc12) ajoute `shared_albums` et
// `album_wide` : crédité sur presque tout l'album (personnel recopié par les
// balises), le compte se dit en albums.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { flushSync, mount, unmount } from 'svelte';

const ouvertures: any[] = [];
vi.mock('../ouvrirArtisteDepuis', async (orig) => ({
  ...(await orig<typeof import('../ouvrirArtisteDepuis')>()),
  ouvrirArtisteDepuis: vi.fn(async (a: any) => { ouvertures.push(a); }),
}));

import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import type { JoueAvec } from '../api';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

/** Ce que rend le serveur corrigé pour le duo du .18. */
const DUO: JoueAvec[] = [
  { artist_id: null, artist_name: 'Guillaume Quéméré Lantonnet', shared_tracks: 13, shared_albums: 1, album_wide: true },
  { artist_id: 77, artist_name: 'Alexis Valet', shared_tracks: 13, shared_albums: 1, album_wide: true },
  { artist_id: null, artist_name: 'Ben L’Oncle Soul', shared_tracks: 1, shared_albums: 1, album_wide: false },
  { artist_id: null, artist_name: 'Sarah Solo', shared_tracks: 3, shared_albums: 1, album_wide: false },
  // Un serveur antérieur : ni `shared_albums` ni `album_wide`.
  { artist_id: null, artist_name: 'Ancien Serveur', shared_tracks: 20 },
];

let hote: HTMLDivElement | null = null;
let monte: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  locale.set('fr');
  ouvertures.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

function poser(joueAvec: JoueAvec[]): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(DiscographieCommune, {
    target: hote,
    props: { onOuvrir: () => {}, onLire: () => {}, locaux: [], joueAvec } as any,
  });
  flushSync();
  return hote;
}
const ligne = (h: Element, nom: string) =>
  [...h.querySelectorAll<HTMLElement>('section[data-section="played-with"] li')].find((l) => l.dataset.joueAvec === nom)!;
const compte = (l: Element) => l.querySelector('.compte-joue-avec')!.textContent!.trim();

describe('web#2961 — le compte dit ce que valent les crédits', () => {
  it('personnel d’album : « 1 album » ; crédit de piste : « N titres » / « 1 titre »', () => {
    const h = poser(DUO);
    expect(compte(ligne(h, 'Alexis Valet'))).toBe('1 album');
    expect(compte(ligne(h, 'Guillaume Quéméré Lantonnet'))).toBe('1 album');
    expect(compte(ligne(h, 'Sarah Solo'))).toBe('3 titres');
    expect(compte(ligne(h, 'Ben L’Oncle Soul'))).toBe('1 titre');
  });

  it('serveur antérieur (sans `album_wide`) : en titres, sans « en commun »', () => {
    const h = poser(DUO);
    expect(compte(ligne(h, 'Ancien Serveur'))).toBe('20 titres');
    expect(h.textContent).not.toContain('en commun');
  });

  it('en anglais aussi', () => {
    locale.set('en');
    const h = poser(DUO);
    expect(compte(ligne(h, 'Alexis Valet'))).toBe('1 album');
    expect(compte(ligne(h, 'Sarah Solo'))).toBe('3 tracks');
  });
});

describe('web#2961 — liens et lisibilité', () => {
  it('chaque nom est un lien au clavier ; le nom est ENTIER, avec son compte en infobulle', () => {
    const h = poser(DUO);
    for (const j of DUO) {
      const l = ligne(h, j.artist_name);
      const lien = l.querySelector<HTMLElement>('[role="link"]');
      expect(lien, `${j.artist_name} sans lien`).not.toBeNull();
      expect(lien!.getAttribute('tabindex')).toBe('0');
      expect(lien!.textContent).toBe(j.artist_name);
      expect(lien!.getAttribute('title')).toContain(j.artist_name);
    }
    expect(ligne(h, 'Alexis Valet').querySelector('[role="link"]')!.getAttribute('title')).toBe('Alexis Valet · 1 album');
  });

  it('Entrée sur un musicien sans fiche ouvre par son nom ; avec fiche, par son identifiant', () => {
    const h = poser(DUO);
    const sansFiche = ligne(h, 'Guillaume Quéméré Lantonnet').querySelector<HTMLElement>('[role="link"]')!;
    sansFiche.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ouvertures).toEqual([{ name: 'Guillaume Quéméré Lantonnet' }]);
    ligne(h, 'Alexis Valet').querySelector<HTMLElement>('[role="link"]')!.click();
    expect(ouvertures[1]).toMatchObject({ id: 77, name: 'Alexis Valet', source: 'local' });
  });

  it('des puces qui passent à la ligne, sans troncature ni chasse fixe', () => {
    const src = readFileSync('src/components/v2/DiscographieCommune.svelte', 'utf8');
    const css = src.slice(src.indexOf('.liste-joue-avec {'), src.indexOf('</style>'));
    expect(css).toContain('flex-wrap: wrap');
    expect(css).not.toContain('grid-template-columns');
    expect(css).not.toContain('text-overflow: ellipsis');
    expect(css).not.toContain('--v2-mono');
  });
});
