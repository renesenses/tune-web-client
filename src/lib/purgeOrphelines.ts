/**
 * Retirer un dossier de musique, et proposer de retirer ce qu'il contenait
 * (#2149).
 *
 * Défaut d'origine : `handleRemoveMusicDir` faisait `await
 * api.removeMusicDir(path)` et **jetait la réponse**. Le serveur y annonce
 * pourtant, depuis v0.9.127, tout ce qu'il faut pour finir le geste :
 *
 *   { "dirs": [...], "orphan_tracks": 1240, "confirm_purge_required": 1240,
 *     "impact": { "tracks": 1240, "playlists": 3, "playlist_entries": 87,
 *                 "favorites": 12, "history_entries": 430, "queue_entries": 0 } }
 *
 * Sans écran pour les lire, ces pistes restaient dans la base pour toujours :
 * elles ne sont plus sous aucune racine, donc le scan ne les visite plus et
 * ne les purgera JAMAIS (`HorsPerimetre`, #1943). Un testeur ne pouvait pas
 * purger — seul un appel HTTP à la main le pouvait.
 *
 * # Le geste, en deux appels sur la MÊME route
 *
 * 1. `POST /system/music-dirs/remove {path}` — retire le dossier, ne
 *    supprime rien, et dit ce qu'il laisse derrière lui.
 * 2. si l'utilisateur dit oui : `POST /system/music-dirs/remove {path,
 *    confirm_purge: N}` — le retrait est idempotent (le dossier n'est déjà
 *    plus dans la liste), l'ensemble orphelin est recalculé à l'identique, et
 *    la purge s'exécute.
 *
 * On ne passe PAS par `/music-dirs/purge-orphans` : cette route refuse en
 * bloc (`contient_une_racine`) quand une racine imbriquée subsiste sous le
 * dossier retiré — c'est l'angle mort que `/remove` corrige en calculant les
 * orphelines **contre les racines qui restent**.
 *
 * # `confirm_purge` est un NOMBRE, pas un booléen
 *
 * Il doit couvrir le nombre EXACT constaté, sinon le plafond de #1943 refuse
 * tout : une confirmation prise sur un écran périmé ne peut pas autoriser une
 * purge plus large que celle qui a été montrée. Le refus se lit dans le CORPS
 * (`purge_refused`), jamais dans le code HTTP — le retrait, lui, a réussi.
 *
 * Module PUR : il reçoit la réponse et sa fonction de traduction. Le
 * `message` du serveur n'est jamais affiché — il n'existe qu'en français.
 */

/**
 * Lecture de clé SEULE — exactement le contrat de `$t()`, qui ne sait pas
 * interpoler. L'interpolation `{clé}` est faite ICI, pour que l'appelant
 * puisse passer `get(t)` directement : lui donner une fonction à deux
 * paramètres inviterait à passer `$t`, qui ignorerait `vars` en silence et
 * afficherait « {count} pistes » à l'utilisateur.
 */
export type Traduire = (key: string) => string;

