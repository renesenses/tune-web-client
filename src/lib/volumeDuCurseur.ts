/**
 * La valeur qu'un CURSEUR de volume peut réellement poser, quelle que soit
 * l'interface (curseur de Tune `VolumeControl`, barre de Nocturne…).
 *
 * Sécurité auditive (28/11/2026) : un seul calcul, partagé, pour que toutes
 * les interfaces bornent le geste de la même façon que le serveur :
 * - plafond de la zone : `min(sécurité, max(confort, actuel))` — au-dessus
 *   du confort, le curseur ne fait plus monter (seuls les boutons le font,
 *   par pas) ; la sécurité borne tout (`limitesVolume`) ;
 * - grille de la sortie (pas, min et max annoncés), et refus d'une sortie
 *   qui ne se commande pas (`normaliserVolumeSortie` rend `null`).
 *
 * `brut` et `actuel` sont des positions du curseur (fractions 0..1).
 * `null` = rien à envoyer.
 */
import { normaliserVolumeSortie } from './capacitesVolumeSortie';
import { bornerCurseur, plafondDuCurseur } from './limitesVolume';

type ZoneDuCurseur = Parameters<typeof normaliserVolumeSortie>[0] & Parameters<typeof plafondDuCurseur>[0];

export function volumeDuCurseur(zone: ZoneDuCurseur, brut: number, actuel: number): number | null {
  return normaliserVolumeSortie(zone, bornerCurseur(zone, brut, actuel), plafondDuCurseur(zone, actuel));
}
