// @vitest-environment jsdom
//
// Lot 3 du chantier « un texte coupé se lit en entier » —
// renesenses/tune-server-rust#2411 : les listes « à soi » (Historique,
// Playlists, Favoris, Gestionnaire de playlists).
//
// 🔴 CES TÉMOINS APPELLENT, ILS NE LISENT PAS. On MONTE chaque vue, on la
// nourrit par la réponse littérale du serveur, on fait le geste, et on lit le
// DOM réellement peint.
//
// C'est la différence de fond avec les gardes des lots 0 à 2
// (`infobullesTronquees.ts`) : elles ouvrent le `.svelte` au disque et y
// cherchent la chaîne `title=`. Elles ne peuvent voir ni qu'une action n'est
// pas branchée, ni qu'un attribut n'arrive jamais dans le document — et
// c'est exactement l'angle mort « écrit mais pas branché » de ce dépôt.
//
// Ce que ce fichier verrouille, vue par vue :
//   • le texte coupé porte son infobulle DANS LE DOCUMENT ;
//   • elle porte la DONNÉE — le titre qu'on essaie de lire —, pas un libellé ;
//   • le clavier ouvre la bulle là où un ancêtre focalisable existe ;
//   • et là où il n'en existe pas, on n'invente AUCUN arrêt de tabulation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync, type Component } from 'svelte';
import HistoryView from '../../components/HistoryView.svelte';
import PlaylistsView from '../../components/PlaylistsView.svelte';
import FavoritesView from '../../components/FavoritesView.svelte';
import PlaylistManagerView from '../../components/PlaylistManagerView.svelte';
import { reinitialiserLeGeste } from '../infobulleTexte';
import { playbackHistory } from '../stores/history';
import {
  playlists,
  playlistsLoaded,
  streamingPlaylistsCache,
  streamingPlaylistsLoaded,
  pendingPlaylistId,
} from '../stores/playlists';
import { currentProfileId } from '../stores/profile';

// Monter quatre vues de plusieurs milliers de lignes compile beaucoup : les
// 5 s par défaut produisent un rouge de CHARGE, pas un rouge de code.
vi.setConfig({ testTimeout: 30_000 });

/** Des textes volontairement longs : ce sont eux que la colonne coupe. */
const TITRE_LONG = 'Nocturne n° 2 en mi bémol majeur, op. 9 — Andante, très expressif';
const ARTISTE_LONG = 'Orchestre de chambre de Lausanne, dir. Christian Zacharias';
const ALBUM_LONG = 'Nocturnes et Impromptus — intégrale des enregistrements de 1965';

const PISTE = {
  id: 101,
  title: TITRE_LONG,
  artist_name: ARTISTE_LONG,
  album_title: ALBUM_LONG,
  album_id: null,
  cover_path: null,
  duration_ms: 271000,
  source: 'local',
};

/**
 * L'ordre compte : `/playlists/collaborative/9/tracks` doit être reconnu avant
 * `/playlists/42/tracks`, et `/playlists/401` avant `/playlists?limit=`.
 */
function corpsPour(url: string): unknown {
  if (url.includes('/library/history')) {
    return {
      items: [
        {
          track_id: 101,
          title: TITRE_LONG,
          artist_name: ARTISTE_LONG,
          album_title: ALBUM_LONG,
          duration_ms: 271000,
          source: 'local',
          source_id: null,
          album_id: null,
          cover_url: null,
          listened_at: '2026-09-08T10:00:00Z',
          zone_id: 3,
        },
      ],
      total: 1,
    };
  }
  if (url.includes('/radio-favorites')) return [];
  if (url.includes('/streaming/services')) return {};

  // ---- Favoris
  if (/\/profiles\/1\/favorites\/facets/.test(url)) {
    return [
      {
        profile_id: 1,
        facet: 'label',
        value: 'Deutsche Grammophon — Originals, série jaune',
        created_at: '2026-09-05T10:00:00Z',
      },
    ];
  }
  if (/\/profiles\/1\/favorites\/streaming/.test(url)) return [];
  if (/\/profiles\/1\/favorites$/.test(url)) {
    return [
      { item_type: 'track', item_id: 101, created_at: '2026-09-01T10:00:00Z' },
      { item_type: 'album', item_id: 201, created_at: '2026-09-02T10:00:00Z' },
      { item_type: 'artist', item_id: 301, created_at: '2026-09-03T10:00:00Z' },
    ];
  }
  if (url.includes('/library/tracks/101')) return PISTE;
  if (url.includes('/library/albums/201')) {
    return { id: 201, title: ALBUM_LONG, artist_name: ARTISTE_LONG, cover_path: null };
  }
  if (url.includes('/library/artists/301')) {
    return { id: 301, name: ARTISTE_LONG, image_path: null };
  }

  // ---- Playlists
  if (url.includes('/playlists/42/tracks')) return [PISTE];
  if (/\/playlists(\?|$)/.test(url)) {
    return [{ id: 42, name: 'Nocturnes', track_count: 1 }];
  }
  return [];
}

