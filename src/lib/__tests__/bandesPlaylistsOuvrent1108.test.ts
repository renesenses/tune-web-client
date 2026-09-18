// @vitest-environment jsdom
//
// « Bandes de playlists des écrans composés : ni la pochette ni le titre
// n'ouvrent la playlist » — renesenses/tune-web-client#1108.
//
// schmitt (Alain), forum fil 1671, réponse 6299, 17/09/2026 : « le lien sous
// la pochette ou la playlist permettant de développer sa composition n'est pas
// actif sur le rajout uniquement ». FabienM, fil 1829, même jour, v0.9.152 :
// « Widget Playlist Qobuz : on ne peut pas cliquer pour lister les titres de la
// playlist. Exemple : playlist du widget Humeurs ».
//
// 🔴 CE QUE #1016 AVAIT FAIT, ET CE QU'IL AVAIT MANQUÉ.
//
// PR #1016 a appris à `ouvrirFiche()` de `StreamingV2` à rendre un geste pour
// une playlist, de sorte que le gabarit `tile` cesse de retomber sur son repli
// `ouvre ?? onPlay`. Son commentaire affirme réparer « la recherche et
// l'éditorial ». Mais l'onglet éditorial n'est PAS rendu par `tile` : il est
// rendu par `PageWidgets`, que `StreamingV2` et `HomeV2` montent tous les deux
// et qui ne lit pas `ouvrirFiche` du tout. Il lit `el.ouvrir` — que les deux
// fabriques d'éléments de bande laissaient vide pour une playlist.
//
// 🔴 CE TÉMOIN CLIQUE SUR LE COMPOSANT RÉEL, IL NE LIT PAS LA SOURCE.
//
// Il monte `PageWidgets` avec un catalogue construit par les VRAIES fabriques
// (`widgetsCategoriesPlaylists` pour la bande « Humeurs » de l'écran Qobuz et
// de l'accueil, le widget `qobuz-selection` du registre pour l'accueil), tels
// que `StreamingV2` et `HomeV2` les lui passent, puis il clique là où le
// testeur clique : le bouton d'ouverture de la POCHETTE, et le TITRE.
//
// Construire soi-même le gestionnaire ne garderait rien : c'est précisément le
// BRANCHEMENT entre la fabrique d'éléments et `PageWidgets` qui était rompu.
// Un témoin qui appelle `ouvrirElement` à la main serait resté vert pendant
// tout le défaut.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { widgetsCategoriesPlaylists, cleService } from '../widgetsService';
import { widgetParId } from '../accueilWidgets';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

/** La playlist que Fabien montre en capture, telle que Qobuz la sert. */
const PLAYLIST = {
  id: '69142842',
  name: 'Dimanche R&B / Neo-Soul',
  owner: 'Qobuz France',
  description: 'La sélection du dimanche',
  cover_path: '/covers/humeurs.jpg',
  track_count: 3,
  duration_ms: 600_000,
};

/** La catégorie « Humeurs », telle que `/streaming/qobuz/featured/by-tag` la rend. */
const GROUPES = [{ id: 'humeurs', name: 'Humeurs', playlists: [PLAYLIST] }];

/** Un album éditorial, pour la contre-épreuve « les albums s'ouvraient déjà ». */
const ALBUM = {
  source_id: '0060254705991',
  title: 'Random Access Memories',
  artist_name: 'Daft Punk',
  cover_path: '/covers/ram.jpg',
  year: 2013,
};

/**
 * Le serveur. Les préférences de profil sont vides (on prend la disposition
 * par défaut), `/featured` rend la playlist, ses pistes rendent une liste vide
 * — la fiche s'ouvre quand même, et c'est son OUVERTURE qu'on garde ici.
 */
function poserLeServeur() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      let corps: any = {};
      if (u.includes('/tracks')) corps = [];
      // `/featured/<section>` sert des ALBUMS ; `/featured` tout court, les
      // playlists mises en avant. Deux routes voisines, deux natures.
      else if (u.includes('/streaming/qobuz/featured/')) corps = [ALBUM];
      else if (u.includes('/streaming/qobuz/featured')) corps = [PLAYLIST];
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => corps,
        text: async () => JSON.stringify(corps),
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  poserLeServeur();
  currentProfileId.set(1);
  currentZoneId.set(1);
});

afterEach(() => {
  if (monte) { unmount(monte); monte = null; }
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const souffler = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/** La page, montée comme `StreamingV2` et `HomeV2` la montent. */
async function poserLaPage(widget: any, cle: string) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: { catalogue: [widget], dispositionDefaut: [widget.id], cle },
  });
  flushSync();
  await souffler(120);
  flushSync();
  return hote;
}

/** La vignette de la playlist : sa pochette, et son titre. */
function vignette(page: HTMLElement) {
  const carte = page.querySelector('.carte');
  expect(carte, 'la bande de playlists n’a monté aucune vignette').toBeTruthy();
  return {
    pochette: carte!.querySelector('.pochette button.ouvrir') as HTMLButtonElement | null,
    titre: carte!.querySelector('button.meta') as HTMLButtonElement | null,
  };
}

