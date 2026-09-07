import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHAMPS_MODIFIABLES,
  GROUPE_AUTRES,
  GROUPES_CHAMPS_PISTE,
  champModifiable,
  grouperChampsPiste,
} from '../champsPiste';

/**
 * « Tous les champs piste » doit montrer TOUS les champs — #661.
 *
 * Le plantage d'origine (`vals.join` sur le tableau `file_tags`) est réparé
 * depuis la PR #662 et affiné par la #734 : le tiroir ne reste plus sur
 * « Chargement ». Ce qui restait, mesuré en relisant le contrat servi, c'est
 * qu'il n'affichait pas ce qu'il promet.
 *
 * `GET /library/tracks/{id}/all-tags` sert la ligne `Track` à plat. Les noms
 * sont ceux de `tune-core/src/db/models.rs:134`. La table de groupes du
 * tiroir visait six noms qui n'existent nulle part côté Rust — `custom_tags`,
 * `acoustid`, `waveform_data`, `waveform_generated_at`, `created_at`,
 * `updated_at` — et le filtre `FIELD_GROUPS[group].filter(k => k in
 * db_fields)` ne rend que ce qui est listé : cinq champs bien réels tombaient
 * donc hors de tout groupe, sans un mot.
 *
 * Reste en environnement `node` : on n'évalue que des fonctions pures et du
 * texte.
 */

/**
 * La charge utile réelle du serveur, champ pour champ.
 *
 * Reprise de `pub struct Track` (`tune-core/src/db/models.rs:134`) telle que
 * `serde_json::to_value(&track)` la sérialise dans `track_all_tags`
 * (`tune-server/src/routes/library/tracks.rs:410`), plus les trois alias que
 * `normalizeTrackAllTags` ajoute par-dessus.
 */
const CHAMPS_SERVIS: Record<string, unknown> = {
  id: 48702,
  title: 'Oye Como Va',
  album_id: 2746,
  album_title: 'Éxitos eternos',
  artist_id: 90,
  artist_name: 'Tito Puente',
  album_artist: 'Tito Puente',
  disc_number: 1,
  disc_subtitle: null,
  track_number: 3,
  duration_ms: 351007,
  file_path: '\\\\nas\\Musique\\01 - Oye Como Va.mp3',
  format: 'mp3',
  sample_rate: 44100,
  bit_depth: null,
  channels: 2,
  file_mtime: 1320769998,
  file_size: 8412160,
  audio_hash: 'ab12',
  source: 'local',
  source_id: null,
  isrc: 'USA123456789',
  genre: 'Salsa',
  genres: '["Salsa","Latin"]',
  composer: null,
  year: 1963,
  bpm: null,
  label: 'RCA',
  musicbrainz_recording_id: '9af57c4e-012c-4266-84a1-c87bc5eeacc9',
  cover_path: null,
  comments: null,
  // Les trois alias que le normaliseur recopie.
  comment: null,
  mtime: 1320769998,
  mb_recording_id: '9af57c4e-012c-4266-84a1-c87bc5eeacc9',
};

/** Les cinq champs que l'ancienne table laissait hors de tout groupe. */
const LES_CINQ_OUBLIES = ['album_artist', 'disc_subtitle', 'file_size', 'isrc', 'genres'];

function tousLesChampsRendus(groupes: { champs: string[] }[]): string[] {
  return groupes.flatMap((g) => g.champs);
}