function interpoler(modele: string, vars?: Record<string, number>): string {
  if (!vars) return modele;
  let s = modele;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

function phrase(tr: Traduire, key: string, vars?: Record<string, number>): string {
  return interpoler(tr(key), vars);
}

/** Ce que `POST /system/music-dirs/remove` rend, sur ses cinq formes. */
export interface RetraitDossier {
  /** La nouvelle liste des racines. Le serveur dit `dirs`, PAS `music_dirs`. */
  dirs?: string[];
  orphan_tracks?: number;
  confirm_purge_required?: number;
  purged?: number;
  purge_refused?: boolean;
  purge_refused_reason?: string;
  impact?: ImpactPurge;
  /** Ce que la purge exécutée a emporté en cascade, et ce qu'elle a recollé. */
  orphan_albums_removed?: number;
  orphan_artists_removed?: number;
  favorites_relinked?: number;
  favorites_unresolved?: number;
  hidden_relinked?: number;
  hidden_unresolved?: number;
  distinct_pairs_relinked?: number;
  distinct_pairs_unresolved?: number;
  /** Phrase du serveur, en français uniquement — jamais affichée. */
  message?: string;
}

/** Ce que la purge emporterait, au-delà des pistes elles-mêmes. */
export interface ImpactPurge {
  tracks?: number;
  playlists?: number;
  playlist_entries?: number;
  favorites?: number;
  history_entries?: number;
  queue_entries?: number;
}

function entier(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Faut-il proposer la purge ?
 *
 * Uniquement si le serveur annonce des pistes ET le nombre à confirmer. Un
 * serveur antérieur à #2149 n'envoie ni l'un ni l'autre : on ne propose rien,
 * et le retrait se comporte exactement comme avant.
 */
export function purgeAProposer(rep: RetraitDossier | null | undefined): number {
  const r = rep ?? {};
  const orphelines = entier(r.orphan_tracks);
  const requis = entier(r.confirm_purge_required);
  return orphelines > 0 && requis > 0 ? requis : 0;
}

/**
 * La question posée à l'utilisateur.
 *
 * Elle dit les trois choses qu'il lui faut : ce qui vient de se passer (le
 * dossier EST retiré), ce que la purge emporterait, et ce qu'elle ne touche
 * pas — les fichiers. Sans cette dernière phrase, « retirer 1240 pistes » se
 * lit comme « effacer 1240 fichiers ».
 */
export function questionDePurge(rep: RetraitDossier, tr: Traduire): string {
  const pistes = purgeAProposer(rep);
  const phrases = [phrase(tr, 'settings.orphanTracksAsk', { count: pistes })];

  const collateral = impactCollateral(rep.impact);
  if (collateral.length > 0) phrases.push(phrase(tr, 'settings.orphanTracksImpact', collateral[0]));

  phrases.push(tr('settings.orphanTracksFilesSafe'));
  return phrases.join(' ');
}

/**
 * Les dégâts collatéraux à annoncer : playlists, favoris, file d'attente.
 *
 * On ne cite QUE ce qui est non nul — annoncer « 0 playlist » à chaque fois
 * transforme l'avertissement en bruit. L'historique n'est pas cité : c'est du
 * journal, sa perte ne surprend personne.
 */
function impactCollateral(impact: ImpactPurge | undefined): Array<Record<string, number>> {
  const i = impact ?? {};
  const vars = {
    playlists: entier(i.playlists),
    favorites: entier(i.favorites),
    queue: entier(i.queue_entries),
  };
  return vars.playlists + vars.favorites + vars.queue > 0 ? [vars] : [];
}

/** Le ton du bandeau final, et sa phrase. */
export interface Verdict {
  ton: 'success' | 'error' | 'info';
  message: string;
}

/**
 * Ce qu'on annonce APRÈS la purge confirmée.
 *
 * Le refus n'est pas une erreur de transport : le serveur rend 200, le
 * dossier est bien retiré, seule la suppression n'a pas eu lieu. On le dit
 * comme tel, avec le nombre — sans quoi l'utilisateur croit que son geste a
 * échoué en bloc.
 */
export function verdictDePurge(rep: RetraitDossier, tr: Traduire): Verdict {
  if (rep.purge_refused === true) {
    return {
      ton: 'error',
      message: phrase(tr, 'settings.orphanTracksRefused', { count: entier(rep.orphan_tracks) }),
    };
  }
  const purgees = entier(rep.purged);
  if (purgees > 0) {
    return { ton: 'success', message: phrase(tr, 'settings.orphanTracksPurged', { count: purgees }) };
  }
  // Purge acceptée mais rien à retirer : l'ensemble a fondu entre les deux
  // appels (un scan est passé). Ce n'est pas un échec.
  return { ton: 'info', message: tr('settings.orphanTracksNothingLeft') };
}

/**
 * Ce qu'on annonce quand l'utilisateur REFUSE la purge.
 *
 * Le nombre ne doit pas disparaître avec la boîte de dialogue : ces pistes
 * sont maintenant hors de portée du scan, et rien d'autre que ce geste ne les
 * retirera. On le rappelle une fois.
 */
export function verdictDeRefus(rep: RetraitDossier, tr: Traduire): Verdict {
  return {
    ton: 'info',
    message: phrase(tr, 'settings.orphanTracksKept', { count: purgeAProposer(rep) }),
  };
}
