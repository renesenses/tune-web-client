// @vitest-environment jsdom
//
// tune-server-rust#6934 — la navigation par label Qobuz (Pascal Lahet, fils
// 2420 et 2421) : la page « Label » (albums page par page avec « Voir tout »,
// artistes), le label cliquable sur la fiche d'un album, et le lien de
// Bibliothèque › Labels vers le catalogue Qobuz.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  getStreamingLabel: vi.fn(),
  getStreamingLabelArtists: vi.fn(),
  getLibraryLabels: vi.fn(),
  getArtistesDuLabel: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import * as vraiApi from '../api';
import LabelServiceV2 from '../../components/v2/LabelServiceV2.svelte';
import ArtistesDuLabel from '../../components/v2/ArtistesDuLabel.svelte';
import {
  ALBUMS_EN_APERCU, fermerLabelDeService, labelDeLaBibliotheque, labelQobuzDe, ouvrirLabelDeService, pageSuivante,
} from '../labelDeService';
import { activeView, vueDeRetour } from '../stores/navigation';
import { ficheAlbumService, ficheLabelService } from '../stores/streaming';
import { estDestinationDeRetour } from '../destinationDeRetour';
import { t } from '../i18n';

const tr = (cle: string) => get(t)(cle);
const lire = (p: string) => readFileSync(p, 'utf8');

function album(i: number) {
  return { id: null, source: 'qobuz', source_id: `a${i}`, title: `Album ${i}`, artist_name: 'Jan Garbarek', artist_id: '20', year: 2000 + (i % 20) } as any;
}

function page(offset: number, n: number, total: number) {
  return {
    id: '1150', name: 'ECM', image_url: 'https://static.qobuz.test/l.jpg', total, offset, limit: 50,
    albums: Array.from({ length: n }, (_, k) => album(offset + k)),
  };
}

async function laisserRepondre() {
  flushSync();
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    await tick();
  }
  flushSync();
}

afterEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  ficheLabelService.set(null);
  ficheAlbumService.set(null);
  vueDeRetour.set(null);
});

describe('les règles de la page du label', () => {
  it('la page suivante commence après la page lue, tant que le total n’est pas atteint', () => {
    expect(pageSuivante({ offset: 0, limit: 50, total: 120 })).toBe(50);
    expect(pageSuivante({ offset: 100, limit: 50, total: 120 })).toBeNull();
    expect(pageSuivante({ offset: 0, limit: 50, total: 50 })).toBeNull();
    expect(pageSuivante(null)).toBeNull();
  });

  it('le label Qobuz d’un label de la bibliothèque : rapproché seulement', () => {
    const labels = [{ name: 'ECM', album_count: 3, qobuz_label_id: '1150' }, { name: 'Verve', album_count: 1 }];
    expect(labelQobuzDe(' ecm ', labels)).toBe('1150');
    expect(labelQobuzDe('Verve', labels)).toBeNull();
    expect(labelQobuzDe('', labels)).toBeNull();
  });

  it('le label de la bibliothèque d’un label Qobuz : par identifiant, puis par nom', () => {
    const labels = [{ name: 'ECM Records', qobuz_label_id: '1150' }, { name: 'Verve' }];
    expect(labelDeLaBibliotheque('1150', 'ECM', labels)).toBe('ECM Records');
    expect(labelDeLaBibliotheque('7', 'verve', labels)).toBe('Verve');
    expect(labelDeLaBibliotheque('7', 'Blue Note', labels)).toBeNull();
  });
});