let appels: string[] = [];
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;

const respirer = () => new Promise((r) => setTimeout(r, 0));

async function souffler(n = 3) {
  for (let i = 0; i < n; i++) {
    await respirer();
    flushSync();
  }
}

async function monter<P extends Record<string, unknown>>(
  Vue: Component<P>,
  props: P,
): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(Vue, { target: hote, props });
  flushSync();
  await souffler(4);
  return hote;
}

const bulles = () => Array.from(document.querySelectorAll('.bulle-texte-coupe'));

/** Le focus PAR LE CLAVIER, tel que le navigateur l'émet. */
function focaliserAuClavier(el: HTMLElement) {
  reinitialiserLeGeste();
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  reinitialiserLeGeste();
  appels = [];
  localStorage.clear();
  playbackHistory.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  vi.stubGlobal(
    'WebSocket',
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    } as unknown as typeof WebSocket,
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      appels.push(String(url));
      const corps = corpsPour(String(url));
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
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  document.querySelectorAll('.bulle-texte-coupe').forEach((b) => b.remove());
  pendingPlaylistId.set(null);
  currentProfileId.set(null);
  playlists.set([]);
  playlistsLoaded.set(false);
  streamingPlaylistsCache.set({});
  streamingPlaylistsLoaded.set(false);
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------- Historique

describe('#2411 — Historique', () => {
  it('🔴 le titre coupé porte son infobulle DANS LE DOCUMENT, et elle dit la DONNÉE', async () => {
    const el = await monter(HistoryView, {});

    expect(el.querySelectorAll('.history-item').length, 'aucune ligne peinte').toBe(1);
    const titre = el.querySelector('.history-title') as HTMLElement;
    expect(titre, 'le titre a disparu du balisage').not.toBeNull();
    // Pas un libellé d'interface : le texte qu'on essaie justement de lire.
    expect(titre.getAttribute('title')).toBe(TITRE_LONG);

    const artiste = el.querySelector('.history-artist') as HTMLElement;
    expect(artiste.getAttribute('title')).toBe(ARTISTE_LONG);
  });

  it('🔴 le focus AU CLAVIER ouvre la bulle — ce que le `title` natif ne fait jamais', async () => {
    const el = await monter(HistoryView, {});

    // La ligne EST un `<button class="history-main">` : la tabulation
    // l'atteint, et jusqu'ici elle n'apprenait rien de plus que la colonne.
    const ligne = el.querySelector('button.history-main') as HTMLButtonElement;
    expect(ligne, 'la ligne focalisable a disparu').not.toBeNull();
    focaliserAuClavier(ligne);

    const ouvertes = bulles();
    expect(ouvertes.length, 'aucune bulle au focus clavier').toBe(1);
    expect(ouvertes[0].getAttribute('role')).toBe('tooltip');
    // Le lecteur d'écran lit déjà le texte entier : ne pas le dire deux fois.
    expect(ouvertes[0].getAttribute('aria-hidden')).toBe('true');
  });

  it('🔴 le focus pris à la SOURIS n’ouvre rien — pas de doublon avec la bulle native', async () => {
    const el = await monter(HistoryView, {});
    const ligne = el.querySelector('button.history-main') as HTMLButtonElement;

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    ligne.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(bulles().length).toBe(0);
  });

  it('aucun `tabindex` n’a été fabriqué sur les textes eux-mêmes', async () => {
    const el = await monter(HistoryView, {});

    for (const s of ['.history-title', '.history-artist', '.history-zone']) {
      const n = el.querySelector(s) as HTMLElement;
      expect(n.hasAttribute('tabindex'), `${s} a gagné un arrêt de tabulation`).toBe(false);
    }
  });
});

// ------------------------------------------------------------------ Playlists

describe('#2411 — Playlists', () => {
  async function ouvrirLaPlaylist(): Promise<HTMLDivElement> {
    playlists.set([{ id: 42, name: 'Nocturnes', track_count: 1 } as never]);
    playlistsLoaded.set(true);
    streamingPlaylistsCache.set({});
    streamingPlaylistsLoaded.set(true);
    const el = await monter(PlaylistsView, { onAddToPlaylist: () => {} });

    const ouvrir = el.querySelector(
      '.playlist-list .playlist-item .playlist-btn',
    ) as HTMLButtonElement;
    expect(ouvrir, "aucune playlist à ouvrir dans la liste peinte").not.toBeNull();
    ouvrir.click();
    await souffler(3);
    return el;
  }

  it('🔴 la piste ouverte porte titre ET artiste en infobulle', async () => {
    const el = await ouvrirLaPlaylist();

    expect(appels.some((u) => u.includes('/playlists/42/tracks'))).toBe(true);
    const titre = el.querySelector('.track-list .track-title') as HTMLElement;
    expect(titre, 'aucune piste peinte après ouverture').not.toBeNull();
    expect(titre.getAttribute('title')).toBe(TITRE_LONG);

    const artiste = el.querySelector('.track-list .track-artist') as HTMLElement;
    expect(artiste.getAttribute('title')).toBe(ARTISTE_LONG);
  });

  it('🔴 le focus clavier sur la ligne de piste ouvre la bulle', async () => {
    const el = await ouvrirLaPlaylist();

    const ligne = el.querySelector('.track-list button.track-play') as HTMLButtonElement;
    expect(ligne, 'la ligne de piste focalisable a disparu').not.toBeNull();
    focaliserAuClavier(ligne);

    expect(bulles().length, 'aucune bulle au focus clavier').toBe(1);
    // Une ligne, UNE bulle : elle dit le titre ET l'artiste, sinon le second chasserait
    // le premier et le titre — celui qu'on cherchait à lire — resterait invisible.
    expect(bulles()[0].textContent).toContain(TITRE_LONG);
    expect(bulles()[0].textContent).toContain(ARTISTE_LONG);
  });
});

// -------------------------------------------------------------------- Favoris

describe('#2411 — Favoris', () => {
  const onglet = (el: HTMLElement, i: number) =>
    el.querySelectorAll('.favorites-header .tab-bar .tab')[i] as HTMLButtonElement;

  async function monterFavoris(): Promise<HTMLDivElement> {
    currentProfileId.set(1);
    const el = await monter(FavoritesView, { onAddToPlaylist: () => {} });
    await souffler(4);
    return el;
  }

  it('🔴 onglet Pistes : le titre et la ligne de méta portent leur infobulle', async () => {
    const el = await monterFavoris();

    const titre = el.querySelector('.track-list .track-title') as HTMLElement;
    expect(titre, 'aucune piste favorite peinte').not.toBeNull();
    expect(titre.getAttribute('title')).toBe(TITRE_LONG);

    // `.track-meta` compose artiste et album : la bulle dit la ligne entière,
    // qui est précisément ce que la colonne coupe.
    const meta = el.querySelector('.track-list .track-meta') as HTMLElement;
    expect(meta.getAttribute('title')).toContain(ARTISTE_LONG);
    expect(meta.getAttribute('title')).toContain(ALBUM_LONG);
  });

  it('🔴 onglet Albums : titre et artiste de la vignette', async () => {
    const el = await monterFavoris();
    onglet(el, 1).click();
    await souffler(2);

    const titre = el.querySelector('.albums-grid .album-card-title') as HTMLElement;
    expect(titre, 'aucun album favori peint').not.toBeNull();
    expect(titre.getAttribute('title')).toBe(ALBUM_LONG);

    const artiste = el.querySelector('.albums-grid .album-card-artist') as HTMLElement;
    expect(artiste.getAttribute('title')).toBe(ARTISTE_LONG);
  });

  it('🔴 onglet Artistes : le nom de la vignette', async () => {
    const el = await monterFavoris();
    onglet(el, 2).click();
    await souffler(2);

    const nom = el.querySelector('.artists-grid .artist-card-name') as HTMLElement;
    expect(nom, 'aucun artiste favori peint').not.toBeNull();
    expect(nom.getAttribute('title')).toBe(ARTISTE_LONG);
  });

  it('🔴 onglet Labels : la valeur de facette', async () => {
    const el = await monterFavoris();
    onglet(el, 4).click();
    await souffler(2);

    const label = el.querySelector('.track-list .track-title') as HTMLElement;
    expect(label, 'aucun label favori peint').not.toBeNull();
    expect(label.getAttribute('title')).toBe(
      'Deutsche Grammophon — Originals, série jaune',
    );
  });

  it('⚠️ ces vignettes ne sont atteignables par AUCUNE tabulation — et on ne leur en fabrique pas', async () => {
    // `.track-item`, `.album-card`, `.artist-card` sont des `<div onclick>`.
    // La bulle du clavier n'a donc rien à ouvrir ici : le vrai défaut est que
    // la LIGNE elle-même n'est pas focalisable, et il est hors de ce chantier.
    // On verrouille au moins qu'on n'a pas maquillé le trou en semant des
    // `tabindex` sur des `<span>` décoratifs.
    const el = await monterFavoris();

    const titre = el.querySelector('.track-list .track-title') as HTMLElement;
    expect(titre.hasAttribute('tabindex')).toBe(false);
    expect((titre.closest('.track-item') as HTMLElement).hasAttribute('tabindex')).toBe(
      false,
    );

    focaliserAuClavier(titre.closest('.track-item') as HTMLElement);
    expect(bulles().length, 'une bulle est apparue sans ancêtre focalisable').toBe(0);
    // Le survol, lui, fonctionne : c'est ce que le `title` couvre.
    expect(titre.getAttribute('title')).toBe(TITRE_LONG);
  });
});

// ------------------------------------------------- Gestionnaire de playlists

describe('#2411 — Gestionnaire de playlists', () => {
  async function monterGestionnaire(): Promise<HTMLDivElement> {
    // `loadAll()` lit `pendingPlaylistId` et ouvre la fiche sans un clic.
    pendingPlaylistId.set(42);
    const el = await monter(PlaylistManagerView, { onAddToPlaylist: () => {} });
    await souffler(4);
    return el;
  }

  it('🔴 la piste de la fiche porte titre ET artiste en infobulle', async () => {
    const el = await monterGestionnaire();

    expect(appels.some((u) => u.includes('/playlists/42/tracks'))).toBe(true);
    const titre = el.querySelector('.track-list .track-title') as HTMLElement;
    expect(titre, 'aucune piste peinte dans la fiche').not.toBeNull();
    expect(titre.getAttribute('title')).toBe(TITRE_LONG);

    const artiste = el.querySelector('.track-list .track-artist') as HTMLElement;
    expect(artiste.getAttribute('title')).toBe(ARTISTE_LONG);
  });

  it('🔴 le focus clavier sur la ligne ouvre la bulle', async () => {
    const el = await monterGestionnaire();

    const ligne = el.querySelector('.track-list button.track-play') as HTMLButtonElement;
    expect(ligne, 'la ligne de piste focalisable a disparu').not.toBeNull();
    focaliserAuClavier(ligne);

    expect(bulles().length, 'aucune bulle au focus clavier').toBe(1);
    // Une ligne, UNE bulle : elle dit le titre ET l'artiste, sinon le second chasserait
    // le premier et le titre — celui qu'on cherchait à lire — resterait invisible.
    expect(bulles()[0].textContent).toContain(TITRE_LONG);
    expect(bulles()[0].textContent).toContain(ARTISTE_LONG);
  });
});
