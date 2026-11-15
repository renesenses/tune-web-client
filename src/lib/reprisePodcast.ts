/**
 * Relancer un épisode de podcast depuis la fiche du podcast, à sa position.
 *
 * Constat (08/11/2026) : un épisode commencé, lancé depuis la fiche, repartait
 * toujours du début — l'écran n'envoyait aucune position à
 * `POST /podcasts/play/{zone}`, alors que « Reprendre l'écoute » et
 * l'Historique reprennent à la position enregistrée.
 *
 * La position vient de `GET /home/continue-listening` (lignes
 * `context_type: "podcast"`, `position_ms`). Le serveur supprime la reprise
 * d'un épisode terminé : une ligne absente veut dire « jamais commencé ou
 * terminé », et l'épisode part du début. La route `/podcasts/play` n'applique
 * pas le recul de reprise (réglage `continue_listening_rewind_seconds`,
 * 10 s par défaut) : on le retire ici, comme le fait « Reprendre l'écoute ».
 *
 * tune-server-rust#8170 — « Continuer l'écoute » ne rend qu'UNE reprise par
 * podcast (le dernier épisode écouté). `GET /podcasts/positions` rend celle
 * de chaque épisode commencé, reconnu par l'adresse de son média : une ligne
 * qui porte `audio_url` se rapproche par l'adresse, jamais par le titre.
 */

/** Les champs d'une ligne de « Continuer l'écoute » utiles aux épisodes. */
export interface LigneEpisode {
  context_type?: string | null;
  /** #8170 — l'adresse du média, quand la ligne vient de `/podcasts/positions`. */
  audio_url?: string | null;
  title?: string | null;
  last_track_title?: string | null;
  position_ms?: number | null;
}

export interface Progression {
  positionMs: number;
  /** 0–100 ; `null` quand la durée de l'épisode est inconnue. */
  pourcent: number | null;
}

/** Le serveur propose 10 s par défaut (tune-server-rust#7819). */
export const RECUL_DEFAUT_S = 10;
/** En deçà, l'épisode est considéré fini : il repart du début. */
const FIN_RESTE_MS = 15_000;
const FIN_POURCENT = 97;

const nettoye = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** #8170 — la clé d'un épisode : son adresse sans espaces ni fragment, comme
 *  `cle_d_episode` côté serveur. */
export function cleEpisode(url: string | null | undefined): string {
  const u = (url ?? '').trim();
  return u.split('#')[0] ?? u;
}

/**
 * Où en est l'épisode `ep` du podcast `nomPodcast` ? `null` si l'épisode n'a
 * pas de reprise, ou s'il est terminé.
 */
export function progressionEpisode(
  ep: { title?: string | null; duration_ms?: number | null; audio_url?: string | null },
  nomPodcast: string | null | undefined,
  lignes: readonly LigneEpisode[],
): Progression | null {
  const titre = nettoye(ep?.title);
  const adresse = cleEpisode((ep as { audio_url?: string | null })?.audio_url);
  const podcast = nettoye(nomPodcast);
  // #8170 — d'abord par l'adresse du média ; le titre n'est que le repli des
  // lignes de « Continuer l'écoute », qui ne la portent pas.
  const parAdresse = adresse
    ? lignes.find((l) => l?.context_type === 'podcast' && !!l.audio_url && cleEpisode(l.audio_url) === adresse)
    : undefined;
  if (!parAdresse && !titre) return null;
  const ligne = parAdresse ?? lignes.find((l) => {
    if (l?.context_type !== 'podcast' || l.audio_url) return false;
    if (nettoye(l.last_track_title) !== titre) return false;
    const nom = nettoye(l.title);
    return !podcast || !nom || nom === podcast;
  });
  const positionMs = Math.max(0, Math.floor(Number(ligne?.position_ms ?? 0)));
  if (!ligne || positionMs <= 0) return null;
  const duree = Number(ep?.duration_ms ?? 0);
  if (duree > 0) {
    const pourcent = Math.min(100, (positionMs * 100) / duree);
    if (duree - positionMs <= FIN_RESTE_MS || pourcent >= FIN_POURCENT) return null;
    return { positionMs, pourcent };
  }
  return { positionMs, pourcent: null };
}

/** Le recul réglé côté serveur, borné à 0–60 s ; le défaut sinon. */
export function reculDeLaConfig(config: unknown): number {
  const v = (config as { continue_listening_rewind_seconds?: unknown } | null)?.continue_listening_rewind_seconds;
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(60, Math.max(0, Math.floor(v))) : RECUL_DEFAUT_S;
}

/**
 * La position à transmettre au lancement (`seek_ms`).
 *
 *  - `depuisLeDebut`  → 0, explicitement ;
 *  - épisode commencé → sa position moins le recul ;
 *  - sinon            → `undefined` : rien n'est envoyé, l'épisode part du début.
 */
export function positionDeLancement(
  progression: Progression | null,
  reculS: number,
  depuisLeDebut: boolean,
): number | undefined {
  if (depuisLeDebut) return 0;
  if (!progression) return undefined;
  return Math.max(0, progression.positionMs - Math.max(0, reculS) * 1000);
}

/** « 12:05 » ou « 1:02:09 ». */
export function formatPosition(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const deux = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`;
}
