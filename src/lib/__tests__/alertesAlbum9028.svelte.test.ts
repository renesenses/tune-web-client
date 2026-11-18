// @vitest-environment jsdom
// renesenses/tune-server-rust#9028 (go de Bertrand du 18/11, rc13 ; forum fil
// 2685) — « Normal pour les N pistes de cet album » : les alertes sont
// regroupées par album, et le geste groupé passe par une confirmation DANS
// la page qui liste les pistes concernées (aperçu du serveur), jamais par
// `confirm()`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MetadataV2 from '../../components/v2/MetadataV2.svelte';
import * as api from '../api';
import { locale } from '../i18n';
import type { PisteDouteuse } from '../artisteDepuisChemin';
import { fr } from './onzeDictionnaires';

vi.mock('../api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api')>(),
  listMetadataProposals: vi.fn(),
  getDoubtfulTracks: vi.fn(),
  getAlertesDouteusesIgnorees: vi.fn(),
  ignorerAlerteDouteuse: vi.fn(),
  retablirAlerteDouteuse: vi.fn(),
  apercuAlerteAlbum: vi.fn(),
  ignorerAlerteAlbum: vi.fn(),
  retablirAlerteAlbum: vi.fn(),
}));

const dict = fr as Record<string, string>;
const T = 'track' as const;

/** Faux serveur : l'album 20 « Everyday Life » (feuille CUE) a trois pistes
 *  cachées de 3 s ; la piste 9 (album 10) est seule de son album. */
let ignoreesAlbum: Set<number>;
let avecPortees: boolean;
function pistes(): PisteDouteuse[] {
  const base: PisteDouteuse[] = [
    ...[2, 3, 4].map((id) => ({
      id, album_id: 20, title: `Caché ${id}`, album_title: 'Everyday Life', artist_name: 'Coldplay',
      duration_ms: 3000, file_path: '/m/Coldplay/Everyday Life/Everyday Life.flac', reasons: ['very_short'],
      ignore_scopes: { very_short: T },
    })),
    { id: 9, album_id: 10, title: 'Bip', album_title: 'Seul', artist_name: 'X', duration_ms: 2000,
      file_path: '/m/Seul/bip.flac', reasons: ['very_short'], ignore_scopes: { very_short: T } },
  ];
  return base
    .filter((p) => !(p.album_id === 20 && ignoreesAlbum.has(20)))
    .map((p) => (avecPortees ? p : { ...p, ignore_scopes: undefined }));
}

let hote: HTMLDivElement;
let composant: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  locale.set('fr');
  vi.clearAllMocks();
  ignoreesAlbum = new Set();
  avecPortees = true;
  vi.mocked(api.listMetadataProposals).mockResolvedValue({ proposals: [], pending: 0, auto_apply: false });
  vi.mocked(api.getDoubtfulTracks).mockImplementation(async () => {
    const p = pistes(); return { items: p, total: p.length, can_ignore: true };
  });
  vi.mocked(api.getAlertesDouteusesIgnorees).mockResolvedValue([]);
  vi.mocked(api.apercuAlerteAlbum).mockImplementation(async (albumId, reason) => ({
    album_id: albumId, album_title: 'Everyday Life', reason, scope: 'album',
    folder: '/m/Coldplay/Everyday Life',
    tracks: [2, 3, 4].map((id) => ({ id, title: `Caché ${id}`, duration_ms: 3000 })),
    total: 3, ignored_count: 0,
  }));
  vi.mocked(api.ignorerAlerteAlbum).mockImplementation(async (albumId, reason, ids) => {
    ignoreesAlbum.add(albumId);
    return { scope: 'album', key: '/m/Coldplay/Everyday Life', title: 'Everyday Life', reason, track_ids: ids, track_count: ids.length, added: 1 };
  });
  vi.mocked(api.retablirAlerteAlbum).mockImplementation(async (albumId) => {
    ignoreesAlbum.delete(albumId);
    return { removed: 1 };
  });
  hote = document.createElement('div');
  document.body.appendChild(hote);
});

afterEach(async () => {
  if (composant) await unmount(composant);
  composant = undefined;
  hote.remove();
  vi.restoreAllMocks();
});

async function ouvrir() {
  composant = mount(MetadataV2, { target: hote });
  flushSync();
  [...hote.querySelectorAll<HTMLButtonElement>('.tabs button')]
    .find((b) => b.textContent?.includes(fr['v2.meta.tabDoubtful']))!.click();
  await vi.waitFor(() => {
    flushSync();
    expect(hote.querySelectorAll('.pistes-douteuses li[data-piste-id]').length).toBe(4);
  });
}

const album = () => hote.querySelector('li.album[data-album-id="20"]');
const boutonAlbum = () => album()?.querySelector<HTMLButtonElement>('button.normal-album') ?? null;
const confirmer = () => hote.querySelector('[data-confirmer-album]');

