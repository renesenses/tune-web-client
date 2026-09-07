/**
 * Les COLONNES d'une liste de pistes, et qui les choisit.
 *
 * Chantier ouvert par Bertrand le 07/09/2026, sur la maquette de Levente : en
 * mode Essentiel, une liste de pistes devient un vrai TABLEAU — une ligne
 * d'en-tête, une colonne par métadonnée, les colonnes choisies par
 * l'utilisateur dans les Réglages.
 *
 * ## Ce que ce module décide, et ce qu'il ne décide pas
 *
 * Il décrit les colonnes possibles, leur libellé, leur largeur, leur
 * alignement, et il extrait la VALEUR d'une piste pour une colonne donnée.
 * Il ne rend rien : la mise en page appartient au composant, et la qualité
 * s'affiche par `QualityBadge`, pas par une chaîne.
 *
 * ## 🔴 Deux colonnes sans donnée
 *
 * `# Plays` et `Last Played` sont cochées sur la maquette. Mesuré sur le .18
 * le 07/09/2026, la route qui remplit cet écran —
 * `GET /library/albums/{id}/tracks` — rend 31 champs, et ni `play_count` ni
 * `last_played_at` n'en font partie. Les comptes existent ailleurs
 * (`/library/history/top-tracks` rend `{track_id, plays}`), pas par piste sur
 * cette route.
 *
 * On les déclare donc `indisponible`, pour que l'écran des Réglages le DISE au
 * lieu d'offrir une colonne qui afficherait « — » partout sans qu'on sache
 * pourquoi. Elles s'allumeront le jour où le serveur les portera, sans autre
 * changement que le passage de ce drapeau à `false`.
 */
import { levelRank, type SettingsLevel } from './uiLevel';
import type { Track } from './types';
import { formatTime } from './utils';

export type CleColonne =
  | 'num' | 'title' | 'artist' | 'composer' | 'time' | 'year'
  | 'plays' | 'lastPlayed' | 'channels' | 'bpm' | 'genre' | 'quality'
  // Ajoutées le 07/09/2026 : « je voudrai ajouter des metadata pour Advanced
  // et Expert, et donc grisé en Essential » (Bertrand).
  | 'album' | 'albumArtist' | 'disc' | 'label'
  | 'format' | 'sampleRate' | 'bitDepth' | 'size' | 'path' | 'isrc' | 'mbid'
  // « En expert, il les faut TOUTES comme Dynamic Range » (Bertrand,
  // 07/09/2026). Expert propose donc tout ce que la route porte, plus le DR
  // qu'elle ne porte pas encore.
  | 'dr' | 'comments' | 'discSubtitle' | 'source' | 'modified' | 'hash';

export interface Colonne {
  cle: CleColonne;
  /** Clé de traduction du libellé. Jamais une chaîne en dur. */
  cleI18n: string;
  /** Part de grille. `auto` pour ce qui se dimensionne au contenu. */
  largeur: string;
  align?: 'droite' | 'centre';
  /**
   * Toujours affichée, et non décochable.
   *
   * Le titre seulement : une liste de pistes sans titre n'est plus une liste
   * de pistes. La maquette laisse d'ailleurs `#` décochable, et c'est bien —
   * le numéro n'a pas de sens hors d'un album.
   */
  verrouillee?: boolean;
  /** Le serveur ne fournit pas encore la donnée sur la route des pistes. */
  indisponible?: boolean;
  /**
   * Niveau d'interface MINIMUM auquel cette colonne est proposée.
   *
   * Absent = disponible partout, Essentiel compris.
   *
   * « Je voudrai ajouter des metadata pour Advanced et Expert, et donc grisé
   * en Essential » (Bertrand, 07/09/2026). C'est la même mécanique que le
   * grisage des modes non branchés, dans l'autre sens : ici c'est la LIGNE qui
   * n'est pas offerte à ce mode, pas la colonne.
   *
   * Le mode Essentiel est censé être le plus simple : y proposer le chemin du
   * fichier ou l'identifiant MusicBrainz irait contre sa raison d'être.
   */
  min?: SettingsLevel;
}

