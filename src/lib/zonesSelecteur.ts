/**
 * Les zones que propose le sélecteur de la barre de lecture — #1272.
 *
 * Ludovic Audouin, v0.9.156, 19/09/2026 : la zone Diretta « dCS Vivaldi
 * Upsampler Plus USB », zone par défaut ET en cours de lecture, n'apparaissait
 * pas dans la liste des zones de la barre de lecture. La zone « LVDS », elle,
 * y était.
 *
 * Le sélecteur ne garde qu'UNE zone par appareil de sortie (`2fe77a3e`, juin
 * 2026 : des centaines de zones en double figeaient l'écran). Mais il gardait
 * la PREMIÈRE de la liste, quelle qu'elle soit : quand deux zones visent le
 * même `output_device_id`, la zone pilotée pouvait disparaître de son propre
 * sélecteur, pendant que le compteur de l'en-tête (`$zones.length`) comptait
 * encore la zone masquée.
 *
 * La règle, désormais :
 * - une zone par appareil, comme avant ;
 * - dans un groupe qui la contient, c'est la zone PILOTÉE qui représente
 *   l'appareil, à la place qu'occupait le groupe ;
 * - le plafond de cinquante lignes ne peut pas l'exclure non plus ;
 * - une zone sans appareil n'est jamais regroupée.
 */

export interface ZoneDuSelecteur {
  id: number | null;
  output_device_id?: string | null;
}

/** Plafond historique du menu (`2fe77a3e`). */
export const PLAFOND_ZONES_SELECTEUR = 50;

export function zonesDuSelecteur<Z extends ZoneDuSelecteur>(
  zones: readonly Z[] | null | undefined,
  zonePiloteeId: number | null | undefined,
  plafond: number = PLAFOND_ZONES_SELECTEUR,
): Z[] {
  const liste = zones ?? [];
  const pilotee = zonePiloteeId == null ? undefined : liste.find((z) => z.id === zonePiloteeId);
  const appareilPilote = pilotee?.output_device_id || null;

  const vus = new Set<string>();
  const rendu: Z[] = [];
  for (const z of liste) {
    const appareil = z.output_device_id || null;
    if (!appareil) {
      rendu.push(z);
      continue;
    }
    if (vus.has(appareil)) continue;
    vus.add(appareil);
    // Le groupe de la zone pilotée est représenté par ELLE, à la place du
    // groupe (celle de sa première zone) : la liste ne saute pas.
    rendu.push(appareil === appareilPilote && pilotee ? pilotee : z);
  }

  if (rendu.length <= plafond) return rendu;
  const coupe = rendu.slice(0, plafond);
  if (pilotee && !coupe.includes(pilotee) && plafond > 0) {
    coupe[plafond - 1] = pilotee;
  }
  return coupe;
}
