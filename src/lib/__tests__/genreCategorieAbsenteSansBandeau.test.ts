// @vitest-environment jsdom
//
// TIDAL répond « Category not found » quand un genre n'a pas d'albums dans le
// catalogue du pays du compte. Le serveur antérieur au correctif le rendait en
// erreur (502) : la vue du genre, qui garde ses playlists, se couvrait d'un
// bandeau rouge global. L'échec des albums d'un genre appartient à l'écran
// appelant : jamais de bandeau.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import { notifications } from '../stores/notifications';

beforeEach(() => {
  for (const n of get(notifications)) notifications.dismiss(n.id);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('albums d’un genre absent du catalogue du pays', () => {
  it('un refus « Category not found » ne lève pas de bandeau', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'tidal 404 (2001): Category not found' }),
      { status: 502, statusText: 'Bad Gateway', headers: { 'Content-Type': 'application/json' } },
    )));
    await expect(api.getStreamingGenreAlbums('tidal', 'Polish', 40)).rejects.toBeTruthy();
    expect(get(notifications).map((n) => n.message)).toEqual([]);
  });

  it('« aucun album » ne s’affiche que si l’écran entier est vide', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/StreamingV2.svelte'), 'utf8');
    const i = src.indexOf("$t('streaming.genreNoAlbums')");
    const garde = src.lastIndexOf('{:else if', i);
    expect(src.slice(garde, i)).toContain('!genrePlaylists.length');
  });
});