/** La fiche playlist, ouverte par-dessus la page. */
const ficheOuverte = () => document.querySelector('.v2-pldetail');

async function cliquer(b: HTMLButtonElement) {
  b.click();
  await souffler(120);
  flushSync();
}

/**
 * Les deux bandes touchées, et leur écran.
 *
 * `qobuz-tag-humeurs` : `widgetsCategoriesPlaylists` → `playlistDistante`.
 *   C'est la bande nommée par les deux testeurs. Elle est montée par l'écran
 *   Qobuz du menu Streaming (`catalogueService`) ET par l'accueil
 *   (`categoriesPlaylistsPourAccueil`, #987) — une seule fabrique, deux écrans.
 *
 * `qobuz-selection` : registre de l'accueil → `versElement({genre:'playlist'})`
 *   → `ficheDe`. Une SECONDE fabrique, que le ticket ne nomme pas et qui
 *   portait le même trou.
 */
const BANDES: [string, () => any, string][] = [
  [
    'qobuz-tag-humeurs — écran Qobuz et accueil (widgetsCategoriesPlaylists)',
    () => {
      const w = widgetsCategoriesPlaylists('qobuz', GROUPES);
      expect(w.length, 'la catégorie « Humeurs » n’a produit aucune bande').toBe(1);
      return w[0];
    },
    cleService('qobuz'),
  ],
  [
    'qobuz-selection — accueil (registre WIDGETS, genre playlist)',
    () => {
      const w = widgetParId('qobuz-selection');
      expect(w, 'le widget « Sélection Qobuz » a disparu du registre').toBeTruthy();
      return w;
    },
    'accueil_widgets',
  ],
];

describe.each(BANDES)('#1108 — %s', (_nom, fabrique, cle) => {
  it('la POCHETTE ouvre la composition de la playlist', async () => {
    const page = await poserLaPage(fabrique(), cle);
    const { pochette } = vignette(page);
    expect(
      pochette,
      'la pochette ne porte AUCUN bouton d’ouverture : `PochetteActions` ne le ' +
        'rend que `{#if onOuvrir}`, et `PageWidgets` ne le passe que si `el.ouvrir` — c’est #1108',
    ).toBeTruthy();

    await cliquer(pochette!);
    expect(ficheOuverte(), 'le clic sur la pochette n’a ouvert aucune fiche playlist').toBeTruthy();
    expect(ficheOuverte()!.querySelector('h1')?.textContent).toContain('Dimanche R&B');
  });

  it('le TITRE ouvre la composition de la playlist', async () => {
    const page = await poserLaPage(fabrique(), cle);
    const { titre } = vignette(page);
    expect(titre, 'la vignette n’a pas de bouton de titre').toBeTruthy();
    expect(
      titre!.disabled,
      'le titre est DÉSACTIVÉ (`disabled={!el.ouvrir}`) : « le lien sous la pochette ' +
        'ou la playlist […] n’est pas actif » — c’est #1108',
    ).toBe(false);

    await cliquer(titre!);
    expect(ficheOuverte(), 'le clic sur le titre n’a ouvert aucune fiche playlist').toBeTruthy();
    expect(ficheOuverte()!.querySelector('h1')?.textContent).toContain('Dimanche R&B');
  });

  it('la fiche ouverte est bien celle du SERVICE, pas une fiche album', async () => {
    // Contre-épreuve de nature : ouvrir un calque ALBUM sur une playlist
    // rendrait un écran vide — `/streaming/qobuz/albums/69142842/tracks` n'est
    // pas la même route, et les deux espaces d'identifiants sont disjoints.
    // C'est le piège déjà documenté dans `accueilWidgets.ficheDe`.
    const page = await poserLaPage(fabrique(), cle);
    const { pochette } = vignette(page);
    await cliquer(pochette!);
    expect(document.querySelector('.v2-detail'), 'un calque ALBUM s’est ouvert sur une playlist').toBeNull();
    expect(ficheOuverte()!.querySelector('.kind')?.textContent).toContain('qobuz');
  });
});

describe('#1108 — ce que le correctif ne doit PAS emporter', () => {
  it('une bande d’ALBUMS continue d’ouvrir son album', async () => {
    // Le repli des albums existait et marchait (« les bandes d'albums du même
    // écran, elles, s'ouvrent »). Donner un geste à la playlist ne doit rien
    // lui retirer.
    const w = widgetParId('qobuz-nouveautes');
    expect(w, 'le widget « Nouveautés Qobuz » a disparu du registre').toBeTruthy();
    const page = await poserLaPage(w, 'accueil_widgets');
    const { pochette, titre } = vignette(page);
    expect(pochette, 'la pochette d’un album n’ouvre plus rien').toBeTruthy();
    expect(titre!.disabled, 'le titre d’un album a été désactivé').toBe(false);
    await cliquer(pochette!);
    expect(document.querySelector('.v2-detail'), 'le calque album ne s’ouvre plus').toBeTruthy();
  });
});