describe('grouperChampsPiste', () => {
  it('ne perd AUCUN champ servi : le fourre-tout ramasse le reste', () => {
    const groupes = grouperChampsPiste(CHAMPS_SERVIS);
    const rendus = new Set(tousLesChampsRendus(groupes));
    // Les trois formes brutes que le normaliseur double sont légitimement
    // absentes : leur alias porte la même valeur.
    const doubles = ['comments', 'file_mtime', 'musicbrainz_recording_id'];
    for (const champ of Object.keys(CHAMPS_SERVIS)) {
      if (doubles.includes(champ)) continue;
      expect(rendus.has(champ), `champ perdu par le tiroir : ${champ}`).toBe(true);
    }
  });

  it('les cinq champs oubliés par l’ancienne table sont maintenant affichés', () => {
    const rendus = new Set(tousLesChampsRendus(grouperChampsPiste(CHAMPS_SERVIS)));
    for (const champ of LES_CINQ_OUBLIES) {
      expect(rendus.has(champ), `toujours invisible : ${champ}`).toBe(true);
    }
  });

  it('n’affiche jamais deux fois le même champ', () => {
    const rendus = tousLesChampsRendus(grouperChampsPiste(CHAMPS_SERVIS));
    expect(rendus.length).toBe(new Set(rendus).size);
  });

  /**
   * La contre-épreuve du fourre-tout. Sans elle, un `GROUPE_AUTRES` qui
   * ramasserait TOUT rendrait les tests ci-dessus verts en ayant supprimé les
   * groupes nommés — l'écran deviendrait une liste à plat de trente lignes.
   */
  it('les groupes nommés gardent leurs champs : « Autres » ne ramasse que le reste', () => {
    const groupes = grouperChampsPiste(CHAMPS_SERVIS);
    const identification = groupes.find((g) => g.nom === 'Identification');
    expect(identification?.champs).toContain('title');
    expect(identification?.champs).toContain('album_artist');
    const autres = groupes.find((g) => g.nom === GROUPE_AUTRES);
    expect(autres?.champs ?? [], 'un champ nommé a fui dans le fourre-tout').not.toContain(
      'title',
    );
  });

  /**
   * Un champ que Rust ajoutera demain à `Track` ne doit pas disparaître en
   * silence — c'est exactement ce qui est arrivé aux cinq ci-dessus.
   */
  it('un champ inconnu tombe dans « Autres » au lieu de disparaître', () => {
    const groupes = grouperChampsPiste({ title: 'x', un_champ_de_demain: 42 });
    const autres = groupes.find((g) => g.nom === GROUPE_AUTRES);
    expect(autres?.champs).toEqual(['un_champ_de_demain']);
  });

  it('ne masque une forme brute que si son alias porte la MÊME valeur', () => {
    const groupes = grouperChampsPiste({
      comments: 'ancienne note',
      comment: 'note différente',
    });
    const rendus = tousLesChampsRendus(groupes);
    expect(rendus, 'deux valeurs distinctes, deux lignes').toContain('comments');
    expect(rendus).toContain('comment');
  });

  it('ne rend aucun groupe vide, et rien du tout sans champs', () => {
    expect(grouperChampsPiste({})).toEqual([]);
    expect(grouperChampsPiste(null)).toEqual([]);
    for (const g of grouperChampsPiste({ title: 'x' })) {
      expect(g.champs.length).toBeGreaterThan(0);
    }
  });

  it('chaque groupe porte une clé i18n, jamais un libellé en dur', () => {
    const fr = readFileSync(resolve(process.cwd(), 'src/lib/locales/fr.ts'), 'utf-8');
    for (const g of [
      ...GROUPES_CHAMPS_PISTE,
      { cleI18n: 'trackTags.groupOther' },
    ]) {
      expect(fr, `clé absente de fr.ts : ${g.cleI18n}`).toContain(`"${g.cleI18n}"`);
    }
  });
});

/**
 * Le second défaut mesuré : quatre champs de saisie qui n'écrivaient rien.
 *
 * `TrackEdit` (`tune-server/src/routes/metadata.rs:53`) ne désérialise que
 * `title`, `artist`, `album`, `album_id`, `album_artist`, `genre`,
 * `track_number`, `disc_number`, `year`, `composer`, `label`. Il n'a pas
 * `deny_unknown_fields` : `artist_id`, `bpm`, `comment` et `custom_tags`
 * partaient dans le corps, le serveur répondait `200 {"status":"ok"}` sans
 * rien écrire, le tiroir annonçait « 1 champ mis à jour », et son propre
 * rechargement remettait l'ancienne valeur sous les yeux de l'utilisateur.
 */
describe('champModifiable', () => {
  it('n’offre à la saisie que ce que `TrackEdit` accepte', () => {
    for (const champ of [
      'title',
      'album_id',
      'album_artist',
      'genre',
      'track_number',
      'disc_number',
      'year',
      'composer',
      'label',
    ]) {
      expect(champModifiable(champ), `devrait être modifiable : ${champ}`).toBe(true);
    }
  });

  it('ferme les quatre saisies que le serveur ignorait en silence', () => {
    for (const champ of ['artist_id', 'bpm', 'comment', 'custom_tags']) {
      expect(champModifiable(champ), `saisie sans effet rouverte : ${champ}`).toBe(false);
    }
  });

  /** Contre-épreuve : un ensemble vide rendrait le test précédent vert pour rien. */
  it('n’est pas vide, et ne dit pas oui à tout', () => {
    expect(CHAMPS_MODIFIABLES.size).toBeGreaterThan(0);
    expect(champModifiable('audio_hash')).toBe(false);
    expect(champModifiable('file_path')).toBe(false);
  });
});

/** Le tiroir doit VRAIMENT utiliser ce module — sinon la garde ne garde rien. */
describe('TrackTagsDrawer', () => {
  const SOURCE = readFileSync(
    resolve(process.cwd(), 'src/components/TrackTagsDrawer.svelte'),
    'utf-8',
  );

  it('passe par `grouperChampsPiste` et n’a plus sa table locale', () => {
    expect(SOURCE).toContain('grouperChampsPiste');
    expect(SOURCE, 'la table locale est revenue').not.toContain('const FIELD_GROUPS');
  });

  it('tire ses champs modifiables de la liste partagée', () => {
    expect(SOURCE).toContain('CHAMPS_MODIFIABLES');
  });
});
