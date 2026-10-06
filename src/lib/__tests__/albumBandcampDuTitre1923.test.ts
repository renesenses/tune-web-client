/**
 * Un titre Bandcamp lancé SEUL emporte la page de son album — #1923, #1924.
 *
 * Suite de tune-server-rust#5922 : le serveur retrouve l'album d'un titre
 * qu'il a déjà vu, mais pas celui d'un titre jamais vu. C'est le client qui
 * la connaît (fiche de l'album, ligne de file, historique) : il l'envoie dans
 * `album_ref`, sur `play` comme sur `queue/add`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { albumBandcampDe, champAlbumBandcamp, pageAlbumBandcampSure } from '../albumBandcampDuTitre';
import { corpsDeFile, corpsDeFileListe, corpsDeLecture } from '../pisteFile';
import type { Track } from '../types';

const PAGE = 'https://framewerk.bandcamp.com/album/love-parade';
const FLUX = 'https://t4.bcbits.com/stream/abc/mp3-128/111?ts=1';
const p = (o: Partial<Track>) => o as Track;
const bandcamp = (o: Partial<Track> = {}) =>
  p({ id: null, title: 'Meet Her', source: 'bandcamp', source_id: FLUX, album_id_service: PAGE, ...o });

describe('pageAlbumBandcampSure — la même règle que le serveur', () => {
  it('une page d album ou de piste Bandcamp passe', () => {
    for (const page of [PAGE, 'https://x.bandcamp.com/track/y', 'https://X.Bandcamp.com/album/z?from=s']) {
      expect(pageAlbumBandcampSure(page)).toBe(page);
    }
    expect(pageAlbumBandcampSure(`  ${PAGE}\n`)).toBe(PAGE);
  });

  it('un autre schéma, un sosie, un port ou des identifiants restent dehors', () => {
    for (const page of [
      'http://framewerk.bandcamp.com/album/x',
      'javascript:void(0)//bandcamp.com/album/x',
      'https://evilbandcamp.com/album/x',
      'https://bandcamp.com.exemple.net/album/x',
      'https://exemple.net/framewerk.bandcamp.com/album/x',
      'https://moi@framewerk.bandcamp.com/album/x',
      'https://framewerk.bandcamp.com:8443/album/x',
      'https://a..bandcamp.com/album/x',
      'https://framewerk.bandcamp.com',
      'https://framewerk.bandcamp.com/',
      'https://framewerk.bandcamp.com/album/a b',
      FLUX,
      '',
      null,
      42,
    ]) {
      expect(pageAlbumBandcampSure(page as any)).toBeNull();
    }
  });
});

describe('albumBandcampDe — seulement pour une piste Bandcamp', () => {
  it('lit album_id_service, puis album_id quand c est une adresse', () => {
    expect(albumBandcampDe(bandcamp())).toBe(PAGE);
    expect(albumBandcampDe(bandcamp({ album_id_service: null, album_id: PAGE as any }))).toBe(PAGE);
  });

  it('rien pour une autre source, ni pour une piste Bandcamp sans album', () => {
    expect(albumBandcampDe(bandcamp({ source: 'qobuz' }))).toBeNull();
    expect(albumBandcampDe(bandcamp({ album_id_service: null }))).toBeNull();
    expect(albumBandcampDe(bandcamp({ album_id_service: 'https://evilbandcamp.com/album/x' }))).toBeNull();
    expect(champAlbumBandcamp(bandcamp({ source: 'tidal' }))).toEqual({});
  });
});

describe('les corps de lecture et de file portent album_ref', () => {
  it('lire un titre Bandcamp seul', () => {
    expect(corpsDeLecture(bandcamp())).toMatchObject({ source: 'bandcamp', source_id: FLUX, album_ref: PAGE });
  });

  it('l ajouter à la file, seul ou dans une liste', () => {
    expect(corpsDeFile(bandcamp(), 2)!.tracks![0]).toMatchObject({ source_id: FLUX, album_ref: PAGE });
    const autre = 'https://framewerk.bandcamp.com/album/autre';
    const c = corpsDeFileListe([bandcamp(), bandcamp({ album_id_service: autre }), bandcamp({ album_id_service: null })])!;
    expect(c.tracks!.map((r) => r.album_ref)).toEqual([PAGE, autre, undefined]);
  });

  it('serveur ancien : le corps d une autre piste reste exactement celui d avant', () => {
    const q = p({ id: null, title: 'T', source: 'qobuz', source_id: 'q-1', album_id_service: 'q-alb' });
    expect(corpsDeLecture(q)).not.toHaveProperty('album_ref');
    expect(corpsDeFile(q)!.tracks![0]).not.toHaveProperty('album_ref');
    // Sans album connu, aucune clé n'est ajoutée : un serveur qui ne sait rien
    // du champ reçoit le même JSON qu'avant ce correctif.
    expect(JSON.stringify(corpsDeLecture(bandcamp({ album_id_service: null })))).not.toContain('album_ref');
  });
});

describe('branchements', () => {
  const lire = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf-8');

  it('la fiche d un album Bandcamp pose sa page sur chaque piste', () => {
    expect(lire('src/components/v2/AlbumDetailV2.svelte')).toMatch(/album_id_service: d2\?\.url \?\? bc/);
  });

  it('les lectures de liste, de recherche et d historique joignent le champ', () => {
    expect(lire('src/lib/playback.ts').match(/champAlbumBandcamp\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(lire('src/components/v2/SearchV2.svelte')).toContain('...champAlbumBandcamp(t)');
    expect(lire('src/lib/historiqueLecture.ts')).toContain('...champAlbumBandcamp(track)');
  });
});
