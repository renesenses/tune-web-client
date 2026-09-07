/**
 * Les champs du tiroir « Tous les champs piste » — #661.
 *
 * # Ce que ce fichier répare
 *
 * Le tiroir promet « TOUS les champs piste ». Il n'en montrait qu'une partie,
 * et rien ne disait lesquels manquaient.
 *
 * `GET /library/tracks/{id}/all-tags` sert la ligne `Track` À PLAT
 * (`tune-server/src/routes/library/tracks.rs`, `track_all_tags` :
 * `serde_json::to_value(&track)`). Les noms sont donc ceux de la structure
 * Rust — `tune-core/src/db/models.rs:134` :
 *
 * ```rust
 * pub struct Track {
 *     pub id, title, album_id, album_title, artist_id, artist_name,
 *     album_artist, disc_number, disc_subtitle, track_number, duration_ms,
 *     file_path, format, sample_rate, bit_depth, channels, file_mtime,
 *     file_size, audio_hash, source, source_id, isrc, genre, genres,
 *     composer, year, bpm, label, musicbrainz_recording_id, cover_path,
 *     comments,
 * }
 * ```
 *
 * La table de groupes du tiroir, elle, était écrite contre des noms qui
 * n'existent nulle part côté serveur : `custom_tags`, `acoustid`,
 * `waveform_data`, `waveform_generated_at`, `created_at`, `updated_at`.
 * Et le filtre `FIELD_GROUPS[group].filter(k => k in db_fields)` ne rend QUE
 * ce qui est listé : cinq champs bien réels — `album_artist`,
 * `disc_subtitle`, `file_size`, `isrc`, `genres` — n'apparaissaient donc
 * dans aucun groupe, sans le moindre signe.
 *
 * # Pourquoi un groupe fourre-tout, et pas une liste plus longue
 *
 * Allonger la liste à la main, c'est reprendre le même pari : le prochain
 * champ ajouté à `Track` disparaîtra en silence, exactement comme les cinq
 * ci-dessus. `GROUPE_AUTRES` est la sortie du témoin — tout ce que les
 * groupes nommés n'ont pas réclamé y tombe, et se voit. Un écran qui
 * s'appelle « tous les champs » ne peut pas en cacher.
 *
 * # Les alias du normaliseur
 *
 * `normalizeTrackAllTags` (`lib/api/metadata.ts`) recopie trois champs sous
 * le nom historique du client : `comments`→`comment`, `file_mtime`→`mtime`,
 * `musicbrainz_recording_id`→`mb_recording_id`. Les DEUX clés existent alors
 * dans `db_fields`. Sans traitement, le fourre-tout afficherait chaque valeur
 * deux fois. On masque donc la forme brute **quand elle porte exactement la
 * même valeur** que son alias — jamais autrement : deux valeurs différentes
 * sous deux noms, c'est une information, pas un doublon.
 */

/** Le groupe qui recueille tout ce qu'aucun autre n'a réclamé. */
export const GROUPE_AUTRES = 'Autres';

/** Un groupe de champs : son identifiant stable et sa clé de traduction. */
export interface GroupeChamps {
  /** Identifiant stable, jamais affiché tel quel. */
  nom: string;
  /** Clé i18n du libellé montré à l'écran. */
  cleI18n: string;
  /** Les champs qu'il réclame, dans l'ordre d'affichage. */
  champs: readonly string[];
}

/**
 * Les groupes nommés, dans l'ordre où le tiroir les empile.
 *
 * Chaque nom est celui que le serveur sert (ou l'alias que le normaliseur
 * ajoute). Un nom listé ici et absent du JSON ne produit simplement pas de
 * ligne — c'est le cas de `mtime` et `mb_recording_id` sur une piste qui n'en
 * a pas.
 */
export const GROUPES_CHAMPS_PISTE: readonly GroupeChamps[] = [
  {
    nom: 'Identification',
    cleI18n: 'trackTags.groupIdentification',
    champs: [
      'title',
      'artist_name',
      'album_title',
      'album_artist',
      'track_number',
      'disc_number',
      'disc_subtitle',
    ],
  },
  {
    nom: 'Classique / crédits',
    cleI18n: 'trackTags.groupClassical',
    champs: ['composer', 'genre', 'genres', 'year', 'label', 'comment', 'bpm', 'isrc'],
  },
  {
    nom: 'Audio',
    cleI18n: 'trackTags.groupAudio',
    champs: [
      'format',
      'sample_rate',
      'bit_depth',
      'channels',
      'duration_ms',
      'file_size',
      'file_path',
    ],
  },
  {
    nom: 'Système',
    cleI18n: 'trackTags.groupSystem',
    champs: [
      'id',
      'album_id',
      'artist_id',
      'source',
      'source_id',
      'audio_hash',
      'mtime',
      'mb_recording_id',
      'cover_path',
    ],
  },
];

