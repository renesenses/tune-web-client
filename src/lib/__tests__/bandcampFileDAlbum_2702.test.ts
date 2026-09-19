/**
 * #2702 — « Les morceaux ne s'enchaînent pas sur Bandcamp ».
 *
 * Sevy Tabroc, fil forum 1596, Tune 0.9.119 macOS : « 1 Je choisis un album /
 * 2 Je lance le premier titre / 3 A la fin du morceau, le prochain ne
 * s'enchaine pas ».
 *
 * La cause n'est PAS la détection de fin de piste : c'est la constitution de
 * la file. L'écran envoyait une piste distante seule — la paire
 * `{source, source_id}` — et ce chemin termine par
 * `update_queue_info(zone, 0, 1)` : une file d'EXACTEMENT une piste. Il n'y
 * avait jamais de suivante.
 *
 * Le serveur sait pourtant faire la file depuis la v0.9.132 : Bandcamp est
 * inscrit au registre des services (`tune-server/src/state.rs:369`), ce qui
 * débloque `POST /zones/{id}/play` avec `streaming_album_id`
 * (`routes/playback.rs:1422`), dont `start_index` choisit la piste de départ.
 * Personne ne l'appelait — « écrit mais pas branché ».
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  corpsDeLectureBandcamp,
  corpsDeLectureCollection,
  type AlbumBandcamp,
} from '../bandcampLecture';

const ALBUM: AlbumBandcamp = {
  url: 'https://artiste.bandcamp.com/album/disque',
  title: 'Disque',
  artist: 'Artiste',
  pochette: 'https://f4.bcbits.com/img/a4029072179_16.jpg',
  tracks: [
    { stream_url: 'https://t4.bcbits.com/stream/aaa?token=1', title: 'Une', duration_s: 121.5 },
    { stream_url: 'https://t4.bcbits.com/stream/bbb?token=2', title: 'Deux', duration_s: 200 },
    { stream_url: 'https://t4.bcbits.com/stream/ccc?token=3', title: 'Trois', duration_s: 60 },
  ],
};

describe('#2702 — ce que Tune envoie pour lire du Bandcamp', () => {
  it('🔴 lancer le PREMIER titre envoie l’ALBUM, pas la piste seule', () => {
    const corps = corpsDeLectureBandcamp(ALBUM, 0);
    expect(corps).toEqual({
      source: 'bandcamp',
      streaming_album_id: 'https://artiste.bandcamp.com/album/disque',
      start_index: 0,
    });
    // La piste seule est exactement ce qui faisait la file d'une piste.
    expect(corps).not.toHaveProperty('source_id');
  });

  it('cliquer la troisième piste ouvre l’album À cette piste', () => {
    expect(corpsDeLectureBandcamp(ALBUM, 2)).toMatchObject({ start_index: 2 });
  });

  it('l’identifiant d’album est l’ADRESSE de la page — c’est ce que le serveur rouvre', () => {
    // `BandcampService::get_album_tracks` fait `album_depuis_url(album_id)` :
    // un identifiant numérique n'y serait pas résolu.
    const corps = corpsDeLectureBandcamp(ALBUM, 0) as { streaming_album_id: string };
    expect(corps.streaming_album_id).toBe(ALBUM.url);
  });

  it('un indice hors bornes ou absurde retombe sur le début, jamais sur rien', () => {
    for (const i of [-1, Number.NaN, 0.4]) {
      expect(corpsDeLectureBandcamp(ALBUM, i)).toMatchObject({ start_index: 0 });
    }
  });

  it('sans adresse d’album, la piste seule reste — mieux qu’un silence', () => {
    const sansAdresse: AlbumBandcamp = { ...ALBUM, url: null };
    expect(corpsDeLectureBandcamp(sansAdresse, 1)).toEqual({
      source: 'bandcamp',
      source_id: 'https://t4.bcbits.com/stream/bbb?token=2',
      title: 'Deux',
      artist_name: 'Artiste',
      album_title: 'Disque',
      cover_path: ALBUM.pochette,
      duration_ms: 200000,
    });
  });

  it('ni adresse ni piste : `null`, et surtout pas un corps vide', () => {
    // Un corps vide fait retomber le serveur sur « reprendre la lecture en
    // cours » — le geste de l'auditeur se transformerait en autre chose.
    expect(corpsDeLectureBandcamp({ url: null, tracks: [] }, 0)).toBeNull();
    expect(corpsDeLectureBandcamp(null, 0)).toBeNull();
    expect(corpsDeLectureBandcamp({ url: '   ' }, 0)).toBeNull();
  });
});

describe('#2778 — « Ma collection » se joue, et par l’album entier', () => {
  it('un article de collection donne le même corps d’album', () => {
    expect(
      corpsDeLectureCollection({
        url: 'https://andrewhuang.bandcamp.com/album/cxm-1978',
        type: 'album',
      }),
    ).toEqual({
      source: 'bandcamp',
      streaming_album_id: 'https://andrewhuang.bandcamp.com/album/cxm-1978',
      start_index: 0,
    });
  });

  it('un article sans adresse ne fabrique rien', () => {
    expect(corpsDeLectureCollection({ url: '', type: 'album' })).toBeNull();
    expect(corpsDeLectureCollection(null)).toBeNull();
  });
});



