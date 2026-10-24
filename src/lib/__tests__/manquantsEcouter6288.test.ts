// @vitest-environment jsdom
//
// tune-server-rust#6288, suite — sur chaque album manquant qu'un service
// connecté a : « Écouter » et « Ajouter aux favoris » sur ce service.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  getArtistMissingAlbums: vi.fn(),
  playAndSync: vi.fn(async () => ({})),
  toggleStreamingFavorite: vi.fn(async () => true),
  zoneRequise: vi.fn(() => 7),
}));
vi.mock('../api', async (o) => ({ ...(await o<typeof import('../api')>()), getArtistMissingAlbums: mocks.getArtistMissingAlbums }));
vi.mock('../stores/zones', async (o) => ({ ...(await o<typeof import('../stores/zones')>()), playAndSync: mocks.playAndSync }));
vi.mock('../streamingFavorites', async (o) => ({ ...(await o<typeof import('../streamingFavorites')>()), toggleStreamingFavorite: mocks.toggleStreamingFavorite }));
vi.mock('../zoneRequise', () => ({ zoneRequise: mocks.zoneRequise }));

import AlbumsManquants from '../../components/v2/AlbumsManquants.svelte';
import { cleDeTitre, trouverSurUnService } from '../albumsManquants';
import { favKeyOf } from '../streamingFavorites';
import { favoriteStreamingKeys } from '../stores/profile';
import { t } from '../i18n';

const tr = (cle: string) => get(t)(cle);

const SECTIONS = [
  { service: 'qobuz', albums: [
    { title: 'Kind of Blue (Legacy Edition)', source_id: 'q-kob', artist_name: 'Miles Davis', cover_path: 'https://c/kob.jpg' },
    { title: 'Kind of Blue Live', source_id: 'q-live' },
  ] },
  { service: 'tidal', albums: [
    { title: 'Sketches of Spain', source_id: 't-sos' },
    { title: 'Kind of Blue', source_id: 't-kob' },
  ] },
];

describe('apparier un manque à un service', () => {
  it('le titre identique une fois la mention d’édition retirée', () => {
    expect(cleDeTitre('Abbey Road [Remastered 2009] (Deluxe)')).toBe('abbey road');
    expect(cleDeTitre('Été 67 !')).toBe('ete 67');
    expect(trouverSurUnService('Kind of Blue', SECTIONS)).toMatchObject({ service: 'qobuz', sourceId: 'q-kob' });
    expect(trouverSurUnService('Sketches of Spain', SECTIONS)).toMatchObject({ service: 'tidal', sourceId: 't-sos' });
  });
  it('ni un autre titre qui le contient, ni un album sans identifiant', () => {
    expect(trouverSurUnService('Blue', SECTIONS)).toBeNull();
    expect(trouverSurUnService('Nefertiti', [{ service: 'qobuz', albums: [{ title: 'Nefertiti' }] }])).toBeNull();
    expect(trouverSurUnService('Kind of Blue', [])).toBeNull();
  });
});

describe('la section « Albums manquants »', () => {
  let cible: HTMLElement;
  let monte: ReturnType<typeof mount> | null = null;
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    cible?.remove();
    vi.clearAllMocks();
    favoriteStreamingKeys.set(new Set());
  });

  async function comparer(services: any[]) {
    mocks.getArtistMissingAlbums.mockResolvedValue({
      statut: 'ok', mbid: 'x', possedes: 1, retenus: 3,
      manquants: [
        { mbid: '11111111-1111-1111-1111-111111111111', titre: 'Kind of Blue', type_primaire: 'Album' },
        { mbid: '22222222-2222-2222-2222-222222222222', titre: 'Nefertiti', type_primaire: 'Album' },
      ],
    });
    cible = document.createElement('div');
    document.body.appendChild(cible);
    monte = mount(AlbumsManquants, { target: cible, props: { artistId: 3, services } });
    flushSync();
    (cible.querySelector('button.ghost') as HTMLButtonElement).click();
    for (let i = 0; i < 4; i++) { await Promise.resolve(); await tick(); }
    flushSync();
  }

  it('« Écouter » lance l’album du service, « Ajouter aux favoris » le pose chez lui', async () => {
    await comparer(SECTIONS);
    const items = [...cible.querySelectorAll('li')];
    expect(items).toHaveLength(2);
    const kob = items[0];
    expect(kob.querySelector('[data-manque-service]')?.getAttribute('data-manque-service')).toBe('qobuz');
    expect(items[1].querySelector('[data-manque-service]'), 'Nefertiti : sur aucun service').toBeNull();

    (kob.querySelector('[data-ecouter]') as HTMLButtonElement).click();
    expect(mocks.playAndSync).toHaveBeenCalledWith(7, { streaming_album_id: 'q-kob', source: 'qobuz' });

    const coeur = kob.querySelector('[data-favori]') as HTMLButtonElement;
    expect(coeur.textContent?.trim()).toBe(tr('v2.manquants.ajouterFavori'));
    coeur.click();
    expect(mocks.toggleStreamingFavorite).toHaveBeenCalledWith(expect.objectContaining({
      itemType: 'album', service: 'qobuz', serviceId: 'q-kob', title: 'Kind of Blue (Legacy Edition)', coverUrl: 'https://c/kob.jpg',
    }));
  });

  it('un album déjà en favori le dit, et le geste le retire', async () => {
    favoriteStreamingKeys.set(new Set([favKeyOf({ itemType: 'album', service: 'qobuz', serviceId: 'q-kob' })!]));
    await comparer(SECTIONS);
    const coeur = cible.querySelector('[data-favori]') as HTMLButtonElement;
    expect(coeur.getAttribute('aria-pressed')).toBe('true');
    expect(coeur.textContent?.trim()).toBe(tr('v2.manquants.retirerFavori'));
  });

  it('sans service connecté : aucun geste de service, la liste reste celle d’avant', async () => {
    await comparer([]);
    expect(cible.querySelectorAll('li')).toHaveLength(2);
    expect(cible.querySelector('[data-ecouter]')).toBeNull();
    expect(mocks.playAndSync).not.toHaveBeenCalled();
  });
});

describe('la fiche d’artiste passe ses albums de service', () => {
  it('sans nouvel appel : les sections qu’elle a déjà chargées', () => {
    const src = readFileSync('src/components/v2/ArtisteServiceV2.svelte', 'utf8');
    expect(src).toContain('<AlbumsManquants artistId={artisteEditable.id} services={sectionsServices} />');
  });
});
