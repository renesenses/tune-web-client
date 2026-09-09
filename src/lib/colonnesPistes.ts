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
 * ## ✅ Les trois colonnes grisées sont RALLUMÉES (#824)
 *
 * `# Plays`, `Last Played` et `Dynamic Range` ont porté `indisponible: true`
 * du 07/09 au 09/09/2026, au motif écrit que la route ne rendait pas la
 * donnée. Le motif était juste le 07 et FAUX le 08 : le serveur a branché les
 * trois champs le 08/09 (#1388 pour le DR, #3518 pour les écoutes).
 *
 * ### Ce que j'ai mesuré moi-même, le 09/09/2026
 *
 * Contre le .18 en **v0.9.144** (`GET /api/v1/system/version`), c'est-à-dire
 * la version publiée, pas une tête de branche :
 *
 * ```
 * GET /library/tracks?limit=3            → play_count, last_played_at présents
 * GET /library/tracks?q=Lachrimae…       → idem (chemin FILTRÉ, is_active)
 * GET /library/tracks/16645              → idem (fiche d'une piste)
 * ```
 *
 * Les trois surfaces passent par le même seam serveur,
 * `tracks.rs::joindre_dr_par_piste`, qui appelle `albums.rs::attacher_ecoutes`.
 *
 * Le `dynamic_range` n'apparaissait sur AUCUNE piste — non pas parce que la
 * route l'ignore, mais parce que la bibliothèque du .18 ne porte pas un seul
 * tag `DYNAMIC RANGE` (`select count(*) from track_metadata where
 * key='dr_track'` → **0**). C'est exactement le piège dans lequel la mesure du
 * 07/09 est tombée : une clé absente d'une charge ne prouve rien tant qu'on
 * n'a pas vérifié qu'une piste porte la donnée. Deux lignes `dr_track`
 * posées le temps d'une mesure, puis retirées, ont fait apparaître la clé sur
 * les trois surfaces.
 *
 * ### Le contrat, qui n'est PAS le même pour les trois
 *
 *  - `dynamic_range` est **absente** quand la piste n'a pas le tag — jamais
 *    `null`, jamais `0`. `DR0` est la mesure d'un master saturé, pas une
 *    absence : une cellule vide ne doit jamais se lire « DR 0 », et une piste
 *    à DR0 doit afficher `0`, pas du vide. Mesuré : la valeur arrive en
 *    **chaîne** (`"0"`, `"14"`), comme sur l'album.
 *  - `play_count` vaut **`0`** et `last_played_at` **`null`** pour une piste
 *    jamais jouée : ici `0` est une vraie valeur, à afficher telle quelle. Les
 *    deux clés ne manquent que si la base a échoué — et le serveur préfère
 *    alors ne rien poser plutôt que mentir avec un zéro. Clé absente = cellule
 *    vide, et c'est le bon message.
 *
 * ### Le mode EXPERT passe au tableau, et le DR s'affiche enfin
 *
 * Premier état de ce lot : les trois colonnes étaient rallumées, mais `dr`
 * portait `min: 'expert'` alors que le tableau n'existait qu'en Essentiel — sa
 * valeur était calculée et éprouvée, et aucun écran ne la rendait. Arbitrage
 * de Bertrand, 09/09/2026 : **on branche le tableau en mode Expert**, et `dr`
 * garde son niveau. C'est l'écran qui descend vers la colonne, pas l'inverse.
 *
 * `MODES_BRANCHES` cite donc `beginner` ET `expert`. Avancé reste hors du
 * tableau : le périmètre est explicite, et rien ici ne le lui interdit le jour
 * où il suivra — il suffira de l'ajouter à cette liste, et à elle seule.
 */
import { levelRank, type SettingsLevel } from './uiLevel';
import type { Track } from './types';
import { formatTime } from './utils';
import { afficherDynamicRange } from './dynamicRange';

export type CleColonne =
  | 'num' | 'title' | 'artist' | 'composer' | 'time' | 'year'
  | 'plays' | 'lastPlayed' | 'channels' | 'bpm' | 'genre' | 'quality'
  // Ajoutées le 07/09/2026 : « je voudrai ajouter des metadata pour Advanced
  // et Expert, et donc grisé en Essential » (Bertrand).
  | 'album' | 'albumArtist' | 'disc' | 'label'
  | 'format' | 'sampleRate' | 'bitDepth' | 'size' | 'path' | 'isrc' | 'mbid'
  // « En expert, il les faut TOUTES comme Dynamic Range » (Bertrand,
  // 07/09/2026). Expert propose tout ce que la route porte — Dynamic Range
  // compris depuis le 08/09 (serveur #1388).
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
  /**
   * Le serveur ne fournit pas la donnée sur la route des pistes.
   *
   * 🔴 AUCUNE colonne ne le porte aujourd'hui (#824, 09/09/2026) — le drapeau
   * reste, la mécanique qui l'applique aussi. C'est une soupape, pas un
   * vestige : le jour où une route cesse de rendre un champ, la poser ici
   * grise la ligne dans les Réglages, écrit le motif à l'écran et écarte la
   * colonne même si un réglage d'hier la coche. La retirer obligerait à
   * réinventer les trois.
   */
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
  // Servies depuis le 08/09/2026 (serveur #3518, `albums.rs::attacher_ecoutes`),
  // mesurées le 09/09 sur le .18 en v0.9.144 : les deux clés sont là sur les
  // trois surfaces, `0`/`null` compris.
  { cle: 'plays',      cleI18n: 'v2.tcol.plays',      largeur: '72px',  align: 'droite' },
  { cle: 'lastPlayed', cleI18n: 'v2.tcol.lastPlayed', largeur: '116px', align: 'droite' },
  { cle: 'channels',   cleI18n: 'v2.tcol.channels',   largeur: '72px',  align: 'centre' },
  { cle: 'bpm',        cleI18n: 'v2.tcol.bpm',        largeur: '64px',  align: 'droite' },
  { cle: 'genre',      cleI18n: 'v2.tcol.genre',      largeur: 'minmax(0,1fr)' },
  { cle: 'quality',    cleI18n: 'v2.tcol.quality',    largeur: '132px' },

  // ── À partir d'AVANCÉ ────────────────────────────────────────────────────
  //
  // Des métadonnées de catalogue, puis les trois chiffres du fichier que tout
  // auditeur attentif lit : format, fréquence, profondeur. « D'Album à bit
  // depth accessible aussi en mode advanced » (Bertrand, 07/09/2026) — elles
  // étaient à Expert, et c'était trop haut : la pastille Qualité les résume
  // déjà en Essentiel, ces colonnes servent à TRIER et comparer.
  { cle: 'album',       cleI18n: 'v2.tcol.album',       largeur: 'minmax(0,1.4fr)', min: 'intermediate' },
  { cle: 'albumArtist', cleI18n: 'v2.tcol.albumArtist', largeur: 'minmax(0,1.2fr)', min: 'intermediate' },
  { cle: 'disc',        cleI18n: 'v2.tcol.disc',        largeur: '56px',  align: 'droite', min: 'intermediate' },
  { cle: 'label',       cleI18n: 'v2.tcol.label',       largeur: 'minmax(0,1fr)',   min: 'intermediate' },

  { cle: 'format',      cleI18n: 'v2.tcol.format',      largeur: '76px',  min: 'intermediate' },
  { cle: 'sampleRate',  cleI18n: 'v2.tcol.sampleRate',  largeur: '86px',  align: 'droite', min: 'intermediate' },
  { cle: 'bitDepth',    cleI18n: 'v2.tcol.bitDepth',    largeur: '68px',  align: 'droite', min: 'intermediate' },

  // ── À partir d'EXPERT ────────────────────────────────────────────────────
  // Ce qui décrit le FICHIER plutôt que la musique : taille, identifiants,
  // chemin, empreinte. On ne les cherche que quand on sait ce qu'on cherche.
  { cle: 'size',        cleI18n: 'v2.tcol.size',        largeur: '84px',  align: 'droite', min: 'expert' },
  { cle: 'isrc',        cleI18n: 'v2.tcol.isrc',        largeur: '124px', min: 'expert' },
  { cle: 'mbid',        cleI18n: 'v2.tcol.mbid',        largeur: '150px', min: 'expert' },
  { cle: 'comments',    cleI18n: 'v2.tcol.comments',    largeur: 'minmax(0,1.4fr)', min: 'expert' },
  { cle: 'discSubtitle', cleI18n: 'v2.tcol.discSubtitle', largeur: 'minmax(0,1fr)',  min: 'expert' },
  { cle: 'source',      cleI18n: 'v2.tcol.source',      largeur: '86px',  min: 'expert' },
  { cle: 'modified',    cleI18n: 'v2.tcol.modified',    largeur: '112px', align: 'droite', min: 'expert' },
  { cle: 'hash',        cleI18n: 'v2.tcol.hash',        largeur: '150px', min: 'expert' },
  /**
   * Dynamic Range — demandé nommément, et SERVI depuis le 08/09/2026.
   *
   * La mesure du 07/09 qui le déclarait absent portait sur un serveur d'avant
   * `tracks.rs::joindre_dr_par_piste` (#1388) ET sur une bibliothèque qui ne
   * contient aucun tag `DYNAMIC RANGE` — deux raisons de ne rien voir, dont
   * une seule était une panne. Re-mesuré le 09/09 sur le .18 en v0.9.144, avec
   * deux `dr_track` posées le temps de la mesure : la clé sort sur les trois
   * surfaces, `"0"` comprise.
   *
   * Elle reste `min: 'expert'` — et depuis le 09/09/2026 le tableau existe
   * aussi dans ce mode (`MODES_BRANCHES`), donc elle s'affiche pour de bon.
   */
  { cle: 'dr',          cleI18n: 'v2.tcol.dr',          largeur: '64px',  align: 'droite',
    min: 'expert' },
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
 * Essentiel reprend la maquette, moins « # Plays » et « Last Played ». Elles
 * sont désormais SERVIES (#824) mais restent décochées d'office : « oui,
 * # plays et last played voulues SI CHOISIES par l'utilisateur » (Bertrand,
 * 07/09/2026). Le défaut est un choix produit, pas un aveu d'absence — les
 * ajouter ici serait décider à sa place.
 *
 * 🔴 LA LISTE D'EXPERT N'EST PLUS THÉORIQUE (09/09/2026). Elle servait de
 * réserve tant que ce mode ne portait pas le tableau ; il le porte désormais,
 * et `settingsLevel` vaut `'expert'` PAR DÉFAUT depuis le 27/08. Ces dix
 * colonnes sont donc ce qu'un utilisateur voit à l'ouverture d'une
 * installation neuve. On n'y touche pas — « il les faut toutes » veut dire
 * toutes PROPOSÉES, pas toutes cochées — mais on sait maintenant ce qu'elle
 * coûte, et une liste vide ici ouvrirait une grille nue.
 *
 * Avancé, lui, reste hors du tableau : voir `MODES_BRANCHES`.
 */
export const DEFAUTS: Record<SettingsLevel, CleColonne[]> = {
  beginner:     ['num', 'title', 'artist', 'time', 'quality'],
  intermediate: ['num', 'title', 'artist', 'time', 'year', 'genre', 'quality'],
  // Expert reste RAISONNABLE par défaut : « il les faut toutes » veut dire
  // qu'elles sont toutes PROPOSÉES, pas toutes cochées d'office — vingt-deux
  // colonnes à l'ouverture seraient illisibles. Elles sont à un clic.
  expert:       ['num', 'title', 'artist', 'composer', 'time', 'year', 'channels', 'bpm', 'genre', 'quality'],
};

/**
 * Les modes dont le TABLEAU est réellement branché.
 *
 * 🔴 SOURCE UNIQUE. `ListePistesV2` décidait la même chose de son côté, en
 * dur : `enTableau = mode === 'beginner'`. Deux réponses à une seule question,
 * dont une seule — celle de l'écran des Réglages — consultait cette liste.
 * L'ajout d'`expert` ici n'aurait donc rien changé à l'affichage, et la
 * matrice aurait annoncé un mode branché que le tableau ignorait. Le
 * composant lit maintenant cette constante, et elle seule.
 *
 * Avancé n'y est pas : périmètre explicite de l'arbitrage du 09/09/2026, pas
 * un oubli. L'y ajouter suffira le jour venu — c'est tout l'intérêt d'une
 * source unique.
 */
export const MODES_BRANCHES: SettingsLevel[] = ['beginner', 'expert'];

/**
 * Ce mode rend-il un TABLEAU, ou des lignes ?
 *
 * La question de `ListePistesV2`, posée ici pour qu'il n'ait pas à la
 * retrancher. Un `includes` sur la constante exportée reste lisible chez lui,
 * mais une fonction nommée dit ce qu'on demande, et c'est elle qu'on cherche
 * quand on se demande où ça se décide.
 */
export function modeEnTableau(mode: SettingsLevel): boolean {
  return MODES_BRANCHES.includes(mode);
}

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

/**
 * Le nombre d'écoutes, ou `null` quand le serveur ne l'a pas posé (#824).
 *
 * 🔴 `0` est une VALEUR, pas une absence : le serveur pose toujours les deux
 * clés d'écoute quand la lecture a réussi, et `0` veut dire « jamais jouée ».
 * Un test de vérité (`t.play_count ? … : null`) rendrait donc la cellule vide
 * pour toute piste jamais jouée, c'est-à-dire l'immense majorité de la
 * bibliothèque — la colonne aurait l'air en panne.
 *
 * Clé ABSENTE, en revanche, veut dire que la base a échoué côté serveur : il
 * refuse alors de poser un `0` qui mentirait. La cellule reste vide, et c'est
 * le bon message.
 */
function nombreEcoutes(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return String(Math.trunc(v));
}

/**
 * La date de dernière écoute, ou `null`. Horodatage ISO en entrée (#824).
 *
 * `last_played_at` vaut `null` pour une piste jamais jouée — mesuré. On ne
 * remplace pas ce `null` par « jamais » : la colonne « # écoutes » d'à côté
 * porte déjà le `0`, et deux façons de dire la même chose sur une même ligne
 * se contrediraient au premier bogue.
 */
function dateEcoute(iso: unknown): string | null {
  if (typeof iso !== 'string' || iso.trim() === '') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
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
    // Métadonnées de catalogue, toutes présentes sur la route des pistes :
    // `texte()` rend `null` sur ce qui manque, et la cellule reste vide.
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
    /**
     * 🔴 Le Dynamic Range passe par `afficherDynamicRange`, et pas par
     * `texte()`.
     *
     * Le contrat est le MÊME que sur l'album — clé absente quand la piste n'a
     * pas le tag, `"0"` quand le master est écrasé — et ce module le tient
     * déjà, avec sa règle du tilde pour une valeur déduite. Le recopier ici
     * donnerait deux vérités sur le même champ, et c'est exactement ce que
     * `attach_track_tags` évite côté serveur.
     *
     * `texte()` aurait d'ailleurs suffi par accident (`String(0).trim()` vaut
     * `'0'`, qui est vrai) — mais par accident seulement : un jour où la
     * valeur arriverait en NOMBRE, `texte(0)` resterait bon et `t.dr ? …`
     * casserait. Une seule fonction, éprouvée, pour les deux écrans.
     */
    case 'dr':       return afficherDynamicRange(t)?.texte ?? null;
    case 'plays':      return nombreEcoutes(t.play_count);
    case 'lastPlayed': return dateEcoute(t.last_played_at);
    case 'quality':  return null;
  }
}
