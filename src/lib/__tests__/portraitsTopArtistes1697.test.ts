// @vitest-environment jsdom
//
// #1697 — Daniel LEVY, forum fil 2005, 27/09/2026, 0.9.166, Docker Synology :
// « page accueil, widget Artistes les plus écoutés / les portraits restent
// noirs (alors qu'ils existent) ». La capture jointe au fil montre des carrés
// gris sombre portant l'INITIALE de l'artiste : c'est le repli
// `placeholder-initials` d'`AlbumArt`, celui qui s'affiche quand il n'y a pas
// d'image.
//
// ## CE QUI A ÉTÉ MESURÉ (serveur de test .18, 28/09/2026)
//
//   GET /library/history/dashboard?period=7d&top_n=50
//     → onze artistes sur cinquante SANS `cover_path` : « Brian Eno »,
//       « AC/DC », « Wire », « Adele », « Cat Stevens »… tous écoutés en
//       streaming, aucun album local à leur nom.
//
//   GET /library/history/top-artists?limit=200
//     → « Brian Eno » y porte
//       `image_path = https://static.qobuz.com/images/artists/covers/large/
//        1ed323fb2193e5e98561b878bf892db0.jpg`
//
//   GET /library/artwork/proxy?url=<cette URL>
//     → 200, image/jpeg, 33 050 octets.
//
// L'image existe donc bel et bien, sur une route que ce client appelle déjà
// ailleurs. Le widget ne la demandait jamais : il se contentait de
// `top_artists[].cover_path`, et rendait l'initiale dès qu'il était absent.
//
// ## POURQUOI CE TÉMOIN MONTE L'ÉCRAN
//
// Une garde qui n'appellerait que `charger()` prouverait qu'une chaîne a été
// rangée dans un objet, pas qu'un portrait est PEINT. Le défaut de Daniel est
// à l'écran : ce témoin monte `PageWidgets` avec le vrai widget, sert le
// tableau de bord amputé mesuré sur le .18, et regarde ce que porte la carte —
// une `<img>` avec l'URL du portrait, ou le carré à l'initiale.
//
// 🔴 CONTRE-ÉPREUVE dans le même fichier : l'artiste qui a DÉJÀ sa
// `cover_path` garde la sienne (le portrait ne doit rien écraser), et celui
// qu'aucune des deux routes ne connaît reste à l'initiale (on ne prétend pas
// avoir résolu tous les cas — onze trous mesurés, trois restaient sans
// portrait même sur `top-artists`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { widgetParId } from '../accueilWidgets';
import PageWidgets from '../../components/v2/PageWidgets.svelte';
import { currentProfileId } from '../stores/profile';
import { currentZoneId } from '../stores/zones';
import { activeView } from '../stores/navigation';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 60_000 });

class ObservateurInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const PORTRAIT_ENO =
  'https://static.qobuz.com/images/artists/covers/large/1ed323fb2193e5e98561b878bf892db0.jpg';
/** Un condensat de pochette d'album, tel que le tableau de bord le sert. */
const POCHETTE_GOLDFRAPP = '58e2d4f8fdfe69031c98b2251b9efc414a0d8b506b203cc0fc698f4b2e9a826d';

/**
 * `GET /library/history/dashboard` — trois artistes, exactement les trois cas
 * relevés sur le .18 :
 *   - Goldfrapp : le serveur a trouvé une pochette d'album ;
 *   - Brian Eno : rien, mais `top-artists` connaît son portrait ;
 *   - Wire : rien nulle part.
 */
const TABLEAU = {
  period: '7d',
  range: { from: null, to: '' },
  totals: { plays: 10, listening_ms: 1, unique_tracks: 3, unique_artists: 3 },
  top_artists: [
    { artist_name: 'Goldfrapp', plays: 32, listening_ms: 1, cover_path: POCHETTE_GOLDFRAPP },
    { artist_name: 'Brian Eno', plays: 1, listening_ms: 1 },
    { artist_name: 'Wire', plays: 2, listening_ms: 1 },
  ],
  top_albums: [],
  top_tracks: [],
  trend: [],
  hourly: [],
  by_zone: [],
  by_source: [],
  completion: { completed: 0, skipped: 0, avg_listened_ms: 0, avg_track_duration_ms: 0 },
};

/** `GET /library/history/top-artists` — la charge utile du .18, raccourcie. */
let TOP_ARTISTES: Record<string, unknown>[] = [];

let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
const respirer = () => new Promise((r) => setTimeout(r, 0));

