// @vitest-environment jsdom
//
// Biographies cliquables — renesenses/tune-server-rust#7910 (Bertrand, 05/11).
// Le serveur rend `bio_segments` à côté de `bio` ; le web les dessine sans
// `{@html}` : un lien interne ouvre la page de Tune, un lien externe (https,
// domaine de la source) s'ouvre dans un nouvel onglet.
//
// Contre-épreuves : sans segments (serveur ancien), la bio reste du texte ; une
// URL `javascript:`, `http:` ou d'un domaine étranger redevient du texte.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const { ouvrirAlbum, ouvrirArtisteDepuis } = vi.hoisted(() => ({
  ouvrirAlbum: vi.fn(async (_id: number) => {}),
  ouvrirArtisteDepuis: vi.fn(async (_a: any, _depuis: any) => {}),
}));
vi.mock('../libraryNavigation', async (orig) => ({ ...(await orig<object>()), ouvrirAlbum }));
vi.mock('../ouvrirArtisteDepuis', async (orig) => ({ ...(await orig<object>()), ouvrirArtisteDepuis }));

import BioEtTitresPhares from '../../components/v2/BioEtTitresPhares.svelte';
import { segmentsAffichables, urlDeSource } from '../library/bioSegments';
import { locale } from '../i18n';

const BIO = 'Thom Yorke fonde Radiohead. OK Computer paraît en 1997. Read more on Last.fm';
const SEGMENTS = [
  { texte: 'Thom Yorke', lien: { type: 'artiste', id: 2 } },
  { texte: ' fonde Radiohead. ' },
  { texte: 'OK Computer', lien: { type: 'album', id: 10 } },
  { texte: ' paraît en 1997. ' },
  { texte: 'Read more on Last.fm', url: 'https://www.last.fm/music/Radiohead' },
];

describe('segmentsAffichables — règles', () => {
  it('garde les liens internes et les URL https des sources', () => {
    const s = segmentsAffichables(BIO, SEGMENTS)!;
    expect(s.map((x) => x.texte).join('')).toBe(BIO);
    expect(s[0].lien).toEqual({ type: 'artiste', id: 2 });
    expect(s[2].lien).toEqual({ type: 'album', id: 10 });
    expect(s[4].url).toBe('https://www.last.fm/music/Radiohead');
  });

  it('refuse javascript:, http:, un domaine étranger ou imitateur', () => {
    for (const u of [
      'javascript:x()',
      'http://www.last.fm/music/Radiohead',
      'https://evil.example.com/',
      'https://last.fm.evil.com/x',
      'https://user@www.last.fm/x',
      'data:text/html,<script>x()</script>',
    ]) {
      expect(urlDeSource(u), u).toBeNull();
    }
    expect(urlDeSource('https://fr.wikipedia.org/wiki/Radiohead')).not.toBeNull();
    expect(urlDeSource('https://www.qobuz.com/fr-fr/interpreter/x/1')).not.toBeNull();
  });

  it('des segments qui ne recomposent pas la bio sont ignorés', () => {
    expect(segmentsAffichables('Une autre bio.', SEGMENTS)).toBeNull();
    expect(segmentsAffichables(BIO, null)).toBeNull();
    expect(segmentsAffichables(BIO, [{ texte: BIO }])).toBeNull();
  });
});

describe('BioEtTitresPhares — rendu et navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver);
    locale.set('fr');
    ouvrirAlbum.mockClear();
    ouvrirArtisteDepuis.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function monter(props: Record<string, unknown>) {
    const cible = document.createElement('div');
    document.body.appendChild(cible);
    const c = mount(BioEtTitresPhares, { target: cible, props: { titres: [], cle: 1, ...props } });
    flushSync();
    return c;
  }

  it('les entités citées sont des liens internes, le lien de la source ouvre un nouvel onglet', () => {
    const c = monter({ bio: BIO, segments: SEGMENTS });
    const p = document.querySelector('.bio')!;
    expect(p.textContent).toBe(BIO);
    const internes = [...p.querySelectorAll<HTMLButtonElement>('button[data-lien-bio]')];
    expect(internes.map((b) => b.textContent)).toEqual(['Thom Yorke', 'OK Computer']);
    const externes = [...p.querySelectorAll('a')];
    expect(externes).toHaveLength(1);
    expect(externes[0].getAttribute('href')).toBe('https://www.last.fm/music/Radiohead');
    expect(externes[0].getAttribute('target')).toBe('_blank');
    expect(externes[0].getAttribute('rel')).toBe('noopener noreferrer');
    unmount(c);
  });

  it('un clic sur un artiste ouvre sa page, un clic sur un album ouvre sa fiche', async () => {
    const c = monter({ bio: BIO, segments: SEGMENTS });
    const [artiste, album] = [...document.querySelectorAll<HTMLButtonElement>('button[data-lien-bio]')];
    artiste.click();
    album.click();
    await vi.waitFor(() => {
      expect(ouvrirArtisteDepuis).toHaveBeenCalledTimes(1);
      expect(ouvrirAlbum).toHaveBeenCalledTimes(1);
    });
    expect(ouvrirArtisteDepuis.mock.calls[0][0]).toEqual({ id: 2, name: 'Thom Yorke', source: 'local' });
    expect(ouvrirAlbum).toHaveBeenCalledWith(10);
    unmount(c);
  });

  it('une URL dangereuse ou étrangère reste du texte, jamais un lien', () => {
    const c = monter({
      bio: 'clic ici et là',
      segments: [
        { texte: 'clic', url: 'javascript:x()' },
        { texte: ' ici ' },
        { texte: 'et', url: 'http://www.last.fm/x' },
        { texte: ' ' },
        { texte: 'là', url: 'https://evil.example.com/' },
      ],
    });
    const p = document.querySelector('.bio')!;
    expect(p.textContent).toBe('clic ici et là');
    expect(p.querySelectorAll('a, button')).toHaveLength(0);
    unmount(c);
  });

  it('contre-épreuve : sans segments (serveur ancien), la bio reste du texte', () => {
    const c = monter({ bio: BIO });
    const p = document.querySelector('.bio')!;
    expect(p.textContent).toBe(BIO);
    expect(p.querySelectorAll('a, button')).toHaveLength(0);
    unmount(c);
  });

  it('aucun HTML de la source n’est interprété', () => {
    const c = monter({
      bio: '<img src=x onerror=x()> Radiohead',
      segments: [{ texte: '<img src=x onerror=x()> ' }, { texte: 'Radiohead', lien: { type: 'artiste', id: 1 } }],
    });
    const p = document.querySelector('.bio')!;
    expect(p.querySelector('img')).toBeNull();
    expect(p.textContent).toBe('<img src=x onerror=x()> Radiohead');
    unmount(c);
  });
});
