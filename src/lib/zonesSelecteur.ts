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
 * #1345 — le même testeur, en v0.9.158 : la zone dCS reste invisible. Le
 * correctif ne couvrait que la zone PILOTÉE, et il pilotait le Serenade. Le
 * groupe Diretta retombait donc sur « la première de la liste », c'est-à-dire
 * LVDS — pendant que la zone dCS, par défaut, JOUAIT.
 *
 * La règle, désormais. Une zone par appareil, comme avant ; une zone sans
 * appareil n'est jamais regroupée ; et dans un groupe, l'appareil est
 * représenté par la zone la plus significative, à la place qu'occupait le
 * groupe (la liste ne saute pas) :
 *
 * 1. la zone PILOTÉE ;
 * 2. sinon celle qui JOUE (ou qui est en pause — c'est une écoute en cours) ;
 * 3. sinon la zone PAR DÉFAUT ;
 * 4. sinon la première, comme avant.
 *
 * Le plafond de cinquante lignes ne peut exclure ni la zone pilotée, ni une
 * zone qui joue.
 */

export interface ZoneDuSelecteur {
  id: number | null;
  output_device_id?: string | null;
  /** `playing` / `paused` : une écoute en cours. */
  state?: string | null;
  is_default?: boolean | null;
}

/** Une écoute en cours — la pause en fait partie : elle reprend d'un clic. */
function ecouteEnCours(z: ZoneDuSelecteur): boolean {
  return z.state === 'playing' || z.state === 'paused';
}

/**
 * Rang de représentation d'une zone dans son groupe d'appareil : plus il est
 * petit, plus la zone mérite la ligne. Voir l'ordre en tête de fichier.
 */
export function rangDeRepresentation(
  z: ZoneDuSelecteur,
  zonePiloteeId: number | null | undefined,
): number {
  if (zonePiloteeId != null && z.id === zonePiloteeId) return 0;
  if (ecouteEnCours(z)) return 1;
  if (z.is_default) return 2;
  return 3;
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

  // Le représentant de chaque appareil, choisi par rang — à égalité, la
  // première rencontrée gagne, ce qui garde le comportement d'origine quand
  // aucune zone ne se distingue.
  const representant = new Map<string, Z>();
  for (const z of liste) {
    const appareil = z.output_device_id || null;
    if (!appareil) continue;
    const tenant = representant.get(appareil);
    if (
      !tenant ||
      rangDeRepresentation(z, zonePiloteeId) < rangDeRepresentation(tenant, zonePiloteeId)
    ) {
      representant.set(appareil, z);
    }
  }

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
    // L'appareil garde la place qu'occupait sa première zone : la liste ne
    // saute pas, seul le nom affiché change.
    rendu.push(representant.get(appareil) ?? z);
  }

  if (rendu.length <= plafond) return rendu;
  const coupe = rendu.slice(0, plafond);
  if (plafond > 0) {
    // Ni la zone pilotée, ni une zone qui joue ne peuvent tomber sous le
    // plafond : ce sont justement celles qu'on cherche du regard.
    const aSauver = [pilotee, rendu.find((z) => ecouteEnCours(z))].filter(
      (z): z is Z => !!z && !coupe.includes(z),
    );
    for (const [i, z] of aSauver.entries()) {
      const place = plafond - 1 - i;
      if (place >= 0) coupe[place] = z;
    }
  }
  return coupe;
}
