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

// ---------------------------------------------------------------------------
// LA GARDE : l'écran APPELLE bien ce qui précède.
//
// Une fonction correcte que personne n'appelle ne corrige rien : c'est le
// « écrit mais pas branché » que ce ticket documentait déjà côté serveur.
// ---------------------------------------------------------------------------
const ECRAN = readFileSync(
  resolve(__dirname, '../../components/BandcampView.svelte'),
  'utf8',
);
/** Le source sans ses commentaires : un commentaire ne branche rien. */
const CODE = ECRAN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Le corps d'une fonction Svelte, accolades comptées. */
function corpsDe(nom: string): string {
  const debut = CODE.indexOf(`function ${nom}(`);
  if (debut === -1) return '';
  const ouvrante = CODE.indexOf('{', CODE.indexOf(')', debut));
  let profondeur = 0;
  for (let i = ouvrante; i < CODE.length; i++) {
    if (CODE[i] === '{') profondeur++;
    else if (CODE[i] === '}' && --profondeur === 0) return CODE.slice(ouvrante, i + 1);
  }
  return '';
}

describe('#2702 — l’écran Bandcamp envoie bien le corps d’album', () => {
  it('🔴 `ecouter` passe par `corpsDeLectureBandcamp`', () => {
    // Aiguille assemblée : écrite en clair elle vivrait dans CE fichier, pas
    // dans celui qu'on inspecte — mais l'habitude protège du témoin qui se
    // trouve lui-même.
    const appel = ['corpsDeLecture', 'Bandcamp('].join('');
    expect(corpsDe('ecouter')).toContain(appel);
  });

  it('🔴 `ecouter` n’envoie PLUS la piste distante seule à `playAndSync`', () => {
    const corps = corpsDe('ecouter');
    expect(corps).not.toContain(['playAndSync(zone.id, piste_', 'distante('].join(''));
  });

  it('`jouer_collection` existe et passe par `corpsDeLectureCollection`', () => {
    expect(corpsDe('jouer_collection')).toContain(
      ['corpsDeLecture', 'Collection('].join(''),
    );
  });

  it('la mise en FILE d’une piste seule reste ce qu’elle était', () => {
    // `mettre_en_file` est un autre geste : ranger UNE piste derrière ce qui
    // joue. Il ne doit pas être emporté par ce correctif.
    expect(corpsDe('mettre_en_file')).toContain(['piste_', 'distante('].join(''));
  });
});
