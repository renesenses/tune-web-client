// @vitest-environment jsdom
//
// tune-server-rust#6782 — découvrir les artistes du même label : la page du
// label montre ceux de la bibliothèque puis « À découvrir (Qobuz) », et les
// fiches album et artiste y mènent par « Autres artistes du label X ».
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  getArtistesDuLabel: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...mocks };
});

import ArtistesDuLabel from '../../components/v2/ArtistesDuLabel.svelte';
import { labelDe, labelPrincipal, ouvrirLabelDansLaBibliotheque } from '../artistesDuLabel';
import { activeView } from '../stores/navigation';
import { t } from '../i18n';

const tr = (cle: string) => get(t)(cle);

describe('le label principal d’un artiste', () => {
  it('le label qui porte le plus d’albums, espaces de bord retirés', () => {
    expect(labelPrincipal([{ label: 'ECM' }, { label: ' Blue Note ' }, { label: 'Blue Note' }, { label: null }])).toBe('Blue Note');
  });
  it('à égalité, le premier rencontré ; sans label, null', () => {
    expect(labelPrincipal([{ label: 'ECM' }, { label: 'Verve' }])).toBe('ECM');
    expect(labelPrincipal([{ label: '  ' }, {}, null])).toBeNull();
    expect(labelDe({ label: '  ' })).toBeNull();
  });
});

describe('ouvrir la page du label', () => {
  it('passe à la Bibliothèque et demande l’onglet Labels sur ce label', async () => {
    const recus: unknown[] = [];
    const ecoute = (e: Event) => recus.push((e as CustomEvent).detail);
    window.addEventListener('tune:v2-facette', ecoute);
    activeView.set('search' as any);
    await ouvrirLabelDansLaBibliotheque(' ECM ');
    window.removeEventListener('tune:v2-facette', ecoute);
    expect(get(activeView)).toBe('library');
    expect(recus).toEqual([{ onglet: 'labels', valeur: 'ECM' }]);
  });
});

describe('la section des artistes du label', () => {
  let cible: HTMLElement;
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    cible?.remove();
    mocks.getArtistesDuLabel.mockReset();
  });

  async function monter(label: string) {
    cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(ArtistesDuLabel, { target: cible, props: { label } });
    flushSync();
    await Promise.resolve();
    await tick();
    flushSync();
  }

  it('la bibliothèque, puis « À découvrir » avec l’album le plus récent', async () => {
    mocks.getArtistesDuLabel.mockResolvedValue({
      name: 'ECM',
      bibliotheque: [{ id: 1, name: 'Keith Jarrett', album_count: 2, image_url: '/api/v1/library/artists/1/image' }],
      qobuz_label_id: '9',
      decouvrir: [{ name: 'Jan Garbarek', qobuz_artist_id: '20', album_count: 3, album_phare: { id: 'a5', title: 'Rarum', year: 2002 } }],
    });
    await monter('ECM');
    expect(mocks.getArtistesDuLabel).toHaveBeenCalledWith('ECM');
    const bib = cible.querySelector('[data-section="bibliotheque"]');
    const dec = cible.querySelector('[data-section="decouvrir"]');
    expect(bib, 'la section « Dans ma bibliothèque » manque').not.toBeNull();
    expect(dec, 'la section « À découvrir (Qobuz) » manque').not.toBeNull();
    expect(bib?.textContent).toContain(tr('v2.label.artistesBibliotheque'));
    expect(bib?.textContent).toContain('Keith Jarrett');
    expect(dec?.textContent).toContain(tr('v2.label.aDecouvrir'));
    expect(dec?.textContent).toContain('Jan Garbarek');
    expect(dec?.textContent).toContain('Rarum · 2002');
  });

  it('sans Qobuz (pas de `decouvrir`) : la seule bibliothèque', async () => {
    mocks.getArtistesDuLabel.mockResolvedValue({
      name: 'ECM',
      bibliotheque: [{ id: 1, name: 'Keith Jarrett', album_count: 2 }],
    });
    await monter('ECM');
    expect(cible.querySelector('[data-section="bibliotheque"]')).not.toBeNull();
    expect(cible.querySelector('[data-section="decouvrir"]')).toBeNull();
  });

  it('serveur plus ancien (null) ou rien à montrer : aucune section', async () => {
    mocks.getArtistesDuLabel.mockResolvedValue(null);
    await monter('ECM');
    expect(cible.querySelector('[data-artistes-du-label]')).toBeNull();
    unmount(monte!);
    monte = null;
    cible.remove();
    mocks.getArtistesDuLabel.mockResolvedValue({ name: 'X', bibliotheque: [], decouvrir: [] });
    await monter('X');
    expect(cible.querySelector('[data-artistes-du-label]')).toBeNull();
  });
});

describe('les écrans qui y mènent', () => {
  const lire = (p: string) => readFileSync(p.replace('../../', 'src/').replace('../locales/', 'src/lib/locales/'), 'utf8');
  it('la page d’un label monte la section (Bibliothèque › Labels)', () => {
    const src = lire('../../components/v2/LibraryV2.svelte');
    expect(src).toMatch(/\{#if tab === 'labels' && !depot && g\.reel\}\s*<ArtistesDuLabel label=\{g\.key\} \/>/);
  });
  it('les fiches album et artiste ont le lien « Autres artistes du label »', () => {
    for (const p of ['../../components/v2/AlbumDetailV2.svelte', '../../components/v2/ArtisteServiceV2.svelte']) {
      const src = lire(p);
      expect(src, p).toContain("'v2.label.autresArtistes'");
      expect(src, p).toContain('ouvrirLabelDansLaBibliotheque(nomLabel)');
    }
  });
  it('les cinq libellés sont traduits dans les douze langues', async () => {
    for (const l of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'vi', 'zh']) {
      const src = lire(`../locales/${l}.ts`);
      for (const c of ['artistesBibliotheque', 'aDecouvrir', 'albumPhare', 'sourceQobuz', 'autresArtistes']) {
        expect(src, `${l} ${c}`).toContain(`"v2.label.${c}"`);
      }
      expect(src, l).toMatch(/"v2\.label\.autresArtistes": "[^"]*\{label\}[^"]*"/);
    }
  });
});