/**
 * Le catalogue, dans l'ORDRE d'affichage de la maquette.
 *
 * L'ordre est celui du tableau, pas celui du panneau de réglage : c'est lui
 * qui compte à l'écran, et un second ordre serait une seconde vérité.
 */
export const COLONNES: Colonne[] = [
  { cle: 'num',        cleI18n: 'v2.tcol.num',        largeur: '44px',  align: 'droite' },
  { cle: 'title',      cleI18n: 'v2.tcol.title',      largeur: 'minmax(0,2fr)', verrouillee: true },
  { cle: 'artist',     cleI18n: 'v2.tcol.artist',     largeur: 'minmax(0,1.4fr)' },
  { cle: 'composer',   cleI18n: 'v2.tcol.composer',   largeur: 'minmax(0,1.2fr)' },
  { cle: 'time',       cleI18n: 'v2.tcol.time',       largeur: '64px',  align: 'droite' },
  { cle: 'year',       cleI18n: 'v2.tcol.year',       largeur: '56px',  align: 'droite' },
  { cle: 'plays',      cleI18n: 'v2.tcol.plays',      largeur: '72px',  align: 'droite', indisponible: true },
  { cle: 'lastPlayed', cleI18n: 'v2.tcol.lastPlayed', largeur: '116px', align: 'droite', indisponible: true },
  { cle: 'channels',   cleI18n: 'v2.tcol.channels',   largeur: '72px',  align: 'centre' },
  { cle: 'bpm',        cleI18n: 'v2.tcol.bpm',        largeur: '64px',  align: 'droite' },
  { cle: 'genre',      cleI18n: 'v2.tcol.genre',      largeur: 'minmax(0,1fr)' },
  { cle: 'quality',    cleI18n: 'v2.tcol.quality',    largeur: '132px' },

  // ── À partir d'AVANCÉ ────────────────────────────────────────────────────
  // Des métadonnées de catalogue : utiles, pas techniques.
  { cle: 'album',       cleI18n: 'v2.tcol.album',       largeur: 'minmax(0,1.4fr)', min: 'intermediate' },
  { cle: 'albumArtist', cleI18n: 'v2.tcol.albumArtist', largeur: 'minmax(0,1.2fr)', min: 'intermediate' },
  { cle: 'disc',        cleI18n: 'v2.tcol.disc',        largeur: '56px',  align: 'droite', min: 'intermediate' },
  { cle: 'label',       cleI18n: 'v2.tcol.label',       largeur: 'minmax(0,1fr)',   min: 'intermediate' },

  // ── À partir d'EXPERT ────────────────────────────────────────────────────
  // Le détail du fichier. `quality` en dit déjà l'essentiel en une pastille ;
  // ces trois-là existent pour qui veut TRIER ou comparer colonne par colonne.
  { cle: 'format',      cleI18n: 'v2.tcol.format',      largeur: '76px',  min: 'expert' },
  { cle: 'sampleRate',  cleI18n: 'v2.tcol.sampleRate',  largeur: '86px',  align: 'droite', min: 'expert' },
  { cle: 'bitDepth',    cleI18n: 'v2.tcol.bitDepth',    largeur: '68px',  align: 'droite', min: 'expert' },
  { cle: 'size',        cleI18n: 'v2.tcol.size',        largeur: '84px',  align: 'droite', min: 'expert' },
  { cle: 'isrc',        cleI18n: 'v2.tcol.isrc',        largeur: '124px', min: 'expert' },
  { cle: 'mbid',        cleI18n: 'v2.tcol.mbid',        largeur: '150px', min: 'expert' },
  { cle: 'comments',    cleI18n: 'v2.tcol.comments',    largeur: 'minmax(0,1.4fr)', min: 'expert' },
  { cle: 'discSubtitle', cleI18n: 'v2.tcol.discSubtitle', largeur: 'minmax(0,1fr)',  min: 'expert' },
  { cle: 'source',      cleI18n: 'v2.tcol.source',      largeur: '86px',  min: 'expert' },
  { cle: 'modified',    cleI18n: 'v2.tcol.modified',    largeur: '112px', align: 'droite', min: 'expert' },
  { cle: 'hash',        cleI18n: 'v2.tcol.hash',        largeur: '150px', min: 'expert' },
  /**
   * 🔴 Dynamic Range — demandé nommément, et SANS DONNÉE sur cette route.
   *
   * Mesuré sur le .18 le 07/09/2026 : la charge d'une piste ne porte aucun
   * champ `dr`, ni rien qui s'en approche (`replay`, `gain`, `loudness`,
   * `peak` : zéro correspondance sur les 31 clés). Le serveur SAIT pourtant
   * filtrer dessus — `/library/tracks?dr=10` rend 0 sur 46 877, là où un
   * paramètre inconnu en rend 46 877 — mais il ne le RESTITUE pas.
   *
   * Même traitement que « # Plays » : proposée dans la matrice, grisée, motif
   * écrit. Elle s'allumera quand la route la portera.
   */
  { cle: 'dr',          cleI18n: 'v2.tcol.dr',          largeur: '64px',  align: 'droite',
    min: 'expert', indisponible: true },
  // Le chemin en dernier : c'est la plus longue, et la seule qu'on lit de
  // gauche à droite jusqu'au bout.
  { cle: 'path',        cleI18n: 'v2.tcol.path',        largeur: 'minmax(0,2fr)',   min: 'expert' },
];