describe('ouvrir et refermer la page du label', () => {
  it('depuis la fiche d’un album : le Retour rouvre CET album avec son propre retour', () => {
    const a = { service: 'qobuz' as const, id: 'alb-A', titre: 'A' };
    ficheAlbumService.set(a);
    vueDeRetour.set('search');
    activeView.set('streamingalbum');
    ouvrirLabelDeService({ service: 'qobuz', id: '1150', nom: 'ECM' });
    expect(get(activeView)).toBe('streaminglabel');
    expect(get(ficheLabelService)?.id).toBe('1150');
    // Un autre album, ouvert depuis la page du label, puis refermé.
    ficheAlbumService.set({ service: 'qobuz', id: 'alb-B', titre: 'B' });
    ficheAlbumService.set(null);
    activeView.set('streaminglabel');
    fermerLabelDeService();
    expect(get(activeView)).toBe('streamingalbum');
    expect(get(ficheAlbumService)?.id).toBe('alb-A');
    expect(get(vueDeRetour)).toBe('search');
    expect(get(ficheLabelService)).toBeNull();
  });

  it('depuis la Bibliothèque : le Retour y ramène', () => {
    activeView.set('library');
    ouvrirLabelDeService({ service: 'qobuz', id: '1150', nom: 'ECM' });
    fermerLabelDeService();
    expect(get(activeView)).toBe('library');
  });

  it('sans identifiant, rien ne s’ouvre', () => {
    activeView.set('library');
    ouvrirLabelDeService({ service: 'qobuz', id: ' ', nom: 'ECM' });
    expect(get(activeView)).toBe('library');
  });

  it('la page n’est une destination de retour que garnie', () => {
    ficheLabelService.set(null);
    expect(estDestinationDeRetour('streaminglabel', 'nowplaying')).toBe(false);
    ficheLabelService.set({ service: 'qobuz', id: '1', nom: 'X', retour: 'home', retourDuRetour: null, ficheAlbum: null });
    expect(estDestinationDeRetour('streaminglabel', 'nowplaying')).toBe(true);
  });
});

