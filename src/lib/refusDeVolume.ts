/**
 * tune-server-rust#6721 — fil forum 2366 (Marantz NR1200, tweeter détruit).
 *
 * « Je saisis le curseur pour diminuer le volume : résultat volume à fond. »
 * Sur une zone en PURE avec « Forcer à 100 % », le serveur transformait toute
 * consigne de volume en un ordre à 100 %. Il la REFUSE désormais (rien ne part
 * vers l'appareil). Reste le côté client : le curseur n'aurait jamais dû être
 * libre. `volumeLocked` vient d'une lecture faite au changement de zone ; PURE
 * armé depuis un autre client (appli, autre onglet) ou une lecture en échec
 * (`refreshAudiophile` rend alors « pas de PURE ») le laissent déverrouillé.
 *
 * Quand le serveur refuse une consigne de volume, on relit donc l'état PURE de
 * la zone : le curseur se grise si le verrou est armé, et on le dit.
 */

export interface DependancesRefusDeVolume {
  /** La commande au serveur (`PUT /zones/{id}/volume`). */
  envoyer: (zoneId: number, volume: number) => Promise<unknown>;
  /** Relit PURE et le verrou de la zone (`refreshAudiophile`). */
  relireVerrou: (zoneId: number) => Promise<void>;
  /** Le verrou tel qu'il est APRÈS la relecture. */
  verrouille: () => boolean;
  /** Ce qu'on dit à l'auditeur quand le verrou explique le refus. */
  direVerrou: () => void;
}

/** Envoie la consigne ; sur refus, relit le verrou et le dit s'il est armé.
 *  Ne rejette jamais : un curseur ne doit pas laisser de promesse orpheline. */
export async function envoyerVolumeOuReverrouiller(
  zoneId: number,
  volume: number,
  deps: DependancesRefusDeVolume,
): Promise<boolean> {
  try {
    await deps.envoyer(zoneId, volume);
    return true;
  } catch {
    try {
      await deps.relireVerrou(zoneId);
    } catch {
      return false;
    }
    if (deps.verrouille()) deps.direVerrou();
    return false;
  }
}
