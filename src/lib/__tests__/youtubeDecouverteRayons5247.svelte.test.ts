// @vitest-environment jsdom
//
// tune-server-rust#5247 — l'écran « Découvrir » de YouTube Music parlait à des
// talons serveur (listes vides). Le serveur rend désormais les rayons réels :
// `{ sections: [{ title, items: [{ kind, id, title, subtitle, cover_path }] }] }`
// pour l'accueil, les tendances et le contenu d'une ambiance, un tableau de
// groupes pour la liste des ambiances. Les corps simulés ci-dessous reprennent
// les premiers éléments des réponses InnerTube enregistrées côté serveur
// (`tune-core/tests/fixtures/youtube/`), passées par ses analyseurs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import type { YtElementRayon } from '../api';
import YouTubeDecouverteV2 from '../../components/v2/YouTubeDecouverteV2.svelte';

const souffler = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const TENDANCES = {
  country: 'FR',
  sections: [
    { title: 'Video charts', items: [
      { kind: 'playlist', id: 'VLOLAK5uy_mnRyLDuByhBA_r8-L9ugjllTxfVytwAp0', title: 'Trending 20 France', subtitle: 'YouTube Music', cover_path: 'https://i.ytimg.com/a.jpg' },
    ] },
    { title: 'Top artists', items: [
      { kind: 'artist', id: 'UCYO-8CIkoBoUG2nOWz57Q9g', title: 'Jul', subtitle: '2.04M subscribers', cover_path: 'https://yt3.googleusercontent.com/j' },
    ] },
  ],
};
const AMBIANCES = [
  { title: 'Moods & moments', items: [{ title: 'Chill', params: 'ggMPOg1uX1JOQWZFeDByc2Jm' }] },
];
const CONTENU_AMBIANCE = {
  sections: [{ title: 'Coffee shop blends', items: [
    { kind: 'playlist', id: 'VLRDCLAK5uy_nBE4bLuBHUXWZrF59ZrkPEToKt8M_I3Vc', title: 'Coffee Shop Blend', subtitle: '', cover_path: 'https://yt3.googleusercontent.com/c' },
  ] }],
};
const ACCUEIL = {
  sections: [{ title: 'Quick picks', items: [
    { kind: 'track', id: 'V-uIp-WuD60', title: 'Patient Zero', subtitle: 'Taylor Swift', cover_path: 'https://yt3.googleusercontent.com/p' },
  ] }],
};

describe('YouTube Music : rayons réels de l’écran Découvrir (#5247)', () => {
  let monte: ReturnType<typeof mount> | null = null;
  let cible: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    cible = document.createElement('div');
    document.body.appendChild(cible);
  });
  afterEach(() => {
    if (monte) { unmount(monte); monte = null; }
    cible.remove();
    vi.restoreAllMocks();
  });

  async function monter(props: Record<string, unknown> = {}) {
    monte = mount(YouTubeDecouverteV2, { target: cible, props: { pays: 'FR', ...props } });
    flushSync();
    await souffler();
    flushSync();
  }
  async function onglet(i: number) {
    (cible.querySelectorAll('.onglets button')[i] as HTMLButtonElement).click();
    flushSync();
    await souffler();
    flushSync();
  }

  it('les tendances peignent chaque rayon, sa pochette et ses titres', async () => {
    const charts = vi.spyOn(api, 'getYouTubeCharts').mockResolvedValue(TENDANCES as any);
    await monter();
    expect(charts).toHaveBeenCalledWith('FR');
    const titres = [...cible.querySelectorAll('h3')].map((h) => h.textContent);
    expect(titres).toEqual(['Video charts', 'Top artists']);
    expect(cible.textContent).toContain('Trending 20 France');
    expect(cible.textContent).toContain('Jul');
    expect(cible.querySelectorAll('.carte')).toHaveLength(2);
  });

  it('chaque élément passe par la vignette de l’écran hôte, avec son type', async () => {
    vi.spyOn(api, 'getYouTubeCharts').mockResolvedValue(TENDANCES as any);
    const recus: YtElementRayon[] = [];
    const tuile = createRawSnippet((el: () => YtElementRayon) => {
      recus.push(el());
      return { render: () => `<i data-hote="${el().kind}"></i>` };
    });
    await monter({ tuile });
    expect(cible.querySelectorAll('[data-hote]')).toHaveLength(2);
    expect(cible.querySelectorAll('.carte'), 'le repli ne double pas la vignette hôte').toHaveLength(0);
    expect(recus.map((e) => [e.kind, e.id])).toEqual([
      ['playlist', 'VLOLAK5uy_mnRyLDuByhBA_r8-L9ugjllTxfVytwAp0'],
      ['artist', 'UCYO-8CIkoBoUG2nOWz57Q9g'],
    ]);
  });

  it('une ambiance ouvre ses rayons de playlists', async () => {
    vi.spyOn(api, 'getYouTubeCharts').mockResolvedValue(TENDANCES as any);
    vi.spyOn(api, 'getYouTubeMoods').mockResolvedValue(AMBIANCES as any);
    const contenu = vi.spyOn(api, 'getYouTubeMoodSections').mockResolvedValue(CONTENU_AMBIANCE as any);
    await monter();
    await onglet(1);
    (cible.querySelector('.puces button') as HTMLButtonElement).click();
    flushSync();
    await souffler();
    flushSync();
    expect(contenu).toHaveBeenCalledWith('ggMPOg1uX1JOQWZFeDByc2Jm');
    expect(cible.querySelector('.retour')?.textContent).toContain('Chill');
    expect(cible.textContent).toContain('Coffee Shop Blend');
  });

  it('l’accueil n’est demandé qu’à l’ouverture de son onglet, et une fois', async () => {
    vi.spyOn(api, 'getYouTubeCharts').mockResolvedValue(TENDANCES as any);
    const accueil = vi.spyOn(api, 'getYouTubeHome').mockResolvedValue(ACCUEIL as any);
    await monter();
    expect(accueil).not.toHaveBeenCalled();
    await onglet(2);
    await onglet(0);
    await onglet(2);
    expect(accueil).toHaveBeenCalledTimes(1);
    expect(cible.textContent).toContain('Patient Zero');
  });

  it('🔴 une erreur du serveur est DITE, pas maquillée en liste vide', async () => {
    vi.spyOn(api, 'getYouTubeCharts').mockRejectedValue(new Error('youtube decouverte_charts_FR: ytm browse: 403'));
    await monter();
    const alerte = cible.querySelector('[role="alert"]');
    expect(alerte?.textContent).toContain('403');
    expect(cible.querySelectorAll('h3')).toHaveLength(0);
  });

  it('StreamingV2 donne sa vignette : tuile, artiste, et la lecture par type', () => {
    const S = readFileSync(resolve(__dirname, '../../components/v2/StreamingV2.svelte'), 'utf8');
    const bloc = S.slice(S.indexOf('{#snippet tuileYouTube('), S.indexOf('{#snippet artiste('));
    expect(bloc).toContain("{#if el.kind === 'artist'}");
    expect(bloc).toContain('{@render artiste(');
    expect(bloc).toContain('{@render tile(');
    expect(bloc).toContain("el.kind === 'track' ? playTrack(p) : el.kind === 'playlist' ? playPlaylist(p) : playAlbum(p)");
    expect(bloc).toContain("source: 'youtube'");
  });
});
