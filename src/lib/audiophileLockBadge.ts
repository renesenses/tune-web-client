/// Badge de verrou de volume affiché sur la carte d'un appareil (#2395, #2506).
///
/// Le verrou de volume du mode Audiophile a DEUX réglages : un défaut global
/// (Réglages → Général → Lecture) et une surcharge par zone. La carte de
/// l'appareil ne disait rien de tout cela : l'utilisateur qui regardait « son »
/// Denon ne pouvait pas savoir lequel des deux le concernait. C'est ce silence
/// qui a coûté un long échange avec un testeur.
///
/// Ce module tient la SEULE décision du badge, et il la tient à part du
/// composant pour qu'elle soit vérifiable pièce par pièce. Le coût d'erreur est
/// matériel : un badge qui annoncerait « non verrouillé » sur une zone qui part
/// à 100 % serait pire que pas de badge du tout.
///
/// Règle : on n'affiche QUE ce que le serveur a résolu lui-même.
/// `effective_lock_volume` est calculé côté serveur par
/// `volume_lock_override(zone).unwrap_or(global)` — c'est-à-dire l'héritage
/// déjà appliqué. On ne le recalcule pas ici, et surtout on ne le devine pas à
/// partir de `lock_volume` + du store global du client : ce serait une seconde
/// implémentation de l'héritage, donc une seconde occasion de mentir.

/** État du verrou tel qu'un serveur ≥ 0.9.127 le rend pour une zone. */
export interface VolumeLockState {
  /** Surcharge de la zone : `null`/absent = héritage du réglage général. */
  lock_volume?: boolean | null;
  /** Valeur RÉELLEMENT appliquée, héritage résolu par le serveur. */
  effective_lock_volume?: boolean;
}

export interface VolumeLockBadge {
  /** Ce qui s'applique vraiment à cette zone. Jamais une valeur brute. */
  locked: boolean;
  /** `true` : la zone suit le réglage général. `false` : elle a le sien. */
  inherited: boolean;
}

/**
 * Décide ce que le badge affiche — ou qu'il ne s'affiche pas.
 *
 * Renvoie `null` quand l'état effectif n'est pas connu de façon certaine :
 * état absent (requête en vol ou en échec) ou serveur antérieur qui ne publie
 * pas `effective_lock_volume`. Se taire est le seul repli acceptable ; il n'y
 * en a pas d'autre, parce que toute valeur de repli serait une invention.
 */
export function volumeLockBadge(
  state: VolumeLockState | null | undefined,
): VolumeLockBadge | null {
  if (!state) return null;
  if (typeof state.effective_lock_volume !== 'boolean') return null;
  return {
    locked: state.effective_lock_volume,
    // `lock_volume` absent OU `null` : dans les deux cas la zone n'a pas de
    // réglage propre. `== null` couvre les deux, `=== null` en manquerait un.
    inherited: state.lock_volume == null,
  };
}

/** Clé i18n de l'état du verrou. Lue de `locked`, jamais de `lock_volume`. */
export function volumeLockLabelKey(badge: VolumeLockBadge): string {
  return badge.locked ? 'devices.volumeLockOn' : 'devices.volumeLockOff';
}

/** Clé i18n de la provenance du réglage : héritage ou surcharge de zone. */
export function volumeLockOriginKey(badge: VolumeLockBadge): string {
  return badge.inherited ? 'devices.volumeLockInherited' : 'devices.volumeLockOwn';
}
