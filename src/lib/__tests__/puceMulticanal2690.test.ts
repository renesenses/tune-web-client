// renesenses/tune-web-client#2690 — la puce Qualité « Multicanal » (#7725)
// n'apparaissait pas alors que le serveur sert `max_channels`. Ces témoins
// suivent le chemin de LibraryV2 : réponse brute du serveur -> api ->
// magasin `albums` -> regrouperAlbums -> puce -> filtre.
import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:8888' } });
vi.mock('../auth', () => ({ getToken: () => null, clearToken: () => {} }));
vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const api = await import('../api');
const { albums } = await import('../stores/library');
const { regrouperAlbums } = await import('../oeuvres');
const { estMulticanal, porteSesCanaux } = await import('../utils');

const reponseServeur = {
  items: [
    { id: 1, title: 'Stéréo', artist_name: 'A', format: 'flac', sample_rate: 44100, bit_depth: 16, max_channels: 2 },
    { id: 2, title: 'Surround', artist_name: 'B', format: 'flac', sample_rate: 96000, bit_depth: 24, max_channels: 6 },
    { id: 3, title: 'Stéréo bis', artist_name: 'C', format: 'flac', sample_rate: 44100, bit_depth: 16, max_channels: 2 },
  ],
  limit: 2000, offset: 0, total: 3,
};

function serveur(corps: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true, status: 200, headers: new Headers(),
    text: async () => JSON.stringify(corps),
    json: async () => corps,
  }));
}

describe('#2690 — de la réponse du serveur à la puce Multicanal', () => {
  it('la puce apparaît et le filtre garde le 6 canaux, écarte la stéréo', async () => {
    serveur(reponseServeur);
    albums.set(await api.getAllAlbums(2000, null, null));
    const src = regrouperAlbums(get(albums), []).albums;
    expect(src.some(porteSesCanaux)).toBe(true);
    expect(src.filter(estMulticanal).map((a) => a.id)).toEqual([2]);
  });

  it('avec le regroupement actif, la puce et le filtre tiennent encore', async () => {
    serveur(reponseServeur);
    albums.set(await api.getAllAlbums(2000, null, null));
    const src = regrouperAlbums(get(albums), [{ work_id: 'w', preferred_id: 1, ids: [1, 2] }]).albums;
    expect(src.some(porteSesCanaux)).toBe(true);
    expect(src.filter(estMulticanal).map((a) => a.id)).toEqual([1]);
  });
});

describe('#2690 — une carte regroupée porte le canal maximum de ses versions', () => {
  it('stéréo (préférée) + 5.1 : la carte passe le filtre Multicanal', () => {
    const liste = [
      { id: 10, title: 'X', max_channels: 2 },
      { id: 11, title: 'X 5.1', max_channels: 6 },
      { id: 12, title: 'Y', max_channels: 2 },
    ];
    const r = regrouperAlbums(liste, [{ work_id: 'x', preferred_id: 10, ids: [10, 11] }]);
    expect(r.albums.map((a) => a.id)).toEqual([10, 12]);
    expect(r.albums.filter(estMulticanal).map((a) => a.id)).toEqual([10]);
  });

  it('la 5.1 préférée, la stéréo gardée seule : même résultat', () => {
    const liste = [
      { id: 10, title: 'X', max_channels: 2 },
      { id: 11, title: 'X 5.1', max_channels: 6 },
    ];
    const r = regrouperAlbums(liste, [{ work_id: 'x', preferred_id: 11, ids: [10, 11] }]);
    expect(r.albums.filter(estMulticanal).map((a) => a.id)).toEqual([11]);
  });

  it('deux versions stéréo : la carte reste écartée', () => {
    const liste = [{ id: 10, max_channels: 2 }, { id: 11, max_channels: 2 }];
    const r = regrouperAlbums(liste, [{ work_id: 'x', preferred_id: 10, ids: [10, 11] }]);
    expect(r.albums.filter(estMulticanal)).toEqual([]);
  });

  it('les versions absentes de la liste ne comptent pas', () => {
    const liste = [{ id: 10, max_channels: 2 }];
    const r = regrouperAlbums(liste, [{ work_id: 'x', preferred_id: 10, ids: [10, 11] }]);
    expect(r.albums.filter(estMulticanal)).toEqual([]);
  });
});