function corpsPour(url: string): unknown {
  if (url.includes('/history/dashboard')) return TABLEAU;
  if (url.includes('/history/top-artists')) return TOP_ARTISTES;
  if (url.includes('/library/search')) return { artists: [], albums: [], tracks: [] };
  return [];
}

async function poserLaPage(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(PageWidgets, {
    target: hote,
    props: {
      catalogue: [widgetParId('top-artistes')!],
      dispositionDefaut: ['top-artistes'],
      cle: `accueil_portraits_1697_${Math.random()}`,
    },
  });
  for (let i = 0; i < 30; i++) await respirer();
  flushSync();
  return hote;
}

/** Les cartes de la bande, dans l'ordre servi. */
function cartes(page: HTMLElement): HTMLElement[] {
  return Array.from(page.querySelectorAll('.carte')) as HTMLElement[];
}

/** L'adresse de l'image peinte par la carte, ou `null` si c'est l'initiale. */
function imagePeinte(carte: HTMLElement): string | null {
  return (carte.querySelector('.album-art img') as HTMLImageElement | null)?.getAttribute('src') ?? null;
}

/** L'initiale de repli affichée par la carte, s'il y en a une. */
function initialePeinte(carte: HTMLElement): string | null {
  return carte.querySelector('.album-art .placeholder-initials')?.textContent?.trim() ?? null;
}

beforeEach(() => {
  locale.set('fr');
  TOP_ARTISTES = [
    { id: 1, artist_id: 1, name: 'Brian Eno', artist_name: 'Brian Eno', plays: 1, image_path: PORTRAIT_ENO },
    { id: 2, artist_id: 2, name: 'Wire', artist_name: 'Wire', plays: 2, image_path: null },
  ];
  currentProfileId.set(1);
  currentZoneId.set(1);
  activeView.set('home' as never);
  try {
    localStorage.clear();
  } catch {
    /* jsdom sans stockage */
  }
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: unknown) => {
      const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
      const corps = corpsPour(url);
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
  vi.stubGlobal(
    'WebSocket',
    class {
      close() {}
      addEventListener() {}
      removeEventListener() {}
      send() {}
    } as never,
  );
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote?.remove();
  hote = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('#1697 — « Artistes les plus écoutés » : le portrait existe, il doit être peint', () => {
  it('🔴 un artiste sans `cover_path` peint SON PORTRAIT, pas son initiale', async () => {
    const page = await poserLaPage();
    const bande = cartes(page);
    expect(bande.length, 'la bande n’a pas rendu ses trois artistes').toBe(3);

    const eno = bande[1];
    expect(
      initialePeinte(eno),
      'Brian Eno reste sur le carré à l’initiale : son portrait n’a pas été demandé (#1697)',
    ).toBeNull();
    const src = imagePeinte(eno);
    expect(src, 'aucune image peinte pour Brian Eno alors que son portrait existe (#1697)').toBeTruthy();
    // `artworkUrl` fait passer une URL absolue par le relais : c'est ce que le
    // .18 sert en 200 image/jpeg.
    expect(src).toContain('/library/artwork/proxy?url=');
    expect(decodeURIComponent(String(src))).toContain(PORTRAIT_ENO);
  });

  it('la pochette déjà servie par le tableau de bord garde la main', async () => {
    const page = await poserLaPage();
    const src = imagePeinte(cartes(page)[0]);
    expect(src, 'Goldfrapp a perdu la pochette que le serveur avait résolue').toContain(POCHETTE_GOLDFRAPP);
    expect(src, 'le portrait a écrasé une pochette d’album').not.toContain('proxy?url=');
  });

  it('l’artiste qu’AUCUNE route ne sait illustrer reste à l’initiale', async () => {
    const page = await poserLaPage();
    const wire = cartes(page)[2];
    expect(imagePeinte(wire), 'une image est peinte pour un artiste sans portrait').toBeNull();
    expect(initialePeinte(wire)).toBe('W');
  });

  it('un échec de la route des portraits laisse la bande debout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entree: unknown) => {
        const url = String(typeof entree === 'string' ? entree : (entree as Request)?.url ?? entree);
        if (url.includes('/history/top-artists')) throw new Error('portraits injoignables');
        const corps = corpsPour(url);
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
    const page = await poserLaPage();
    const bande = cartes(page);
    expect(bande.length, 'la bande entière a disparu parce que les portraits ont échoué').toBe(3);
    expect(imagePeinte(bande[0])).toContain(POCHETTE_GOLDFRAPP);
    expect(initialePeinte(bande[1])).toBe('B');
  });
});
