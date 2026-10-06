// @vitest-environment jsdom
/**
 * Section « Live » de la fiche artiste (Bertrand, 05/10/2026, suite de
 * renesenses/tune-server-rust#5616). Le serveur publie les types SECONDAIRES
 * MusicBrainz sous `release_secondary_types` ; un disque qui porte `live` va
 * dans « Live », quel que soit son type primaire, et plus dans Albums.
 */
import { describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { estLive, fusionnerDiscographie, partagerParTypeDeSortie } from '../discographieCommune';
import { sectionsDepuisReponse } from '../api';
import type { Album } from '../types';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import hu from '../locales/hu';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

const album = (
  id: number,
  title: string,
  release_type?: string | null,
  release_secondary_types?: string[] | null,
): Album => ({ id, title, release_type, release_secondary_types });

const titres = (liste: { principal: { album: Album } }[]) => liste.map((e) => e.principal.album.title);

describe('Section « Live » de la fiche artiste', () => {
  it('un live va dans « Live », quel que soit son type primaire', () => {
    const entrees = fusionnerDiscographie([
      album(1, 'Harvest', 'album'),
      album(2, 'Live Rust', 'album', ['live']),
      album(3, 'Live EP', 'ep', ['live']),
      album(4, 'Live single', 'single', ['remix', 'LIVE']),
      album(5, 'Remixes', 'album', ['compilation', 'remix']),
      album(6, 'Un EP', 'ep'),
    ], []);
    const s = partagerParTypeDeSortie(entrees);
    expect(titres(s.live)).toEqual(['Live Rust', 'Live EP', 'Live single']);
    expect(titres(s.albums)).toEqual(['Harvest', 'Remixes']);
    expect(titres(s.eps)).toEqual(['Un EP']);
    expect(s.singles).toEqual([]);
    expect([...s.albums, ...s.eps, ...s.singles, ...s.live]).toHaveLength(entrees.length);
  });

  it("l'exemplaire de service sans type secondaire ne contredit pas la bibliothèque", () => {
    const entrees = fusionnerDiscographie(
      [album(1, 'Weld', null, ['live'])],
      [{ service: 'qobuz', albums: [album(2, 'Weld', 'album'), album(3, 'Ragged Glory', 'album')] }],
    );
    const s = partagerParTypeDeSortie(entrees);
    expect(titres(s.live)).toEqual(['Weld']);
    expect(s.live[0].sources).toEqual(['local', 'qobuz']);
    expect(titres(s.albums)).toEqual(['Ragged Glory']);
  });

  it('TÉMOIN — sans type secondaire, rien ne va dans « Live »', () => {
    expect(estLive(fusionnerDiscographie([album(1, 'Live at Leeds', 'album')], [])[0])).toBe(false);
    expect(estLive(fusionnerDiscographie([album(2, 'x', 'album', null)], [])[0])).toBe(false);
  });

  it('la réponse à sections transmet la clé `live`', () => {
    const r = sectionsDepuisReponse({ albums: [album(1, 'Harvest')], live: [album(2, 'Weld', null, ['live'])] });
    expect(r.live?.map((a) => a.title)).toEqual(['Weld']);
    expect(sectionsDepuisReponse([album(1, 'Harvest')]).live).toBeUndefined();
  });

  it('le libellé « Live » existe dans les 11 langues', () => {
    const tables: Record<string, Record<string, string>> = { fr, en, de, es, it: it_, hu, ja, ko, ro, sv, zh };
    for (const [l, table] of Object.entries(tables)) {
      expect(table['v2.disco.live'], `${l} : v2.disco.live`).toBeTruthy();
    }
  });

  it('rend la section « Live » APRÈS Albums, EP et Singles', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' })));
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const composant = mount(DiscographieCommune, {
      target: hote,
      props: {
        locaux: [
          album(1, 'Harvest', 'album'),
          album(2, 'Live EP', 'ep', ['live']),
          album(3, 'Un EP', 'ep'),
          album(4, 'Un single', 'single'),
        ],
        onOuvrir: () => {},
        onLire: () => {},
      },
    });
    try {
      flushSync();
      expect(hote.querySelector('[data-section="live"] .ct')?.textContent).toBe('Live EP');
      expect(hote.querySelector('[data-section="eps"] .ct')?.textContent).toBe('Un EP');
      const ordre = [...hote.querySelectorAll('section[data-section]')].map((s) => s.getAttribute('data-section'));
      expect(ordre.slice(0, 4)).toEqual(['albums-principaux', 'eps', 'singles', 'live']);
    } finally {
      unmount(composant);
      hote.remove();
      vi.unstubAllGlobals();
    }
  });

  it('un live seul suffit à ouvrir les sections', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' })));
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const composant = mount(DiscographieCommune, {
      target: hote,
      props: { locaux: [album(1, 'Harvest'), album(2, 'Weld', null, ['live'])], onOuvrir: () => {}, onLire: () => {} },
    });
    try {
      flushSync();
      expect(hote.querySelector('[data-section="albums-principaux"] .ct')?.textContent).toBe('Harvest');
      expect(hote.querySelector('[data-section="live"] .ct')?.textContent).toBe('Weld');
    } finally {
      unmount(composant);
      hote.remove();
      vi.unstubAllGlobals();
    }
  });
});
