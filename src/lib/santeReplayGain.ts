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
  /** Pistes tenues à l'écart parce que leur fichier ne répond pas — report
   *  de six heures (#1865). Ni dans `total`, ni dans `processed`. Serveur
   *  ≥ 0.9.152 ; absent avant, et l'absence se lit « 0 ». */
  deferred?: number;
  /** `"unresolved_paths"` quand les reports sont la SEULE chose qui reste :
   *  la passe n'a rien à faire tant que le disque ne revient pas (#4254). */
  waiting_reason?: string | null;
}

export type EtatCarteReplayGain = 'inconnu' | 'idle' | 'running' | 'done' | 'off';

export interface JaugeReplayGain {
  etat: EtatCarteReplayGain;
  fait?: number;
  total?: number;
  /** Pistes reportées (fichier absent), à dire à côté de la jauge. `0` quand
   *  le serveur ne sait pas le compter — on n'affiche alors rien de plus. */
  reportees: number;
  /** Il ne reste QUE des reports : la carte dit « en attente d'un disque »,
   *  jamais « terminée » (#4254). */
  attendLesFichiers: boolean;
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
    return { etat: modeArme ? 'idle' : 'off', sansJauge: true, reportees: 0, attendLesFichiers: false };
  }

  // L'analyse est coupée côté serveur : la passe n'avancera pas, et une jauge
  // immobile se lirait comme une passe bloquée. On dit « désactivé ».
  if (avancement.enabled === false || !modeArme) {
    return { etat: 'off', sansJauge: true, reportees: 0, attendLesFichiers: false };
  }

  const total = Math.max(0, Math.trunc(avancement.total));
  // Le numérateur ne peut pas dépasser son dénominateur : une base qui garde
  // des témoins de pistes supprimées afficherait sinon 103 % — le défaut que
  // la carte acoustique a déjà connu (#1479).
  const fait = Math.min(total, Math.max(0, Math.trunc(avancement.processed)));

  // Les pistes que la passe REPORTE (fichier qui ne répond pas) ne sont ni
  // dans `total` ni dans `processed` : sans ce compteur, une bibliothèque
  // entière sur un partage démonté se lisait « terminée » (#4254).
  const reportees = estUnNombre(avancement.deferred) ? Math.max(0, Math.trunc(avancement.deferred)) : 0;
  const attendLesFichiers = avancement.waiting_reason === 'unresolved_paths' && reportees > 0;

  // Rien à analyser : la bibliothèque est faite. Pas de barre — une jauge
  // « 0 / 0 » ne dit rien à personne. Sauf s'il reste des reports : alors ce
  // n'est pas « fini », c'est « en attente d'un disque », et on le dit.
  if (total === 0) {
    return attendLesFichiers
      ? { etat: 'idle', sansJauge: true, reportees, attendLesFichiers }
      : { etat: 'done', sansJauge: true, reportees, attendLesFichiers: false };
  }

  if (avancement.active) {
    return { etat: 'running', fait, total, sansJauge: false, reportees, attendLesFichiers: false };
  }
  if (fait >= total) {
    return attendLesFichiers
      ? { etat: 'idle', fait, total, sansJauge: false, reportees, attendLesFichiers }
      : { etat: 'done', fait, total, sansJauge: false, reportees, attendLesFichiers: false };
  }
  // Du travail en attente, mais aucune campagne ouverte : la passe dort encore
  // (elle laisse passer deux minutes au démarrage) ou elle cède à la lecture.
  return { etat: 'idle', fait, total, sansJauge: false, reportees, attendLesFichiers: false };
}