/**
 * Les formes brutes que `normalizeTrackAllTags` recopie sous un autre nom.
 *
 * Clé = nom servi par le serveur, valeur = alias ajouté par le normaliseur.
 */
export const ALIAS_NORMALISEUR: Readonly<Record<string, string>> = {
  comments: 'comment',
  file_mtime: 'mtime',
  musicbrainz_recording_id: 'mb_recording_id',
};

/**
 * Les champs que `PATCH /metadata/tracks/{id}` accepte VRAIMENT.
 *
 * Établi en lisant `TrackEdit` (`tune-server/src/routes/metadata.rs:53`) et
 * `edit_track` (ligne 475) : `title`, `artist`, `album`, `album_id`,
 * `album_artist`, `genre`, `track_number`, `disc_number`, `year`, `composer`,
 * `label`. Rien d'autre n'est désérialisé.
 *
 * Ce qui suit n'est donc PAS ici, alors que le tiroir en offrait un champ de
 * saisie : `artist_id`, `bpm`, `comment`, `custom_tags`. `TrackEdit` n'a pas
 * `deny_unknown_fields` : le serveur répondait `200 {"status":"ok"}` sans rien
 * écrire, le tiroir annonçait « 1 champ mis à jour », puis son propre
 * rechargement remettait l'ancienne valeur. Une saisie qui ne peut pas
 * aboutir se montre en lecture seule ; elle ne se laisse pas remplir.
 *
 * `artist_name` et `album_title` restent en lecture seule eux aussi : le
 * serveur les accepte sous d'AUTRES noms (`artist`, `album`), et renommer les
 * clés au vol dépasse ce que ce ticket répare.
 */
export const CHAMPS_MODIFIABLES: ReadonlySet<string> = new Set([
  'title',
  'album_id',
  'album_artist',
  'genre',
  'track_number',
  'disc_number',
  'year',
  'composer',
  'label',
]);

/** Un groupe prêt à afficher : jamais vide. */
export interface GroupeAffichable {
  nom: string;
  cleI18n: string;
  champs: string[];
}

function memeValeur(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // `NaN`, et les nombres servis tantôt en entier tantôt en flottant.
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b || (Number.isNaN(a) && Number.isNaN(b));
  }
  return false;
}

/**
 * Répartit les champs servis dans les groupes, sans en perdre AUCUN.
 *
 * Les groupes nommés viennent d'abord, dans leur ordre ; ce qu'ils n'ont pas
 * réclamé finit dans `GROUPE_AUTRES`, trié pour que l'écran soit stable d'une
 * ouverture à l'autre. Les groupes vides ne sont pas rendus.
 */
export function grouperChampsPiste(
  dbFields: Record<string, unknown> | null | undefined,
): GroupeAffichable[] {
  if (!dbFields || typeof dbFields !== 'object') return [];

  const restants = new Set(Object.keys(dbFields));
  const sortie: GroupeAffichable[] = [];

  for (const groupe of GROUPES_CHAMPS_PISTE) {
    const champs = groupe.champs.filter((c) => restants.has(c));
    for (const c of champs) restants.delete(c);
    if (champs.length > 0) {
      sortie.push({ nom: groupe.nom, cleI18n: groupe.cleI18n, champs });
    }
  }

  // Une forme brute dont l'alias porte la même valeur n'apprend rien de plus.
  for (const [brut, alias] of Object.entries(ALIAS_NORMALISEUR)) {
    if (
      restants.has(brut) &&
      alias in dbFields &&
      memeValeur(dbFields[brut], dbFields[alias])
    ) {
      restants.delete(brut);
    }
  }

  const autres = [...restants].sort();
  if (autres.length > 0) {
    sortie.push({ nom: GROUPE_AUTRES, cleI18n: 'trackTags.groupOther', champs: autres });
  }
  return sortie;
}

/** Ce champ peut-il être écrit par `PATCH /metadata/tracks/{id}` ? */
export function champModifiable(champ: string): boolean {
  return CHAMPS_MODIFIABLES.has(champ);
}
