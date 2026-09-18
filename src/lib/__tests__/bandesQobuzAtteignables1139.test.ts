// @vitest-environment jsdom
//
// #1139 — « La présentation de Qobuz est incomplète par rapport à la version de
// base » (schmitt/Alain, fil forum 1671, réponse 6208, 12/09/2026).
//
// Ce qu'il montre en capture, ce sont TROIS rangées de l'ancienne interface :
// AUDITORIUMS, LEURS ÉCOUTES, et le début de DISCOTHÈQUE IDÉALE. Sur la
// nouvelle, `dispositionDefautService` valait `catalogue.slice(0, 4)` : les
// quatre premières bandes d'un catalogue qui en construit une trentaine, et
// ses quatre premières sont des bandes d'ALBUMS. Les catégories de playlists
// (`-tag-`) et « Mes playlists » venant APRÈS dans l'ordre de construction,
// elles étaient structurellement hors du défaut.
//
// 🔴 CE TÉMOIN MONTE LA PAGE, IL NE LIT PAS LE FICHIER.
//
// Une garde qui relirait `dispositionDefautService` et recomposerait le filtre
// « catalogue moins disposition » ne prouverait rien : elle redirait le code au
// lieu de l'éprouver. Ici on monte le vrai `PageWidgets` avec le vrai
// catalogue Qobuz, et on lit ce que l'écran AFFICHE :
//
//   1. les trois bandes citées sont là SANS AUCUN GESTE — c'est le défaut ;
//   2. celles qui n'y sont pas se retrouvent derrière « Modifier » puis
//      « Ajouter », et le bouton d'ajout est ACTIF — c'est l'accessibilité du
//      reste du catalogue ;
//   3. le défaut reste BORNÉ : on ne troque pas un défaut d'ergonomie contre
//      un défaut de performance en posant trente bandes d'un coup.
//
// ⚠️ Ce que ce témoin n'établit PAS :
//   • le catalogue Qobuz réel n'est pas mesuré ici — les 7 sections, 13
//     catégories et 13 genres sont ceux consignés dans
//     renesenses/tune-server-rust#3827 et dans l'en-tête de `widgetsService`
//     (mesure du 02 et du 12/09/2026 sur la .18), rejoués en bouchon ;
//   • le libellé des catégories vient du SERVICE (`tag.name` côté serveur) et
//     n'est pas traduit par la nouvelle interface, là où l'ancienne le passait
//     par `TAG_KEYS` — c'est un écart réel, hors de ce ticket ;
//   • la DÉCOUVRABILITÉ de « Modifier » (que rien n'annonce le reste du
//     catalogue) est le sujet de renesenses/tune-web-client#880, pas celui-ci.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import * as api from '../api';
import { catalogueService, dispositionDefautService, cleService } from '../widgetsService';
import { currentProfileId } from '../stores/profile';

/**
 * Qobuz tel qu'il répond, d'après renesenses/tune-server-rust#3827 et la
 * mesure consignée en tête de `widgetsService.ts` : sept sections éditoriales,
 * treize catégories de playlists, treize genres.
 */
const SECTIONS = [
  { id: 'new-releases', name: 'New Releases' },
  { id: 'qobuzissims', name: 'Qobuzissimes' },
  { id: 'press-awards', name: 'Press Awards' },
  { id: 'editor-picks', name: 'Choix de la rédaction' },
  { id: 'most-streamed', name: 'Les plus écoutés' },
  { id: 'best-sellers', name: 'Meilleures ventes' },
  { id: 'ideal-discography', name: 'Discothèque idéale' },
];

/** Les treize tags, dans l'ordre où Qobuz les publie. Les DEUX que le testeur
 *  montre en capture sont `auditoriums` et `speakers`. */
const TAGS = [
  'hi-res', 'new', 'focus', 'mood', 'artist', 'danslecasque', 'label',
  'qobuzdigs', 'event', 'partners', 'speakers', 'auditoriums', 'popular',
].map((id) => ({
  id,
  name: id === 'auditoriums' ? 'Auditoriums' : id === 'speakers' ? 'Leurs écoutes' : id,
  playlists: [{ id: `${id}-p1`, title: `Playlist ${id}` }],
}));

const GENRES = Array.from({ length: 13 }, (_, i) => ({ id: `g${i}`, name: `Genre ${i}` }));

/** Les trois rangées que le ticket nomme, telles que l'écran les TITRE. */
const CITEES = ['Auditoriums', 'Leurs écoutes', 'Mes playlists'];

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

function serveur() {
  vi.spyOn(api, 'getStreamingFeaturedSections').mockResolvedValue(SECTIONS as any);
  vi.spyOn(api, 'getStreamingGenres').mockResolvedValue(GENRES as any);
  vi.spyOn(api, 'getStreamingFeaturedPlaylistsByTag').mockResolvedValue(TAGS as any);
  // Les sources des bandes : elles ne sont pas le sujet, mais une bande vide
  // ne s'affiche pas — `utiles` l'écarte — et le témoin ne verrait plus rien.
  vi.spyOn(api, 'getStreamingNewReleases').mockResolvedValue([{ id: 'a1', title: 'Un album' }] as any);
  vi.spyOn(api, 'getStreamingFeatured').mockResolvedValue([{ id: 'a2', title: 'Un autre' }] as any);
  vi.spyOn(api, 'getStreamingFeaturedPlaylists').mockResolvedValue([{ id: 'p1', title: 'Une playlist' }] as any);
  vi.spyOn(api, 'getStreamingFavorites').mockResolvedValue([{ id: 'a3', title: 'Un favori' }] as any);
  vi.spyOn(api, 'getStreamingPlaylists').mockResolvedValue([{ id: 'p2', title: 'La mienne' }] as any);
  vi.spyOn(api, 'getStreamingGenreAlbums').mockResolvedValue([{ id: 'a4', title: 'Un genre' }] as any);
  // Aucune disposition rangée : c'est bien le DÉFAUT qu'on éprouve.
  vi.spyOn(api, 'getProfilePreferences').mockResolvedValue({} as any);
  vi.spyOn(api, 'setProfilePreferences').mockResolvedValue({} as any);
}

