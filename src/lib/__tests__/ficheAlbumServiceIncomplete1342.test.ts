// @vitest-environment jsdom
//
// « ALLER À L'ALBUM » OUVRAIT UNE FICHE NUE — #1342.
//
// FabienM, fil forum 1859 (20/09/2026), v0.9.158, point 4 :
//
//   « Lien vers l'album depuis l'action "Aller à l'album" renvoie à une page
//     incomplète (ici dans l'exemple renvoie à la figure 2 alors que ca
//     devrait rester sur la figure 1). Il manque sur la figure 2 la vignette
//     de l'album et le nom de l'artiste »
//
// Même album, même service — « Second Song » de Neil Young, Qobuz — ouvert
// deux fois : depuis l'écran Streaming (figure 1, complète) et depuis le menu
// « … » d'une de ses pistes (figure 2, carré gris à l'initiale, ni artiste ni
// année).
//
// ══════════════════════════════════════════════════════════════════════════
// LA CAUSE, EN DEUX ÉTAGES
//
//  1. La charge utile du menu ne portait PAS la pochette. Le champ existe
//     depuis #1114 (`GestesNavigationService.ouvrirAlbum`), et seul l'appelant
//     « Lecture en cours » le remplissait. Or `StreamTrack.cover_path` EST la
//     pochette de l'album (`map_track` : `Self::pochette(album)`), mesuré le
//     20/09/2026 :
//       GET /streaming/qobuz/albums/atua1kxxk4tis/tracks
//       → [{"source_id":"441078583","title":"Second Song",
//           "artist_name":"Neil Young","artist_id":"35865",
//           "cover_path":"…/atua1kxxk4tis_600.jpg","year":null}]
//
//  2. 🔴 Et la fiche NE RELIT JAMAIS L'ALBUM. Pour un service elle ne demande
//     que ses pistes : tout ce que l'appelant oublie reste vide, et chaque
//     nouvel appelant rouvre le même trou. L'ANNÉE, elle, n'est dans la charge
//     d'aucun appelant et n'est sur AUCUNE piste — elle ne pouvait venir que
//     de là. La route existe et rend tout (mesurée le 20/09/2026) :
//       GET /streaming/qobuz/albums/atua1kxxk4tis
//       → {"artist_id":"35865","artist_name":"Neil Young",
//          "cover_path":"…_600.jpg","title":"Second Song","year":2026,…}
//
// ⚠️ CE TÉMOIN MONTE ET CLIQUE. Il ne lit aucun texte de composant : la
// charge utile est saisie au vol par un faux `gestesNavigationService`, et
// l'en-tête est lu dans le DOM réellement rendu.
// ══════════════════════════════════════════════════════════════════════════
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AlbumDetailV2 from '../../components/v2/AlbumDetailV2.svelte';
import PisteActions from '../../components/v2/PisteActions.svelte';
import { gestesNavigationService } from '../stores/navigation';
import { currentZoneId } from '../stores/zones';

vi.setConfig({ testTimeout: 30_000 });

const SID = 'atua1kxxk4tis';
const POCHETTE = `https://static.qobuz.com/images/covers/is/4t/${SID}_600.jpg`;

/** `GET /streaming/qobuz/albums/{id}` — la réponse mesurée sur le .18. */
const DETAIL = {
  source_id: SID, title: 'Second Song', artist_name: 'Neil Young',
  artist_id: '35865', cover_path: POCHETTE, year: 2026, track_count: 7,
};

/** `GET /streaming/qobuz/albums/{id}/tracks` — la pochette de l'ALBUM y est. */
const PISTES = [
  { source_id: '441078583', title: 'Second Song', artist_name: 'Neil Young',
    artist_id: '35865', album_title: 'Second Song', album_id: SID,
    cover_path: POCHETTE, duration_ms: 360000 },
];

/** La fiche telle que le menu « … » la faisait ouvrir : trois champs. */
const FICHE_NUE = {
  id: null, title: 'Second Song', source: 'qobuz', source_id: SID,
  cover_path: null, artist_name: null, artist_id: null,
};

let appels: string[] = [];

function reponse(corps: unknown) {
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
const ouvrirAlbum = vi.fn();
const ouvrirArtiste = vi.fn();

const attendre = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function poser(composant: any, props: Record<string, unknown>): HTMLDivElement {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: props as any });
  flushSync();
  return hote;
}

beforeEach(() => {
  appels = [];
  ouvrirAlbum.mockClear();
  ouvrirArtiste.mockClear();
  currentZoneId.set(1);
  gestesNavigationService.set({ ouvrirAlbum, ouvrirArtiste } as never);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: any) => {
      const u = String(url);
      appels.push(u);
      if (/\/albums\/[^/]+\/tracks/.test(u)) return reponse(PISTES);
      if (/\/streaming\/qobuz\/albums\//.test(u)) return reponse(DETAIL);
      return reponse([]);
    }),
  );
  vi.stubGlobal('WebSocket', class {
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  gestesNavigationService.set(null);
  currentZoneId.set(null);
  vi.unstubAllGlobals();
});

