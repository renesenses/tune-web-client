import type { SmbMount } from './api';

/**
 * Ce qu'il faut afficher pour un partage SMB.
 *
 * Extrait du gabarit pour une raison précise : c'est ici que se joue la
 * distinction qui a coûté #1916, et un gabarit ne se teste pas.
 *
 * ## `active` n'est PAS `mounted`
 *
 * - `active`      : l'INTENTION de l'utilisateur — « ce partage doit être monté » ;
 * - `mount_state` : le CONSTAT du dernier essai au démarrage ;
 * - `mounted`     : vérifié à l'instant sur le système de fichiers.
 *
 * Avant la v0.9.91, seul `active` existait. L'interface affichait donc les
 * partages d'Éric (`ricouxxx`) comme montés alors que leur remontage avait
 * échoué : la bibliothèque s'affichait — les pistes sont en base — et seule la
 * lecture échouait, sur une erreur réseau qui ne nommait jamais la cause. Il a
 * trouvé le contournement seul, sur un forum public.
 *
 * **Dériver l'état affiché de `active` rouvrirait ce défaut.** C'est ce que ce
 * module et ses tests empêchent.
 */
export interface EtatPartage {
  /** Le partage n'est pas monté, quelle que soit l'intention. */
  enEchec: boolean;
  /** Afficher le badge « SMB 1.0 » — protocole obsolète et non chiffré. */
  signalerSmb1: boolean;
  /** La cause à montrer, ou `null` s'il n'y a rien d'utile à dire. */
  cause: string | null;
}

export function etatPartage(m: SmbMount): EtatPartage {
  // `mounted` est le constat de l'instant : il prime sur `mount_state`, qui
  // date du dernier essai. Un NAS rallumé et remonté à la main doit apparaître
  // monté, même si le démarrage s'était soldé par un échec.
  const enEchec = !m.mounted;

  return {
    enEchec,
    signalerSmb1: m.smb_version === '1.0',
    // Une cause n'a de sens que sur un partage en échec. L'afficher sur un
    // partage qui marche montrerait une erreur périmée — celle d'un essai que
    // le suivant a réparé.
    cause: enEchec && m.last_mount_error ? m.last_mount_error : null,
  };
}
