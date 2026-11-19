/**
 * Le dossier de données du serveur survit-il à la recréation du conteneur ?
 * — tune-server-rust#8747 (fil 2798, Synology « Image › Mettre à jour »).
 *
 * Dans l'image Docker, tout l'état de Tune (base, réglages, jetons des
 * services) vit dans `/data`. Sans dossier de l'hôte ni volume nommé monté
 * dessus, Docker y met un volume ANONYME : un conteneur recréé (mise à jour de
 * l'image comprise) repart sur une base neuve, sans rien dire.
 *
 * Le serveur le détecte au démarrage et le publie dans `GET /system/env` :
 * `data_persistence: {dir, kind, persistent}` (`null` hors conteneur, absent
 * sur un serveur plus ancien). Ce module dit s'il faut montrer le bandeau.
 */

export interface PersistanceDonnees {
  dir: string;
  kind: 'host_dir' | 'named_volume' | 'anonymous_volume' | 'not_mounted' | 'tmpfs' | string;
  persistent: boolean;
}

/** Le dossier à signaler, ou `null` : rien à dire (persistant, hors conteneur, serveur ancien). */
export function donneesNonPersistantes(
  env: { data_persistence?: PersistanceDonnees | null } | null | undefined,
): PersistanceDonnees | null {
  const p = env?.data_persistence;
  if (!p || typeof p !== 'object') return null;
  if (p.persistent !== false) return null;
  if (typeof p.dir !== 'string' || !p.dir.trim()) return null;
  return p;
}
