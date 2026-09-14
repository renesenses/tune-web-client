/**
 * La carte « ReplayGain » de l'écran Santé : ce qu'elle a le droit d'afficher.
 *
 * #4144 — la carte annonçait `IDLE` pendant qu'une passe de plusieurs heures
 * tournait, et elle avait raison de le faire : aucune route ne lui donnait
 * d'avancement. Le serveur en expose une désormais
 * (`GET /system/replaygain/progress`).
 *
 * 🔴 LA PROPRIÉTÉ QUI COMPTE, ET QU'IL NE FAUT PAS PERDRE : **un serveur qui ne
 * répond pas doit laisser la carte sur son message d'absence**. Un serveur en
 * 0.9.149 ou plus ancien n'a pas la route ; la promesse est alors rejetée, et
 * la carte doit continuer d'afficher proprement — surtout pas une jauge vide,
 * qui se lirait comme « 0 piste analysée » sur une bibliothèque entièrement
 * traitée. C'est la règle de l'écran, écrite en tête de `TuneHealthV2.svelte` :
 * chaque carte dit ce qu'elle SAIT.
 *
 * D'où cette décision sortie du composant : elle se garde ici, sans monter
 * l'écran, et c'est le seul endroit où elle est écrite.
 */

/** Ce que rend `GET /system/replaygain/progress`. Tous les champs sont
 *  optionnels à dessein : un serveur inconnu peut répondre n'importe quoi, et
 *  ce module doit retomber sur l'absence plutôt que sur `NaN`. */
export interface AvancementReplayGain {
  /** Une campagne est ouverte. ⚠️ pas « décode à cette seconde » : la passe
   *  cède à la lecture sans refermer sa campagne. */
  active?: boolean;
  processed?: number;
  total?: number;
  remaining?: number;
  updated_at?: number;
  /** La passe a-t-elle annoncé quelque chose depuis le démarrage du serveur. */
  reported?: boolean;
  /** L'analyse est-elle armée côté serveur. */
  enabled?: boolean;
}

export type EtatCarteReplayGain = 'inconnu' | 'idle' | 'running' | 'done' | 'off';

export interface JaugeReplayGain {
  etat: EtatCarteReplayGain;
  fait?: number;
  total?: number;
  /**
   * `true` = la carte garde son message d'absence et n'affiche AUCUNE barre.
   * C'est l'état de repli, et c'est lui qui doit survivre à tout ce que ce
   * module ne comprend pas.
   */
  sansJauge: boolean;
}

function estUnNombre(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Ce que la carte ReplayGain affiche, à partir de la configuration et — quand
 * le serveur sait la donner — de l'avancement de la passe.
 *
 * @param modeArme `replaygain_mode` vaut autre chose que `off`.
 * @param avancement la réponse de la route, ou `null` quand elle n'a pas
 *   répondu (serveur antérieur, réseau coupé, réponse illisible).
 */
export function jaugeReplayGain(
  modeArme: boolean,
  avancement: AvancementReplayGain | null | undefined,
): JaugeReplayGain {
  // ── Le repli, et il est délibérément large ──────────────────────────────
  // Pas de réponse, ou une réponse dont on ne sait pas lire le couple : on ne
  // sait pas, on le dit. Un serveur plus ancien passe exactement par ici.
  if (!avancement || !estUnNombre(avancement.total) || !estUnNombre(avancement.processed)) {
    return { etat: modeArme ? 'idle' : 'off', sansJauge: true };
  }

  // L'analyse est coupée côté serveur : la passe n'avancera pas, et une jauge
  // immobile se lirait comme une passe bloquée. On dit « désactivé ».
  if (avancement.enabled === false || !modeArme) {
    return { etat: 'off', sansJauge: true };
  }

  const total = Math.max(0, Math.trunc(avancement.total));
  // Le numérateur ne peut pas dépasser son dénominateur : une base qui garde
  // des témoins de pistes supprimées afficherait sinon 103 % — le défaut que
  // la carte acoustique a déjà connu (#1479).
  const fait = Math.min(total, Math.max(0, Math.trunc(avancement.processed)));

  // Rien à analyser : la bibliothèque est faite. Pas de barre — une jauge
  // « 0 / 0 » ne dit rien à personne.
  if (total === 0) {
    return { etat: 'done', sansJauge: true };
  }

  if (avancement.active) {
    return { etat: 'running', fait, total, sansJauge: false };
  }
  if (fait >= total) {
    return { etat: 'done', fait, total, sansJauge: false };
  }
  // Du travail en attente, mais aucune campagne ouverte : la passe dort encore
  // (elle laisse passer deux minutes au démarrage) ou elle cède à la lecture.
  return { etat: 'idle', fait, total, sansJauge: false };
}
