/**
 * Paires stéréo — deux zones, une voie chacune.
 *
 * POURQUOI CE FICHIER EXISTE. Le client actuel déduit gauche et droite de
 * l'ordre d'insertion dans un `Set` de sélection : `Array.from(selectedZoneIds)`
 * donne `[gauche, droite]`, et cet ordre n'est écrit nulle part à l'écran.
 * Se tromper de voie ne provoque aucune erreur — la scène stéréo est
 * simplement inversée, et rien ne le dit. Un défaut qu'on n'entend qu'en
 * connaissant l'enregistrement.
 *
 * La règle vit donc ici, hors du composant, pour être éprouvable : quelle
 * zone tient la voie gauche est une décision, pas un effet de bord de l'ordre
 * de clic.
 */
import type { Zone } from './types';

/** Ce que `POST /zones/stereo-pair` attend : un nom et DEUX identifiants d'appareil. */
export interface ParametresPaire {
  nom: string;
  appareilGauche: string;
  appareilDroit: string;
}

/**
 * Zones qu'on peut encore appairer.
 *
 * DLNA seulement — c'est la contrainte du client actuel, et elle tient : le
 * serveur ne sait découper les voies que sur deux renderers qu'il pilote
 * séparément. Une zone sans appareil n'a rien à appairer, une zone déjà
 * appairée tient déjà une voie.
 */
export function zonesAppairables(zones: readonly Zone[]): Zone[] {
  return zones.filter(
    (z) => z.output_type === 'dlna' && !!z.output_device_id && !z.stereo_pair_id,
  );
}

/**
 * Traduit un choix de l'écran en paramètres d'appel, ou `null` si le choix
 * n'est pas appairable.
 *
 * L'ORDRE EST PORTÉ PAR LES ARGUMENTS, jamais déduit : `idGauche` tient la
 * voie gauche, quel que soit l'ordre dans lequel l'écran a été rempli.
 */
export function parametresPaire(
  zones: readonly Zone[],
  idGauche: number | null,
  idDroite: number | null,
  nom: string,
): ParametresPaire | null {
  const titre = nom.trim();
  if (!titre) return null;
  // Une zone ne peut pas tenir les deux voies : le serveur créerait une paire
  // dont les deux moitiés pointent le même appareil, et la lecture y perdrait
  // une voie sur deux sans rien signaler.
  if (idGauche == null || idDroite == null || idGauche === idDroite) return null;

  const appairables = zonesAppairables(zones);
  const gauche = appairables.find((z) => z.id === idGauche);
  const droite = appairables.find((z) => z.id === idDroite);
  if (!gauche?.output_device_id || !droite?.output_device_id) return null;

  return {
    nom: titre,
    appareilGauche: gauche.output_device_id,
    appareilDroit: droite.output_device_id,
  };
}

/** Voie tenue par cette zone dans les paires connues, s'il y en a une. */
export function voieDeLaZone(
  paires: readonly { left_zone: { id?: number | null } | null; right_zone: { id?: number | null } | null }[],
  zoneId: number | null | undefined,
): 'left' | 'right' | null {
  if (zoneId == null) return null;
  for (const p of paires) {
    if (p.left_zone?.id === zoneId) return 'left';
    if (p.right_zone?.id === zoneId) return 'right';
  }
  return null;
}
