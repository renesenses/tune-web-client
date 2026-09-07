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
import type { SettingsLevel } from './uiLevel';
import type { Track } from './types';
import { formatTime } from './utils';

export type CleColonne =
  | 'num' | 'title' | 'artist' | 'composer' | 'time' | 'year'
  | 'plays' | 'lastPlayed' | 'channels' | 'bpm' | 'genre' | 'quality';

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
  expert:       ['num', 'title', 'artist', 'composer', 'time', 'year', 'channels', 'bpm', 'genre', 'quality'],
};

/** Les modes dont le TABLEAU est réellement branché aujourd'hui. */
export const MODES_BRANCHES: SettingsLevel[] = ['beginner'];

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
export function colonnesRetenues(choix: readonly string[]): Colonne[] {
  const voulues = new Set(choix);
  return COLONNES.filter(
    (c) => !c.indisponible && (c.verrouillee || voulues.has(c.cle)),
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
    case 'plays':
    case 'lastPlayed':
      return null;
    case 'quality':  return null;
  }
}
