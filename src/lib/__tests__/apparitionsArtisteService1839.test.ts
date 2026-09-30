// @vitest-environment jsdom
//
// tune-web-client#1839 — décision de Bertrand (30/09/2026) : sur la fiche d'un
// artiste de SERVICE, les albums d'autres artistes que le service range sous
// lui (invitations, featurings, remix, reprises) quittent « Autres /
// Connexes » (#4651) pour « Apparitions » — même libellé, même place que pour
// un artiste local.
//
// Les données sont celles que `/streaming/qobuz/artists/36500/albums` (Air) et
// `/streaming/tidal/artists/9101/albums` rendent sur le .18 (0.9.169,
// 30/09/2026), réduites aux champs lus : 14 albums sur 99 chez Qobuz, 1 sur 20
// chez Tidal, sont d'un autre artiste principal.
//
// La garde MONTE la grille : c'est l'écran qui doit ranger, pas seulement la
// fonction de tri.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DiscographieCommune from '../../components/v2/DiscographieCommune.svelte';
import { locale } from '../i18n';
import { dictionnaire, ONZE_LANGUES } from './onzeDictionnaires';
import type { Album } from '../types';
import type { AlbumsDeService } from '../albumsArtisteStreaming';

const al = (o: Record<string, unknown>) => o as unknown as Album;

const QOBUZ_AIR: AlbumsDeService = {
  service: 'qobuz',
  artistId: '36500',
  albums: [
    al({ source_id: 'q-moon', title: 'Moon Safari', artist_id: '36500', artist_name: 'Air', year: 1998, source: 'qobuz' }),
    al({ source_id: 'q-talkie', title: 'Talkie Walkie', artist_id: '36500', artist_name: 'Air', year: 2004, source: 'qobuz' }),
    al({ source_id: 'g7vbs86eoiy4a', title: 'Japan! (feat. Air)', artist_id: '1006432', artist_name: 'Chromatic', year: 2025, source: 'qobuz' }),
    al({ source_id: 'yhaz5xtcrcbqb', title: 'MMY (feat. AIR)', artist_id: '24316742', artist_name: 'EDWRLD', year: 2025, source: 'qobuz' }),
    al({ source_id: 'z6wtycocf1hea', title: 'Blue Moon Safari', artist_id: '2714185', artist_name: 'Vegyn', year: 2025, source: 'qobuz' }),
  ],
};
const TIDAL_AIR: AlbumsDeService = {
  service: 'tidal',
  artistId: '9101',
  albums: [
    al({ source_id: 't-moon', title: 'Moon Safari', artist_id: '9101', artist_name: 'Air', year: 1998, source: 'tidal' }),
    al({ source_id: '427730652', title: 'Blue Moon Safari', artist_id: '7982157', artist_name: 'Vegyn', year: 2025, source: 'tidal' }),
  ],
};

let hote: HTMLDivElement | null = null;
let monte: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' })));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  locale.set('fr');
});
afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
});

function poser(props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(DiscographieCommune, { target: hote, props: { onOuvrir: () => {}, onLire: () => {}, ...props } as any });
  flushSync();
  return hote;
}

const titresDe = (racine: Element | null) =>
  [...(racine?.querySelectorAll('.ct') ?? [])].map((n) => n.textContent?.trim());

describe('#1839 — fiche d’un artiste de service', () => {
  it('les albums d’autres artistes sont sous « Apparitions », plus sous « Autres / Connexes »', () => {
    const h = poser({ locaux: [], services: [QOBUZ_AIR, TIDAL_AIR], nomArtiste: 'Air' });
    const principale = h.querySelector('.disco > .gr');
    const apparitions = h.querySelector('[data-section="apparitions"]');
    expect(h.querySelector('[data-section="connexes"]'), 'la section « Autres / Connexes » existe encore').toBeNull();
    expect(apparitions, 'la section « Apparitions » n’est pas rendue').not.toBeNull();
    expect(titresDe(principale)).toEqual(expect.arrayContaining(['Moon Safari', 'Talkie Walkie']));
    for (const intrus of ['Japan! (feat. Air)', 'MMY (feat. AIR)', 'Blue Moon Safari']) {
      expect(titresDe(principale), `« ${intrus} » dans la discographie de l’artiste`).not.toContain(intrus);
      expect(titresDe(apparitions), `« ${intrus} » absent des Apparitions`).toContain(intrus);
    }
    // Même édition chez Qobuz et Tidal : UNE vignette, comme ailleurs.
    expect(titresDe(apparitions).filter((x) => x === 'Blue Moon Safari')).toHaveLength(1);
    expect(h.querySelector('[data-section="apparitions"] h3')?.textContent).toContain('Apparitions');
  });

  it('même section, même libellé que pour un artiste local : les deux origines s’y rejoignent', () => {
    const invite = al({ id: 77, title: 'Invité local', artist_id: 12, artist_name: 'Charlotte Gainsbourg', year: 2006 });
    const h = poser({ locaux: [], services: [QOBUZ_AIR], nomArtiste: 'Air', apparitions: [invite] });
    const sections = h.querySelectorAll('[data-section="apparitions"]');
    expect(sections, 'deux sections « Apparitions »').toHaveLength(1);
    expect(titresDe(sections[0])).toEqual(expect.arrayContaining(['Invité local', 'Japan! (feat. Air)', 'MMY (feat. AIR)']));
  });

  it('« Apparitions » se place après « Compilations », comme pour un artiste local', () => {
    const compil = al({ id: 5, title: 'Compil', artist_name: 'Various Artists' });
    const h = poser({ locaux: [], services: [QOBUZ_AIR], nomArtiste: 'Air', compilations: [compil] });
    const ordre = [...h.querySelectorAll('[data-section]')].map((n) => n.getAttribute('data-section'));
    expect(ordre.indexOf('compilations')).toBeGreaterThan(-1);
    expect(ordre.indexOf('apparitions')).toBeGreaterThan(ordre.indexOf('compilations'));
  });

  it('un service sans intrus n’ouvre pas de section « Apparitions »', () => {
    const propre: AlbumsDeService = { ...QOBUZ_AIR, albums: QOBUZ_AIR.albums.slice(0, 2) };
    const h = poser({ locaux: [], services: [propre], nomArtiste: 'Air' });
    expect(h.querySelector('[data-section="apparitions"]')).toBeNull();
  });
});

describe('#1839 — les onze langues', () => {
  it('« Apparitions » est traduit partout ; « Autres / Connexes » n’a plus de libellé', () => {
    for (const l of ONZE_LANGUES) {
      const d = dictionnaire(l);
      expect(d['v2.disco.appearances']?.trim(), `${l} : v2.disco.appearances`).toBeTruthy();
      expect(d['v2.disco.related'], `${l} : v2.disco.related devrait avoir disparu`).toBeUndefined();
    }
  });
});