/** Les appels au DÉTAIL de l'album — pas à ses pistes. */
const appelsDetail = () =>
  appels.filter((u) => /\/streaming\/qobuz\/albums\//.test(u) && !/\/tracks/.test(u));

/**
 * ⚠️ `AlbumArt` ne pose pas l'URL du service telle quelle : une adresse
 * absolue passe par le relais du serveur
 * (`/api/v1/library/artwork/proxy?url=…`, `api.artworkUrl`). On garde donc le
 * `src` rendu, et on y cherche l'identifiant de la pochette.
 */
const enTete = (el: HTMLElement) => ({
  pochette: el.querySelector<HTMLImageElement>('.art img')?.getAttribute('src') ?? null,
  artiste: el.querySelector('.artist')?.textContent?.trim() ?? null,
  lienArtiste: !!el.querySelector('button.artist.lien'),
  faits: Array.from(el.querySelectorAll('.facts span')).map((n) => n.textContent?.trim()),
});

describe('#1342 — la fiche nue du menu « … » se complète à la source', () => {
  it('🔴 la POCHETTE revient — le carré gris à l’initiale de la figure 2', async () => {
    const el = poser(AlbumDetailV2, { album: { ...FICHE_NUE }, service: 'qobuz', onClose: () => {} });
    await attendre();
    flushSync();
    expect(
      enTete(el).pochette,
      'la fiche reste sur son carré gris : rien n’est allé chercher la pochette',
    ).toContain(encodeURIComponent(POCHETTE));
  });

  it('🔴 le NOM DE L’ARTISTE revient, et il est cliquable', async () => {
    const el = poser(AlbumDetailV2, { album: { ...FICHE_NUE }, service: 'qobuz', onClose: () => {} });
    await attendre();
    flushSync();
    const vu = enTete(el);
    expect(vu.artiste, 'aucun artiste sur la fiche — mot pour mot le signalement').toBe('Neil Young');
    expect(vu.lienArtiste, 'le nom est là mais mort : il ne mène pas à la fiche de l’artiste').toBe(true);
  });

  it('🔴 l’ANNÉE revient — elle n’est sur AUCUNE piste, donc nulle part ailleurs', async () => {
    const el = poser(AlbumDetailV2, { album: { ...FICHE_NUE }, service: 'qobuz', onClose: () => {} });
    await attendre();
    flushSync();
    expect(enTete(el).faits, 'la ligne de faits n’annonce pas l’année de l’album').toContain('2026');
  });

  it('un en-tête DÉJÀ complet ne demande rien au service', async () => {
    // Le filet ne coûte une requête qu'aux fiches qui s'ouvriraient nues.
    poser(AlbumDetailV2, {
      album: { ...FICHE_NUE, cover_path: POCHETTE, artist_name: 'Neil Young', artist_id: '35865', year: 2026 },
      service: 'qobuz', onClose: () => {},
    });
    await attendre();
    flushSync();
    expect(appelsDetail(), `appels vus : ${JSON.stringify(appels)}`).toEqual([]);
  });

  it('ce que l’appelant porte PRIME sur la réponse du service', async () => {
    const el = poser(AlbumDetailV2, {
      album: { ...FICHE_NUE, artist_name: 'Neil Young & The Chrome Hearts' },
      service: 'qobuz', onClose: () => {},
    });
    await attendre();
    flushSync();
    const vu = enTete(el);
    expect(vu.artiste, 'le nom du service a écrasé celui de l’appelant').toBe('Neil Young & The Chrome Hearts');
    // …et les trous, eux, sont comblés.
    expect(vu.pochette).toContain(encodeURIComponent(POCHETTE));
  });

  it('un album LOCAL ne déclenche aucun appel de service', async () => {
    poser(AlbumDetailV2, {
      album: { id: 42, title: 'Harvest', artist_name: null, cover_path: null } as never,
      onClose: () => {},
    });
    await attendre();
    flushSync();
    expect(appelsDetail()).toEqual([]);
  });
});

describe('#1342 — le menu « … » d’une piste de service emporte la pochette', () => {
  /** Ouvre le menu et clique « Aller à l'album ». */
  async function allerALAlbum(piste: Record<string, unknown>) {
    const el = poser(PisteActions, { piste });
    await attendre();
    flushSync();
    const plus = Array.from(el.querySelectorAll<HTMLButtonElement>('button.pa'))
      .find((b) => b.getAttribute('aria-haspopup') === 'menu');
    plus!.click();
    flushSync();
    const entree = Array.from(document.querySelectorAll<HTMLButtonElement>('.menu button.item'))
      .find((b) => (b.textContent ?? '').includes('Aller à l’album') || (b.textContent ?? '').includes("Aller à l'album"));
    expect(entree, 'l’entrée « Aller à l’album » n’est pas dans le menu').toBeTruthy();
    entree!.click();
    flushSync();
  }

  it('🔴 la charge utile porte `pochette` — celle de la piste EST celle de l’album', async () => {
    await allerALAlbum({
      id: null, source_id: '441078583', title: 'Second Song', source: 'qobuz',
      artist_name: 'Neil Young', artist_id: '35865',
      album_title: 'Second Song', album_id: SID, cover_path: POCHETTE, duration_ms: 360000,
    });
    expect(ouvrirAlbum).toHaveBeenCalledTimes(1);
    const charge = ouvrirAlbum.mock.calls[0][0];
    expect(charge.service).toBe('qobuz');
    expect(charge.albumId).toBe(SID);
    expect(
      charge.pochette,
      'le menu ouvre l’album sans sa pochette : la fiche n’affichera que l’initiale',
    ).toBe(POCHETTE);
    // Acquis de #1369, qu'on ne doit pas perdre en passant.
    expect(charge.artiste).toBe('Neil Young');
    expect(charge.artisteId).toBe('35865');
  });

  it('une piste SANS pochette ne fabrique rien : le champ reste nul', async () => {
    await allerALAlbum({
      id: null, source_id: '2', title: 'X', source: 'qobuz',
      artist_name: 'Neil Young', album_title: 'Second Song', album_id: SID, duration_ms: 1000,
    });
    expect(ouvrirAlbum.mock.calls[0][0].pochette).toBe(null);
  });
});
