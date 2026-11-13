// @vitest-environment jsdom
/**
 * web#3001 (go de Bertrand du 13/11, rc12) — bibliothèque d'un contact : un
 * album SANS vignette prend la pochette du même album dans MES sources (ma
 * bibliothèque, puis Qobuz / TIDAL connectés), retrouvée par le serveur
 * (`POST /ext/circle/my-sources/album-covers`), discrètement marquée
 * « Pochette de mes sources ».
 *
 * Contrat : UNE demande par page arrivée, pour ses seuls albums sans
 * vignette ; jamais une demande par album ; un album déjà demandé ne l'est
 * plus ; la vignette du contact gagne toujours. Tout est simulé : aucun réseau.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CatalogueContactV2 from '../../components/v2/CatalogueContactV2.svelte';
import { locale } from '../i18n';
import { albumsSansVignette, pochettesAvecMesSources, pochettesDeMesSources } from '../circle';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

const SHA = '7dd7622944e688de7d6cde44858de18dd49d835d1c4146427c36153bd2610d7b';
const MBID = '0f3c6ba8-2c3a-4a77-9c3b-6d2f2a0c3e11';
const LOCALE = '0123456789abcdef0123456789abcdef';
const album = (id: number, title: string, artist: string | null, thumbnail: string | null = null, mbid: string | null = null) => ({
  id, title, artist_name: artist, genre: null, year: null, track_count: 10, musicbrainz_release_group_id: mbid, thumbnail,
});
const PAGE1 = {
  data: [
    album(1, 'Avec vignette', 'A', SHA),
    album(2, 'Follow', 'Joël Grare'),
    album(3, 'Introuvable', 'Personne', null, MBID),
    album(4, 'Sans artiste', null),
  ],
  current_page: 1, last_page: 2, per_page: 50, total: 6,
};
const PAGE2 = {
  data: [album(5, 'Rumours', 'Fleetwood Mac'), album(6, 'Autre vignette', 'B', SHA)],
  current_page: 2, last_page: 2, per_page: 50, total: 6,
};

let demandes: { url: string; corps: any }[] = [];
let reponseMesSources: (corps: any) => [number, unknown];
let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

function reponse(statut: number, charge: unknown): Response {
  return {
    ok: statut >= 200 && statut < 300, status: statut,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(charge),
    json: async () => charge,
  } as unknown as Response;
}

beforeEach(() => {
  demandes = [];
  reponseMesSources = (corps) => [200, {
    covers: corps.albums.map((a: any) =>
      a.title === 'Follow' ? { source: 'local', cover_path: `/api/v1/library/artwork/${LOCALE}`, album_id: 77 }
        : a.title === 'Rumours' ? { source: 'tidal', cover_path: 'https://resources.tidal.com/r.jpg' }
          : null),
  }];
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const corps = init?.body ? JSON.parse(String(init.body)) : null;
    demandes.push({ url, corps });
    if (/\/my-sources\/album-covers/.test(url)) return reponse(...reponseMesSources(corps));
    if (/\/contacts\/881\/library\/albums\?.*page=2/.test(url)) return reponse(200, PAGE2);
    if (/\/contacts\/881\/library\/albums\?/.test(url)) return reponse(200, PAGE1);
    if (/\/contacts\/881\/library\/stats/.test(url)) return reponse(200, { tracks: 60, albums: 6, artists: 5, thumbnails: 2 });
    if (/\/contacts\/881\/sets/.test(url)) return reponse(200, []);
    return reponse(200, {});
  }));
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  vi.unstubAllGlobals();
});

const mesSources = () => demandes.filter((d) => /\/ext\/circle\/my-sources\/album-covers$/.test(d.url));
const tuile = (titre: string) =>
  [...hote.querySelectorAll('ul.albums > li')].find((li) => li.querySelector('.album-nom')?.textContent === titre)!;

function monter() {
  monte = mount(CatalogueContactV2, { target: hote, props: { contact: { user_id: 881, name: 'Tades' }, onFermer: () => {} } });
}

describe('web#3001 — la pochette de mes sources quand la vignette manque', () => {
  it('une seule demande pour la page, ses seuls albums sans vignette, et la marque discrète', async () => {
    monter();
    await souffler();
    expect(mesSources()).toHaveLength(1);
    expect(mesSources()[0].corps).toEqual({
      albums: [
        { title: 'Follow', artist_name: 'Joël Grare' },
        { title: 'Introuvable', artist_name: 'Personne' },
      ],
    });

    // Retrouvée dans ma bibliothèque : l'image, et la marque.
    const follow = tuile('Follow');
    expect(follow.querySelector('img')?.getAttribute('src')).toBe(`/api/v1/library/artwork/${LOCALE}`);
    expect(follow.querySelector('.pochette-mienne')?.textContent).toBe('Pochette de mes sources');

    // La vignette du contact reste la sienne, sans marque.
    const avec = tuile('Avec vignette');
    expect(avec.querySelector('img')?.getAttribute('src')).toContain('/ext/circle/contacts/881/library/albums/1/thumbnail');
    expect(avec.querySelector('.pochette-mienne')).toBeNull();

    // Rien dans mes sources : Cover Art Archive comme avant, sans marque.
    const introuvable = tuile('Introuvable');
    expect(introuvable.querySelector('img')?.getAttribute('src')).toContain('coverartarchive.org');
    expect(introuvable.querySelector('.pochette-mienne')).toBeNull();
    expect(tuile('Sans artiste').querySelector('.pochette-mienne')).toBeNull();
  });

  it('la page suivante fait UNE demande de plus, pour ses seuls nouveaux albums sans vignette', async () => {
    monter();
    await souffler();
    (hote.querySelector('button.plus') as HTMLButtonElement).click();
    await souffler();
    expect(mesSources()).toHaveLength(2);
    expect(mesSources()[1].corps).toEqual({ albums: [{ title: 'Rumours', artist_name: 'Fleetwood Mac' }] });
    const rumours = tuile('Rumours');
    expect(rumours.querySelector('img')?.getAttribute('src')).toBe(
      `/api/v1/library/artwork/proxy?url=${encodeURIComponent('https://resources.tidal.com/r.jpg')}`,
    );
    expect(rumours.querySelector('.pochette-mienne')).not.toBeNull();
  });

  it('un greffon sans la route (404) ou en panne laisse la grille comme avant', async () => {
    reponseMesSources = () => [404, { error: 'Not Found' }];
    monter();
    await souffler();
    expect(mesSources()).toHaveLength(1);
    expect(hote.querySelectorAll('ul.albums > li')).toHaveLength(4);
    expect(hote.querySelector('.pochette-mienne')).toBeNull();
    expect(hote.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('web#3001 — les règles, sans écran', () => {
  it('albumsSansVignette : sans vignette, avec titre et artiste, pas déjà demandés, 50 au plus', () => {
    const page = [album(1, 'a', 'x', SHA), album(2, 'b', 'y'), album(3, 'c', ''), album(4, '', 'z'), album(5, 'e', 'w')];
    expect(albumsSansVignette(page, new Set([5])).map((a) => a.id)).toEqual([2]);
    const grande = Array.from({ length: 80 }, (_, i) => album(i + 1, `t${i}`, 'x'));
    expect(albumsSansVignette(grande, new Set())).toHaveLength(50);
  });

  it('pochettesAvecMesSources : la vignette du contact gagne, sinon la mienne avant Cover Art Archive', () => {
    const mienne = { source: 'qobuz', cover_path: 'https://q/1.jpg' };
    expect(pochettesAvecMesSources(album(1, 'a', 'x', SHA), 881, mienne).deMesSources).toBe(false);
    const sansVignette = pochettesAvecMesSources(album(2, 'b', 'y', null, MBID), 881, mienne);
    expect(sansVignette).toEqual({
      coverPath: 'https://q/1.jpg',
      repli: `https://coverartarchive.org/release-group/${MBID}/front-250`,
      deMesSources: true,
    });
    expect(pochettesAvecMesSources(album(3, 'c', 'z'), 881, null)).toEqual({ coverPath: null, repli: null, deMesSources: false });
  });

  it('pochettesDeMesSources : réponse incomplète ou mal formée lue « rien »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponse(200, { covers: [{ source: 'local' }, { source: 'tidal', cover_path: 'https://t/x.jpg' }] })));
    const r = await pochettesDeMesSources([
      { title: 'a', artist_name: 'x' }, { title: 'b', artist_name: 'y' }, { title: 'c', artist_name: 'z' },
    ]);
    expect(r).toEqual([null, { source: 'tidal', cover_path: 'https://t/x.jpg' }, null]);
    expect(await pochettesDeMesSources([])).toEqual([]);
  });
});
