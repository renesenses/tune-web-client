/**
 * Les zones que propose le sélecteur de la barre de lecture — #1272, #1345, #1664.
 *
 * Ludovic Audouin, v0.9.156, 19/09/2026 : la zone Diretta « dCS Vivaldi
 * Upsampler Plus USB », zone par défaut ET en cours de lecture, n'apparaissait
 * pas dans la liste des zones de la barre de lecture. La zone « LVDS », elle,
 * y était.
 *
 * Le sélecteur ne gardait qu'UNE zone par `output_device_id` (`2fe77a3e`, juin
 * 2026 : des centaines de zones en double figeaient l'écran) : la PREMIÈRE de
 * la liste, quelle qu'elle soit. #1272 puis #1345 ont changé QUI survit au
 * tri — la zone pilotée, puis celle qui joue. Patatorz, fil 1860, 27/09/2026,
 * après la livraison des deux : « Non toujours pas réglé ».
 *
 * ## #1664 — ce n'est pas le choix du survivant, c'est le fait qu'il y en ait un
 *
 * Deux correctifs ont réordonné un tri sans jamais demander si ce tri avait
 * lieu d'être. Il n'en a pas : `output_device_id` n'est pas la relation
 * « même appareil », et ne l'a jamais été.
 *
 * - Le serveur, lui, sait dire quand deux zones désignent le même appareil, et
 *   il le publie (`/system/diagnostics`, `zones_doublons`). Sa clé
 *   (`tune-server-rust`, `routes/system/diagnostics.rs`, `cle_appareil`) n'est
 *   justement PAS l'égalité des `output_device_id` : un Sonos annonce TROIS
 *   UDN pour une seule enceinte (racine, `_MR`, `_MS`), donc trois zones à
 *   trois `output_device_id` DIFFÉRENTS — que ce tri-ci ne regroupe pas. Et
 *   pour une sortie sans identité réseau, Diretta comprise, cette clé rend
 *   `None` : le serveur ne déclare jamais ces zones-là doublons.
 * - Côté Diretta, deux Targets logiques d'un même boîtier reçoivent des
 *   identifiants DISTINCTS — `diretta:{adresse}-{nom}` — et c'est délibéré :
 *   l'index de découverte n'étant pas stable, deux cibles ont échangé leurs
 *   rangs entre deux passes et un `POST /zones` s'est raccroché à la mauvaise
 *   zone (mesuré le 23/08/2026 sur le DDC-0 à deux cibles, LVDS + le port USB
 *   qui alimente le dCS Vivaldi).
 *
 * Bref : le tri retirait des lignes qu'il n'aurait jamais dû retirer, et ne
 * retirait pas celles pour lesquelles il avait été écrit. Le vrai garde-fou
 * contre le figeage de juin, c'est le PLAFOND de cinquante lignes, et il
 * reste.
 *
 * ## La règle, désormais
 *
 * On ne regroupe que ce que l'utilisateur ne peut pas distinguer : même
 * `output_device_id` ET même nom. Deux zones qu'il voit sous deux noms sont
 * deux lignes, toujours — aucune zone nommée ne disparaît en silence de la
 * barre alors que la page Zones l'affiche (les deux lisent le MÊME magasin
 * `zones`, c'est bien ce seul tri qui faisait l'écart).
 *
 * Le cas de juin est intact : des centaines de zones nées de la redécouverte
 * du même appareil portent le même nom que lui, elles se regroupent comme
 * avant ; et, quoi qu'il arrive, le plafond borne la liste.
 *
 * Dans un groupe, l'appareil est représenté par la zone la plus significative,
 * à la place qu'occupait le groupe (la liste ne saute pas) :
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
  /** Le nom AFFICHÉ : c'est par lui que l'utilisateur distingue deux zones. */
  name?: string | null;
  /** `playing` / `paused` : une écoute en cours. */
  state?: string | null;
  is_default?: boolean | null;
}

/** Une écoute en cours — la pause en fait partie : elle reprend d'un clic. */
function ecouteEnCours(z: ZoneDuSelecteur): boolean {
  return z.state === 'playing' || z.state === 'paused';
}

/**
 * La clé de regroupement, ou `null` quand la zone ne se regroupe avec personne.
 *
 * L'appareil ET le nom, parce que seul le second est ce que l'utilisateur lit.
 * Le séparateur est un octet nul : aucun nom ni identifiant ne le contient, là
 * où un `:` ou un `-` laisserait deux couples différents produire la même clé.
 */
export function cleDeGroupe(z: ZoneDuSelecteur): string | null {
  const appareil = (z.output_device_id ?? '').trim();
  if (!appareil) return null;
  return `${appareil}\u0000${(z.name ?? '').trim().toLowerCase()}`;
}

/**
 * Rang de représentation d'une zone dans son groupe : plus il est petit, plus
 * la zone mérite la ligne. Voir l'ordre en tête de fichier.
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

/** Plafond historique du menu (`2fe77a3e`) — le vrai garde-fou du figeage. */
export const PLAFOND_ZONES_SELECTEUR = 50;

export function zonesDuSelecteur<Z extends ZoneDuSelecteur>(
  zones: readonly Z[] | null | undefined,
  zonePiloteeId: number | null | undefined,
  plafond: number = PLAFOND_ZONES_SELECTEUR,
): Z[] {
  const liste = zones ?? [];

  // Le représentant de chaque groupe, choisi par rang — à égalité, la première
  // rencontrée gagne, ce qui garde le comportement d'origine quand aucune zone
  // ne se distingue.
  const representant = new Map<string, Z>();
  for (const z of liste) {
    const cle = cleDeGroupe(z);
    if (!cle) continue;
    const tenant = representant.get(cle);
    if (
      !tenant ||
      rangDeRepresentation(z, zonePiloteeId) < rangDeRepresentation(tenant, zonePiloteeId)
    ) {
      representant.set(cle, z);
    }
  }

  const vus = new Set<string>();
  const rendu: Z[] = [];
  for (const z of liste) {
    const cle = cleDeGroupe(z);
    if (!cle) {
      rendu.push(z);
      continue;
    }
    if (vus.has(cle)) continue;
    vus.add(cle);
    // Le groupe garde la place qu'occupait sa première zone : la liste ne
    // saute pas, seul le nom affiché change.
    rendu.push(representant.get(cle) ?? z);
  }

  if (rendu.length <= plafond) return rendu;
  const coupe = rendu.slice(0, plafond);
  if (plafond > 0) {
    // Ni la zone pilotée, ni une zone qui joue ne peuvent tomber sous le
    // plafond : ce sont justement celles qu'on cherche du regard. On les prend
    // dans `rendu` et non dans la liste d'origine — une zone écartée par le
    // regroupement n'a pas de ligne à sauver, et la repêcher en écraserait une
    // autre pour rien.
    const pilotee = zonePiloteeId == null ? undefined : rendu.find((z) => z.id === zonePiloteeId);
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
