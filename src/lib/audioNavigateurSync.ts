/**
 * L'audio NAVIGATEUR obéit aux événements du serveur — dans les deux coquilles.
 *
 * 🔴 #1171 / serveur #4090 — Bilou, fil 1770 (0.9.148, Windows) : *« vider la
 * file d'attente ne coupe pas la lecture en cours »*.
 *
 * Quand la zone sort sur le navigateur, c'est un élément `<audio>` local qui
 * joue. Le serveur ne peut pas l'arrêter : il émet `playback.stopped`, et c'est
 * au client d'appeler `browserStop()`.
 *
 * Cette règle vivait dans `App.svelte`, **et là seulement**. `ShellV2` ne monte
 * jamais ce composant : dans la nouvelle coquille, aucun événement du serveur
 * n'atteignait l'élément audio. Vider la file laissait donc le morceau aller
 * jusqu'au bout — et ce n'était pas le seul geste perdu : **la pause, la
 * reprise et le rechargement au changement de piste** passaient par la même
 * branche.
 *
 * Exactement le défaut de #889, au même endroit et pour la même raison : une
 * règle écrite dans l'ancienne coquille, que la nouvelle ne monte pas. La
 * réponse est la même — la sortir ICI, tenue par les deux, plutôt que d'en
 * recopier une seconde version qui divergerait au premier correctif.
 *
 * Voir [[feedback_ecrit_mais_pas_branche]].
 */

/** Ce que la synchronisation sait faire faire à l'élément audio. */
export interface ActionsAudioNavigateur {
  /** `forcer` : recharger la source même si l'URL n'a pas changé. */
  jouer(src: string, forcer: boolean): void;
  pause(): void;
  /** `src` sert de repli quand la source est morte entre-temps. */
  reprendre(src?: string): void;
  arreter(): void;
}

/**
 * Applique un événement de lecture à l'élément audio local.
 *
 * Ne fait rien quand la zone ne sort pas sur le navigateur : les autres sorties
 * sont pilotées par le serveur lui-même.
 *
 * `source` rend l'URL du flux pour cette zone — à travers le relais, l'adresse
 * LAN ne mène nulle part depuis l'extérieur, et c'est l'appelant qui sait
 * laquelle des deux employer.
 */
export function appliquerEvenementAudioNavigateur(
  type: string,
  zone: unknown,
  estZoneNavigateur: (z: unknown) => boolean,
  source: (z: unknown) => string | undefined,
  actions: ActionsAudioNavigateur,
  donnees?: unknown,
): void {
  if (!zone || !estZoneNavigateur(zone)) return;

  switch (type) {
    case 'playback.paused':
      actions.pause();
      return;
    case 'playback.stopped':
      actions.arreter();
      return;
    case 'playback.resumed':
      // Même règle que `resumeAndSync` : la reprise sait recharger toute seule
      // quand la source est morte, mais il lui faut l'adresse pour cela.
      actions.reprendre(source(zone));
      return;
    case 'playback.started':
    case 'playback.track_changed': {
      // 🔴 Rechargement FORCÉ au changement de piste : le serveur sert la piste
      // suivante sous la MÊME adresse de flux, et sans cela l'élément rejoue le
      // tampon qui vient de finir — l'album « se répète » (Elie).
      //
      // Sauf pour un titre de RADIO (#7533) : le serveur annonce le morceau
      // que la station vient de lancer par ce même `track_changed`
      // (`poller/radio.rs` → `update_now_playing`), sur le MÊME flux. Le
      // recharger coupait le direct à chaque nouveau titre, au moment où la
      // pochette changeait. Sans forçage, `browserPlay` ne recharge que si
      // l'adresse a changé.
      const src = source(zone);
      if (src) {
        actions.jouer(src, type === 'playback.track_changed' && !estUnTitreDeRadio(donnees));
      }
      return;
    }
    default:
      // Tout le reste ne concerne pas l'élément audio — `playback.position` en
      // particulier, qui arrive en continu.
      return;
  }
}

/**
 * #7533 — `track_changed` d'une radio : le titre que la station annonce, pas
 * une nouvelle piste. Le serveur le marque `source: "radio"`
 * (`tune-core/src/poller/radio.rs`) et garde le flux (`stream_id`) de la
 * station : rien à recharger.
 *
 * Fil 2461 (Bilou, zone navigateur, Windows) : « coupure systématique au
 * chargement de la pochette » ; fil 2559 point 6 (FabienM, Firefox) :
 * « micro-coupure du son au changement de vignette du titre écouté ».
 */
export function estUnTitreDeRadio(donnees: unknown): boolean {
  return (
    typeof donnees === 'object' &&
    donnees !== null &&
    (donnees as { source?: unknown }).source === 'radio'
  );
}
