/**
 * #3383 — l'état de la bascule « télémétrie » vient du SERVEUR, jamais d'une
 * inversion locale.
 *
 * ## Ce qui était cassé
 *
 * `toggleCloudTelemetry` faisait `cloudTelemetryEnabled = !cloudTelemetryEnabled`
 * après le POST, sans regarder la réponse. Tant que la route ne persistait
 * rien, la case bougeait pendant que rien ne s'éteignait, et le
 * rafraîchissement suivant la remettait toute seule à sa place.
 *
 * Le serveur écrit désormais le refus, et sa réponse porte l'état EFFECTIF —
 * qui peut différer de ce qui a été demandé. Quand l'exploitant a posé
 * `TUNE_TELEMETRY=false`, `POST /cloud/telemetry/enable` répond
 * `{"enabled": false, "env_override": true}` : la télémétrie reste coupée à
 * l'échelle de la machine et l'écran ne peut rien rallumer. Inverser localement
 * afficherait alors une case cochée pour un envoi qui n'aura jamais lieu —
 * exactement le mensonge que l'issue reproche.
 *
 * ## Pourquoi un module, et pas trois lignes dans le composant
 *
 * Pour que la décision soit APPELABLE par un témoin. Un test qui relirait le
 * `.svelte` à la recherche d'une chaîne garderait le texte, pas le
 * comportement.
 */

/** Ce que renvoient `GET /cloud/telemetry/status` et les deux POST. */
export interface ReponseTelemetrie {
  enabled?: unknown;
  env_override?: unknown;
}

/** L'état que l'écran affiche. */
export interface EtatTelemetrie {
  /** La télémétrie est-elle effectivement acceptée sur cette instance ? */
  actif: boolean;
  /**
   * `TUNE_TELEMETRY` coupe à l'échelle de la machine : la bascule ne peut
   * rien rallumer, et doit le dire au lieu de faire semblant.
   */
  verrouEnvironnement: boolean;
}

/**
 * Lit l'état effectif dans une réponse du serveur.
 *
 * `repli` sert aux serveurs plus anciens que #3383, qui ne renvoient ni
 * `enabled` ni `env_override` : après un POST on retombe alors sur la valeur
 * DEMANDÉE — le comportement d'avant, ni meilleur ni pire — et au
 * rafraîchissement sur « actif, non verrouillé », le défaut historique.
 *
 * Toute valeur qui n'est pas un booléen est traitée comme absente : `null`,
 * `"false"` et `0` ne doivent jamais décider de ce qu'on affiche.
 */
export function etatTelemetrie(
  reponse: ReponseTelemetrie | null | undefined,
  repli: EtatTelemetrie,
): EtatTelemetrie {
  return {
    actif: typeof reponse?.enabled === 'boolean' ? reponse.enabled : repli.actif,
    verrouEnvironnement:
      typeof reponse?.env_override === 'boolean'
        ? reponse.env_override
        : repli.verrouEnvironnement,
  };
}

/**
 * La route à appeler pour DEMANDER `souhait`.
 *
 * Sortie de la fonction de bascule pour qu'un témoin puisse constater qu'un
 * clic sur une case décochée demande bien `enable`, et l'inverse — sans
 * relire le composant.
 */
export function routeDeBascule(souhait: boolean): string {
  return souhait ? '/cloud/telemetry/enable' : '/cloud/telemetry/disable';
}

/**
 * La plus longue pause cloud annoncée par `rate_limits` (secondes), ou 0.
 *
 * Reprise de l'ancien `SettingsView` (`longestCloudBackoffSeconds`) : la
 * même réponse de statut porte les suspensions de synchronisation, et
 * l'écran les affiche sous la bascule.
 */
export function pauseCloudLaPlusLongue(limites: unknown): number {
  if (!Array.isArray(limites)) return 0;
  return limites.reduce(
    (plus, l) => Math.max(plus, Number((l as { retry_after_seconds?: unknown })?.retry_after_seconds) || 0),
    0,
  );
}

/** Durée lisible d'une pause : « 5 min », « 2 h », « 1 h 30 min ». */
export function dureePause(secondes: number): string {
  const minutes = Math.max(1, Math.ceil(secondes / 60));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${reste} min`;
}