export const PAR_CLE: Record<CleColonne, Colonne> = Object.fromEntries(
  COLONNES.map((c) => [c.cle, c]),
) as Record<CleColonne, Colonne>;

/**
 * Le choix par DÉFAUT de chaque mode.
 *
 * Essentiel reprend la maquette, moins les deux colonnes sans donnée : les
 * proposer cochées d'office remplirait l'écran de tirets le premier jour.
 * Elles restent choisissables — « oui, # plays et last played voulues si
 * choisies par l'utilisateur » (Bertrand, 07/09/2026) — le jour où le serveur
 * les portera.
 *
 * Avancé et Expert ne sont PAS branchés pour l'instant (décision Bertrand,
 * option A) : leurs listes existent, l'écran des Réglages les montre grisées
 * et le dit. Elles serviront telles quelles quand ces modes passeront au
 * tableau.
 */
export const DEFAUTS: Record<SettingsLevel, CleColonne[]> = {
  beginner:     ['num', 'title', 'artist', 'time', 'quality'],
  intermediate: ['num', 'title', 'artist', 'time', 'year', 'genre', 'quality'],
  // Expert reste RAISONNABLE par défaut : « il les faut toutes » veut dire
  // qu'elles sont toutes PROPOSÉES, pas toutes cochées d'office — vingt-deux
  // colonnes à l'ouverture seraient illisibles. Elles sont à un clic.
  expert:       ['num', 'title', 'artist', 'composer', 'time', 'year', 'channels', 'bpm', 'genre', 'quality'],
};

/** Les modes dont le TABLEAU est réellement branché aujourd'hui. */
export const MODES_BRANCHES: SettingsLevel[] = ['beginner'];

/** Cette colonne est-elle offerte à ce mode ? */
export function offerteAu(c: Colonne, mode: SettingsLevel): boolean {
  return !c.min || levelRank(mode) >= levelRank(c.min);
}

/**
 * Les colonnes retenues, dans l'ordre du catalogue, titre garanti.
 *
 * Trois garde-fous, chacun pour une panne vécue ailleurs dans ce client :
 *  - une clé inconnue (réglage écrit par une version future) est écartée
 *    plutôt que de faire planter la grille ;
 *  - une colonne `indisponible` est écartée même si elle est cochée — le
 *    serveur peut cesser de la fournir, le réglage lui survivrait ;
 *  - le titre est toujours là, même absent du réglage.
 */
export function colonnesRetenues(
  choix: readonly string[],
  mode: SettingsLevel = 'expert',
): Colonne[] {
  const voulues = new Set(choix);
  return COLONNES.filter(
    (c) =>
      !c.indisponible &&
      offerteAu(c, mode) &&
      (c.verrouillee || voulues.has(c.cle)),
  );
}