beforeEach(() => {
  serveur();
  currentProfileId.set(1);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.restoreAllMocks();
});

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** Monte l'écran Qobuz EXACTEMENT comme `StreamingV2` le monte. */
async function ouvrirEcranQobuz() {
  const catalogue = await catalogueService('qobuz');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: {
      catalogue,
      dispositionDefaut: dispositionDefautService(catalogue),
      cle: cleService('qobuz'),
      cleTitre: 'v2.svc.title',
    } as never,
  });
  flushSync();
  await souffler(120);
  flushSync();
  return { page: hote, catalogue };
}

/** Les titres des bandes RENDUES, dans l'ordre de l'écran. */
const bandesAffichees = (page: HTMLElement) =>
  [...page.querySelectorAll('section.bloc .tete h2')].map((h) => h.textContent?.trim() ?? '');

/** Un bouton par son libellé visible. */
const bouton = (page: HTMLElement, libelle: string) =>
  [...page.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(libelle)) ?? null;

describe('#1139 — l’écran Qobuz par défaut, et le reste du catalogue', () => {
  it('les trois rangées que le testeur montre sont là SANS aucun geste', async () => {
    const { page, catalogue } = await ouvrirEcranQobuz();

    // Le catalogue en construit bien une trentaine : c'est le décor du ticket.
    expect(catalogue.length, 'le catalogue Qobuz n’a pas la taille mesurée').toBeGreaterThanOrEqual(30);

    const affichees = bandesAffichees(page);
    expect(affichees.length, 'aucune bande ne s’affiche').toBeGreaterThan(0);

    for (const titre of CITEES) {
      expect(
        affichees,
        `« ${titre} » n’est pas affichée par défaut : c’est exactement ce que schmitt voit manquer (#1139)`,
      ).toContain(titre);
    }
  });

  it('les bandes hors du défaut restent ATTEIGNABLES par « Modifier » puis « Ajouter »', async () => {
    const { page, catalogue } = await ouvrirEcranQobuz();
    const affichees = bandesAffichees(page);

    // Il reste bel et bien de la matière hors du défaut — sinon la suite ne
    // prouverait rien.
    expect(
      catalogue.length,
      'le défaut prend TOUT le catalogue : on a troqué l’ergonomie contre la performance',
    ).toBeGreaterThan(affichees.length);

    // 1. « Modifier » existe, et il ouvre le mode édition.
    const modifier = bouton(page, 'Modifier');
    expect(modifier, 'aucun bouton « Modifier » : le reste du catalogue est hors d’atteinte').toBeTruthy();
    modifier!.click();
    flushSync();

    // 2. « Ajouter » apparaît, et il est ACTIF : `disabled={!disponibles.length}`
    //    le rendrait mort si le défaut avait tout pris.
    const ajouter = bouton(page, 'Ajouter');
    expect(ajouter, '« Modifier » ne révèle aucun « Ajouter »').toBeTruthy();
    expect(
      (ajouter as HTMLButtonElement).disabled,
      '« Ajouter » est mort : plus rien ne peut être remis sur la page',
    ).toBe(false);
    ajouter!.click();
    flushSync();

    // 3. La liste d'ajout nomme CHACUNE des bandes absentes de l'écran.
    const proposees = [...page.querySelectorAll('.ajout .puce')].map(
      (b) => b.textContent?.replace(/^\+\s*/, '').trim() ?? '',
    );
    expect(proposees.length, 'la liste d’ajout est vide').toBeGreaterThan(0);
    expect(
      affichees.length + proposees.length,
      'des bandes du catalogue ne sont NI affichées NI proposées à l’ajout',
    ).toBe(catalogue.length);
    // Et nommément : un genre, qui est la queue du catalogue.
    expect(proposees, 'les genres ne sont pas proposés à l’ajout').toContain('Genre 12');

    // 4. Le geste AJOUTE vraiment : une bande de plus sur l'écran.
    const puce = [...page.querySelectorAll('.ajout .puce')].find(
      (b) => b.textContent?.includes('Genre 12'),
    ) as HTMLButtonElement;
    puce.click();
    await souffler(60);
    flushSync();
    expect(bandesAffichees(page), 'le clic d’ajout n’a rien posé sur la page').toContain('Genre 12');
  });

  it('le défaut reste borné : on ne pose pas trente bandes d’un coup', async () => {
    const { page, catalogue } = await ouvrirEcranQobuz();
    const affichees = bandesAffichees(page);
    // La borne est celle du choix de `dispositionDefautService` : ce qui est
    // « à moi », quatre bandes d'albums en tête, et les catégories de
    // playlists éditoriales — pas les sections restantes ni les genres.
    expect(
      affichees.length,
      `${affichees.length} bandes d’emblée sur un catalogue de ${catalogue.length} : le défaut n’est plus borné`,
    ).toBeLessThanOrEqual(20);
    // Aucun genre par défaut : ils sont la matière de l'écran Tidal, pas
    // l'attente du fil 1671.
    expect(affichees.filter((t) => t.startsWith('Genre ')), 'des genres sont affichés par défaut').toEqual([]);
  });
});