describe('Pistes douteuses : « Normal pour tout l’album » (#9028)', () => {
  it('les pistes du même album sont regroupées sous son titre, avec le geste groupé', async () => {
    await ouvrir();
    const bloc = album()!;
    expect(bloc).not.toBeNull();
    expect(bloc.textContent).toContain(dict['v2.meta.dAlbumGroup'].replace('{album}', 'Everyday Life'));
    expect(bloc.textContent).toContain(dict['v2.meta.dAlbumGroupCount'].replace('{count}', '3'));
    expect([...bloc.querySelectorAll('[data-piste-id]')].map((l) => l.getAttribute('data-piste-id'))).toEqual(['2', '3', '4']);
    expect(boutonAlbum()!.textContent).toContain(dict['v2.meta.dIgnoreAlbumN'].replace('{count}', '3'));
    // La piste seule de son album n'est pas regroupée et n'a pas de geste groupé.
    expect(hote.querySelector('li.album[data-album-id="10"]')).toBeNull();
    expect(hote.querySelector('[data-piste-id="9"]')?.closest('li.album')).toBeNull();
    // Le geste piste par piste reste.
    expect(bloc.querySelectorAll('button.normal').length).toBe(3);
  });

  it('le geste ouvre une confirmation DANS la page qui liste les pistes ; rien n’est écrit avant', async () => {
    const natif = vi.spyOn(window, 'confirm');
    await ouvrir();
    boutonAlbum()!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(confirmer()?.querySelectorAll('[data-apercu-piste]').length).toBe(3);
    });
    expect(api.apercuAlerteAlbum).toHaveBeenCalledWith(20, 'very_short');
    expect(api.ignorerAlerteAlbum).not.toHaveBeenCalled();
    expect(natif).not.toHaveBeenCalled();
    const c = confirmer()!;
    expect(c.textContent).toContain(dict['v2.meta.dIgnoreAlbumPreview']
      .replace('{count}', '3').replace('{album}', 'Everyday Life').replace('{reason}', dict['v2.meta.dReasonShort']));
    expect(c.textContent).toContain('Caché 2');
    expect(c.textContent).toContain('(0:03)');
    expect(c.textContent).toContain('/m/Coldplay/Everyday Life');
    // « Annuler » ferme sans rien écrire.
    [...c.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(dict['v2.tool.cancel']))!.click();
    flushSync();
    expect(confirmer()).toBeNull();
    expect(api.ignorerAlerteAlbum).not.toHaveBeenCalled();
  });

  it('confirmer : les pistes montrées partent au serveur, la liste perd l’album, « Annuler » le rend', async () => {
    await ouvrir();
    boutonAlbum()!.click();
    await vi.waitFor(() => { flushSync(); expect(confirmer()?.querySelector('button.go')).not.toBeNull(); });
    const go = confirmer()!.querySelector<HTMLButtonElement>('button.go')!;
    expect(go.textContent).toContain(dict['v2.meta.dIgnoreAlbumConfirm'].replace('{count}', '3'));
    go.click();
    await vi.waitFor(() => {
      flushSync();
      expect(api.ignorerAlerteAlbum).toHaveBeenCalledWith(20, 'very_short', [2, 3, 4]);
      expect(album()).toBeNull();
      expect(hote.querySelectorAll('.pistes-douteuses li[data-piste-id]').length).toBe(1);
    });
    expect(api.getDoubtfulTracks, 'pas de relecture').toHaveBeenCalledTimes(1);
    const bilan = hote.querySelector('[data-bilan-ignore]')!;
    expect(bilan.textContent).toContain(dict['v2.meta.dIgnoredAlbumDone']
      .replace('{reason}', dict['v2.meta.dReasonShort']).replace('{count}', '3').replace('{name}', 'Everyday Life'));
    [...bilan.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(dict['v2.meta.dUndo']))!.click();
    await vi.waitFor(() => {
      flushSync();
      expect(api.retablirAlerteAlbum).toHaveBeenCalledWith(20, 'very_short');
      expect(album()).not.toBeNull();
    });
    expect(api.retablirAlerteDouteuse).not.toHaveBeenCalled();
  });

  it('contre-épreuve : un serveur sans `ignore_scopes` — albums regroupés, mais aucun geste', async () => {
    avecPortees = false;
    await ouvrir();
    expect(album()).not.toBeNull();
    expect(boutonAlbum()).toBeNull();
  });
});

describe('API du geste groupé (#9028)', () => {
  it('les chemins et corps attendus par le serveur', async () => {
    const vrai = await vi.importActual<typeof import('../api')>('../api');
    const f = vi.fn(async () => new Response(JSON.stringify({ tracks: [], removed: 0 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', f);
    await vrai.apercuAlerteAlbum(20, 'very_short');
    await vrai.ignorerAlerteAlbum(20, 'very_short', [2, 3]);
    await vrai.retablirAlerteAlbum(20, 'very_short');
    const appels = f.mock.calls.map((c: any[]) => [String(c[0]), c[1]?.method ?? 'GET', c[1]?.body ?? null]);
    expect(appels[0][0]).toMatch(/\/metadata\/doubtful\/album\?album_id=20&reason=very_short$/);
    expect(appels[1][0]).toMatch(/\/metadata\/doubtful\/ignored\/album$/);
    expect(appels[1][1]).toBe('POST');
    expect(JSON.parse(appels[1][2])).toEqual({ album_id: 20, reason: 'very_short', track_ids: [2, 3] });
    expect(appels[2][0]).toMatch(/\/metadata\/doubtful\/ignored\/album$/);
    expect(appels[2][1]).toBe('DELETE');
    expect(JSON.parse(appels[2][2])).toEqual({ album_id: 20, reason: 'very_short' });
    vi.unstubAllGlobals();
  });
});