/** `grid-template-columns` de l'en-tête ET des lignes — une seule source. */
export function gabaritGrille(colonnes: readonly Colonne[]): string {
  return colonnes.map((c) => c.largeur).join(' ');
}

/**
 * La valeur d'une piste pour une colonne, ou `null` s'il n'y a rien à dire.
 *
 * `null` et chaîne vide ne sont pas la même chose : `null` laisse la cellule
 * VIDE, ce qui se lit comme « on ne sait pas ». Écrire « 0 » ou « — » à la
 * place affirmerait une valeur qu'on n'a pas.
 *
 * `quality` ne passe pas par ici : c'est une pastille, pas un texte.
 */
/** La date de modification du fichier, ou `null`. Secondes UNIX en entrée. */
function dateFichier(secondes: unknown): string | null {
  if (typeof secondes !== 'number' || !Number.isFinite(secondes) || secondes <= 0) return null;
  const d = new Date(secondes * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Une taille de fichier lisible. `0` reste `0 o` : c'est une information. */
function tailleFichier(octets: unknown): string | null {
  if (typeof octets !== 'number' || !Number.isFinite(octets) || octets < 0) return null;
  if (octets < 1024) return `${octets} o`;
  const mo = octets / (1024 * 1024);
  return mo < 1 ? `${Math.round(octets / 1024)} Ko` : `${(Math.round(mo * 10) / 10)} Mo`;
}

export function valeurColonne(t: Track, cle: CleColonne): string | null {
  const texte = (v: unknown): string | null => {
    const s = v == null ? '' : String(v).trim();
    return s ? s : null;
  };
  switch (cle) {
    case 'num':      return t.track_number != null ? String(t.track_number) : null;
    case 'title':    return texte(t.title);
    case 'artist':   return texte(t.artist_name);
    case 'composer': return texte((t as any).composer);
    case 'time':     return t.duration_ms ? formatTime(t.duration_ms) : null;
    case 'year':     return t.year != null ? String(t.year) : null;
    case 'channels': return (t as any).channels != null ? String((t as any).channels) : null;
    case 'bpm':      return (t as any).bpm != null ? String(Math.round((t as any).bpm)) : null;
    case 'genre':    return texte((t as any).genre);
    // Sans donnée sur la route des pistes : la cellule reste vide, et la
    // colonne n'est de toute façon pas proposée tant que `indisponible` tient.
    case 'album':       return texte((t as any).album_title);
    case 'albumArtist': return texte((t as any).album_artist);
    case 'disc':        return (t as any).disc_number != null ? String((t as any).disc_number) : null;
    case 'label':       return texte((t as any).label);
    case 'format':      return t.format ? String(t.format).toUpperCase() : null;
    // La fréquence en kHz, à une décimale : 44100 se lit « 44,1 kHz », pas
    // « 44100 ». L'unité est dans la valeur — l'en-tête dit déjà le champ.
    case 'sampleRate':  return t.sample_rate ? `${Math.round(t.sample_rate / 100) / 10} kHz` : null;
    case 'bitDepth':    return t.bit_depth ? `${t.bit_depth} bit` : null;
    case 'size':        return tailleFichier((t as any).file_size);
    case 'isrc':        return texte((t as any).isrc);
    case 'mbid':        return texte((t as any).musicbrainz_recording_id);
    case 'path':        return texte((t as any).file_path);
    case 'comments':     return texte((t as any).comments);
    case 'discSubtitle': return texte((t as any).disc_subtitle);
    case 'source':       return texte(t.source);
    case 'hash':         return texte((t as any).audio_hash);
    // `file_mtime` est un horodatage UNIX en SECONDES (1777546399.0 mesuré) :
    // le passer tel quel à `Date` donnerait 1970.
    case 'modified':     return dateFichier((t as any).file_mtime);
    case 'dr':
    case 'plays':
    case 'lastPlayed':
      return null;
    case 'quality':  return null;
  }
}