describe('les adresses des trois routes', () => {
  it('page, artistes et contexte d’album', async () => {
    const vues: string[] = [];
    const espion = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u: any) => {
      vues.push(String(u));
      return new Response(JSON.stringify({ id: '1', name: 'X', total: 0, offset: 50, limit: 50, albums: [], artists: [], label_id: '9' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    try {
      const actual = await vi.importActual<typeof import('../api')>('../api');
      expect(await actual.getStreamingLabel('qobuz', '11 50', 50)).not.toBeNull();
      expect(await actual.getStreamingLabelArtists('qobuz', '1150')).not.toBeNull();
      expect((await actual.getStreamingAlbumContext('qobuz', 'x/1'))?.label_id).toBe('9');
    } finally {
      espion.mockRestore();
    }
    expect(vues[0]).toMatch(/\/streaming\/qobuz\/labels\/11%2050\?limit=50&offset=50$/);
    expect(vues[1]).toMatch(/\/streaming\/qobuz\/labels\/1150\/artists$/);
    expect(vues[2]).toMatch(/\/streaming\/qobuz\/albums\/x%2F1\/context$/);
    expect(vraiApi.getStreamingLabel).toBe(mocks.getStreamingLabel);
  });
});

describe('la page « Label »', () => {
  let cible: HTMLElement;
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    cible?.remove();
  });

  async function monter() {
    ficheLabelService.set({ service: 'qobuz', id: '1150', nom: 'ECM', retour: 'library', retourDuRetour: null, ficheAlbum: null });
    cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(LabelServiceV2, { target: cible });
    await laisserRepondre();
  }

  it('un aperçu des albums, puis « Voir tout » qui lit la page suivante', async () => {
    mocks.getStreamingLabel.mockImplementation(async (_s: string, _id: string, offset = 0) => page(offset, 50, 120));
    mocks.getStreamingLabelArtists.mockResolvedValue({ id: '1150', artists: [] });
    mocks.getLibraryLabels.mockResolvedValue([]);
    await monter();
    expect(mocks.getStreamingLabel).toHaveBeenCalledWith('qobuz', '1150');
    expect(cible.querySelector('h1')?.textContent).toBe('ECM');
    expect(cible.textContent).toContain(tr('v2.label.albumsTotal').replace('{n}', '120'));
    const section = () => cible.querySelector('[data-section="albums"]')!;
    expect(section().querySelectorAll('li').length).toBe(ALBUMS_EN_APERCU);
    (cible.querySelector('[data-voir-tout="albums"]') as HTMLButtonElement).click();
    await laisserRepondre();
    expect(section().querySelectorAll('li').length).toBe(50);
    (cible.querySelector('[data-charger-suite]') as HTMLButtonElement).click();
    await laisserRepondre();
    expect(mocks.getStreamingLabel).toHaveBeenLastCalledWith('qobuz', '1150', 50);
    expect(section().querySelectorAll('li').length).toBe(100);
  });

  it('les artistes du label, et le lien vers le même label de la bibliothèque', async () => {
    mocks.getStreamingLabel.mockResolvedValue(page(0, 3, 3));
    mocks.getStreamingLabelArtists.mockResolvedValue({
      id: '1150',
      artists: [{ name: 'Jan Garbarek', qobuz_artist_id: '20', album_count: 3, album_phare: { id: 'a5', title: 'Rarum', year: 2002 } }],
    });
    mocks.getLibraryLabels.mockResolvedValue([{ name: 'ECM Records', album_count: 4, qobuz_label_id: '1150' }]);
    await monter();
    const artistes = cible.querySelector('[data-section="artistes"]');
    expect(artistes, 'la section des artistes manque').not.toBeNull();
    expect(artistes?.textContent).toContain('Jan Garbarek');
    expect(cible.querySelector('[data-voir-tout="albums"]'), 'trois albums : rien à « Voir tout »').toBeNull();
    const lien = cible.querySelector('[data-label-bibliotheque]');
    expect(lien?.textContent).toContain(tr('v2.label.dansMaBibliotheque'));
  });

  it('catalogue illisible : la page le dit', async () => {
    mocks.getStreamingLabel.mockResolvedValue(null);
    mocks.getStreamingLabelArtists.mockResolvedValue(null);
    mocks.getLibraryLabels.mockResolvedValue([]);
    await monter();
    expect(cible.querySelector('[data-label-echec]')?.textContent).toContain(tr('v2.label.indisponible'));
  });
});

describe('Bibliothèque › Labels mène au catalogue Qobuz', () => {
  it('le lien paraît quand le label est rapproché, et ouvre sa page', async () => {
    mocks.getArtistesDuLabel.mockResolvedValue({ name: 'ECM', bibliotheque: [], qobuz_label_id: '1150' });
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    activeView.set('library');
    const monte = mount(ArtistesDuLabel, { target: cible, props: { label: 'ECM' } });
    await laisserRepondre();
    const bouton = cible.querySelector('[data-catalogue-qobuz]') as HTMLButtonElement | null;
    expect(bouton, 'le lien vers le catalogue Qobuz manque').not.toBeNull();
    bouton!.click();
    expect(get(activeView)).toBe('streaminglabel');
    expect(get(ficheLabelService)).toMatchObject({ service: 'qobuz', id: '1150', nom: 'ECM', retour: 'library' });
    unmount(monte);
    cible.remove();
  });
});

describe('les écrans qui y mènent', () => {
  it('la fiche album lit le label Qobuz et ouvre sa page', () => {
    const src = lire('src/components/v2/AlbumDetailV2.svelte');
    expect(src).toContain("api.getStreamingAlbumContext('qobuz', sid)");
    expect(src).toContain('labelQobuzDe(nom, labels)');
    expect(src).toContain("ouvrirLabelDeService({ service: 'qobuz', id: lq.id, nom: lq.nom })");
  });
  it('la coquille route la vue `streaminglabel`', () => {
    const src = lire('src/components/v2/ShellV2.svelte');
    expect(src).toMatch(/\{:else if \$activeView === 'streaminglabel'\}\s*(<!--[\s\S]*?-->\s*)?<LabelServiceV2 \/>/);
  });
  it('les libellés sont traduits dans les douze langues', () => {
    const cles = ['qobuzTitre', 'albumsTotal', 'albums', 'artistes', 'voirTout', 'voirMoins', 'chargerPlus', 'chargement',
      'indisponible', 'ouvrirLabel', 'ouvrirLabelTip', 'catalogueQobuz', 'dansMaBibliotheque', 'retour'];
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'vi', 'zh']) {
      const src = lire(`src/lib/locales/${l}.ts`);
      for (const c of cles) expect(src, `${l} ${c}`).toContain(`"v2.label.${c}"`);
      expect(src, l).toMatch(/"v2\.label\.ouvrirLabel": "[^"]*\{label\}[^"]*"/);
      expect(src, l).toMatch(/"v2\.label\.albumsTotal": "[^"]*\{n\}[^"]*"/);
    }
  });
});
